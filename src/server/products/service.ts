import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { v7 } from "uuid";
import { logger } from "@/lib/logger";
import type { ListProductsQuery, ProductListItem } from "@/schemas/api";
import type { IngestJob } from "@/schemas/ingest";
import type {
  CreateProductInput,
  Product,
  ProductStatus,
} from "@/schemas/product";
import type { ProductAsset } from "@/schemas/product-asset";
import { recordAuditEvent } from "@/server/audit";
import type { Db } from "@/server/db";
import {
  brands,
  ingestJobs,
  productAssets,
  products,
} from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import {
  ConflictError,
  NotFoundError,
  TransientError,
  ValidationError,
} from "@/server/errors";
import { enqueueIngest } from "@/server/jobs";
import { removeObject } from "@/server/storage";
import { toIngestJob } from "./ingest-mapper";
import { toProduct, toProductAsset } from "./mappers";
import { assertTransition } from "./product-status";

export type Actor = { orgId: string; userId: string };

const DEFAULT_BRAND_SLUG = "default";

// Products belong to a brand. Step 01 has no brand UI, so each org gets one default brand.
async function ensureDefaultBrand(db: Db, orgId: string): Promise<string> {
  const [existing] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(withOrg(brands, orgId), eq(brands.slug, DEFAULT_BRAND_SLUG)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(brands)
    .values({
      id: v7(),
      orgId,
      name: "Default brand",
      slug: DEFAULT_BRAND_SLUG,
    })
    .returning({ id: brands.id });
  if (!created) throw new Error("Failed to create the default brand");
  return created.id;
}

export async function loadProductRow(db: Db, actor: Actor, productId: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(and(withOrg(products, actor.orgId), eq(products.id, productId)))
    .limit(1);
  if (!row) throw new NotFoundError("Product not found");
  return row;
}

export async function createProduct(
  db: Db,
  actor: Actor,
  input: CreateProductInput,
): Promise<Product> {
  const brandId = await ensureDefaultBrand(db, actor.orgId);
  const [row] = await db
    .insert(products)
    .values({
      id: v7(),
      orgId: actor.orgId,
      brandId,
      name: input.name,
      status: "draft",
      createdBy: actor.userId,
    })
    .returning();
  if (!row) throw new Error("Failed to create the product");

  await recordAuditEvent(db, {
    orgId: actor.orgId,
    actorId: actor.userId,
    action: "product.created",
    entityType: "product",
    entityId: row.id,
    metadata: { name: row.name },
  });
  return toProduct(row);
}

// Lists products with a summary of their verified files (photo count and the
// document name), so the table needs one extra query rather than one per row.
export async function listProducts(
  db: Db,
  actor: Actor,
  query: ListProductsQuery,
): Promise<ProductListItem[]> {
  const filters = [withOrg(products, actor.orgId)];
  if (query.status) filters.push(eq(products.status, query.status));
  const rows = await db
    .select()
    .from(products)
    .where(and(...filters))
    .orderBy(desc(products.updatedAt))
    .limit(query.limit);
  if (rows.length === 0) return [];

  const assets = await db
    .select({
      productId: productAssets.productId,
      kind: productAssets.kind,
      originalFilename: productAssets.originalFilename,
      verifiedAt: productAssets.verifiedAt,
    })
    .from(productAssets)
    .where(
      and(
        withOrg(productAssets, actor.orgId),
        inArray(
          productAssets.productId,
          rows.map((r) => r.id),
        ),
      ),
    );

  return rows.map((row) => {
    const verified = assets.filter(
      (a) => a.productId === row.id && a.verifiedAt !== null,
    );
    const document = verified.find((a) => a.kind === "document");
    return {
      ...toProduct(row),
      imageCount: verified.filter((a) => a.kind === "image").length,
      documentName: document?.originalFilename ?? null,
    };
  });
}

export async function getProductDetail(
  db: Db,
  actor: Actor,
  productId: string,
): Promise<{ product: Product; assets: ProductAsset[] }> {
  const row = await loadProductRow(db, actor, productId);
  const assets = await db
    .select()
    .from(productAssets)
    .where(
      and(
        withOrg(productAssets, actor.orgId),
        eq(productAssets.productId, productId),
      ),
    )
    .orderBy(productAssets.sortOrder, productAssets.createdAt);
  return {
    product: toProduct(row),
    // Rows still waiting for their upload to be verified are not shown.
    assets: assets.filter((a) => a.verifiedAt !== null).map(toProductAsset),
  };
}

export async function deleteDraftProduct(
  db: Db,
  actor: Actor,
  productId: string,
): Promise<void> {
  const product = await loadProductRow(db, actor, productId);
  if (product.status !== "draft") {
    throw new ConflictError("Only draft products can be deleted");
  }

  const assets = await db
    .select({ storageKey: productAssets.storageKey })
    .from(productAssets)
    .where(
      and(
        withOrg(productAssets, actor.orgId),
        eq(productAssets.productId, productId),
      ),
    );

  await db.transaction(async (tx) => {
    await tx
      .delete(ingestJobs)
      .where(
        and(
          withOrg(ingestJobs, actor.orgId),
          eq(ingestJobs.productId, productId),
        ),
      );
    await tx
      .delete(productAssets)
      .where(
        and(
          withOrg(productAssets, actor.orgId),
          eq(productAssets.productId, productId),
        ),
      );
    await tx
      .delete(products)
      .where(and(withOrg(products, actor.orgId), eq(products.id, productId)));
    await recordAuditEvent(tx, {
      orgId: actor.orgId,
      actorId: actor.userId,
      action: "product.deleted",
      entityType: "product",
      entityId: productId,
      metadata: { assetCount: assets.length },
    });
  });

  // Storage is removed after the rows are gone. A failed delete leaves an orphan
  // object, which is logged for cleanup rather than hiding the successful delete.
  for (const asset of assets) {
    await removeObject(asset.storageKey).catch((error: unknown) => {
      logger.warn(
        { err: error, orgId: actor.orgId, productId },
        "orphaned asset object",
      );
    });
  }
}

// Submit: draft (or failed) → processing, and create one queued ingest job.
// The Idempotency-Key makes retries safe: a repeat returns the same job and
// re-sends the event if the first send failed.
export async function submitForIngest(
  db: Db,
  actor: Actor,
  productId: string,
  idempotencyKey: string,
): Promise<{ job: IngestJob; product: Product; created: boolean }> {
  const existing = await findJobByKey(db, actor, idempotencyKey);
  if (existing) {
    if (existing.productId !== productId) {
      throw new ConflictError(
        "This idempotency key was already used for another product",
      );
    }
    if (existing.status === "queued") {
      await sendEvent(actor, existing.productId, existing.id);
    }
    const row = await loadProductRow(db, actor, productId);
    return {
      job: toIngestJob(existing),
      product: toProduct(row),
      created: false,
    };
  }

  const product = await loadProductRow(db, actor, productId);
  assertTransition(product.status, "processing");
  await assertReadyForIngest(db, actor, productId);

  const job = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(products)
      .set({ status: "processing" })
      .where(
        and(
          withOrg(products, actor.orgId),
          eq(products.id, productId),
          eq(products.status, product.status),
        ),
      )
      .returning();
    if (!updated)
      throw new ConflictError(
        "The product changed while submitting; reload and try again",
      );

    const [created] = await tx
      .insert(ingestJobs)
      .values({
        id: v7(),
        orgId: actor.orgId,
        productId,
        attemptGroup: v7(),
        status: "queued",
        steps: initialSteps(),
        errorCode: null,
        idempotencyKey,
      })
      .returning();
    if (!created) throw new Error("Failed to create the ingest job");

    await recordAuditEvent(tx, {
      orgId: actor.orgId,
      actorId: actor.userId,
      action: "ingest.started",
      entityType: "product",
      entityId: productId,
      metadata: { jobId: created.id },
    });
    return created;
  });

  await sendEvent(actor, productId, job.id);
  const row = await loadProductRow(db, actor, productId);
  return { job: toIngestJob(job), product: toProduct(row), created: true };
}

async function sendEvent(
  actor: Actor,
  productId: string,
  jobId: string,
): Promise<void> {
  try {
    await enqueueIngest({
      orgId: actor.orgId,
      productId,
      jobId,
      actorId: actor.userId,
    });
  } catch (error: unknown) {
    logger.error(
      { err: error, orgId: actor.orgId, productId, jobId },
      "ingest enqueue failed",
    );
    throw new TransientError(
      "Could not start processing. Try again in a moment.",
    );
  }
}

async function assertReadyForIngest(
  db: Db,
  actor: Actor,
  productId: string,
): Promise<void> {
  const assets = await db
    .select({ kind: productAssets.kind, verifiedAt: productAssets.verifiedAt })
    .from(productAssets)
    .where(
      and(
        withOrg(productAssets, actor.orgId),
        eq(productAssets.productId, productId),
        inArray(productAssets.kind, ["image", "document"]),
      ),
    );
  const verified = assets.filter((a) => a.verifiedAt !== null);
  if (!verified.some((a) => a.kind === "image")) {
    throw new ValidationError(
      "Add at least one product photo before processing",
    );
  }
  if (!verified.some((a) => a.kind === "document")) {
    throw new ValidationError("Add the product document before processing");
  }
}

async function findJobByKey(db: Db, actor: Actor, key: string) {
  const [row] = await db
    .select()
    .from(ingestJobs)
    .where(
      and(withOrg(ingestJobs, actor.orgId), eq(ingestJobs.idempotencyKey, key)),
    )
    .limit(1);
  return row ?? null;
}

function initialSteps() {
  return ["load_assets", "parse_document", "finalize"].map((name) => ({
    name,
    status: "pending",
    startedAt: null,
    finishedAt: null,
    error: null,
  }));
}

// Counts for the filter chips. "all" is the org total. One grouped query, no per-chip round trips.
export async function countProductsByStatus(
  db: Db,
  actor: Actor,
): Promise<Record<ProductStatus | "all", number>> {
  const rows = await db
    .select({ status: products.status, value: count() })
    .from(products)
    .where(withOrg(products, actor.orgId))
    .groupBy(products.status);
  const counts: Record<ProductStatus | "all", number> = {
    all: 0,
    draft: 0,
    processing: 0,
    ready_for_review: 0,
    approved: 0,
    published: 0,
    failed: 0,
  };
  for (const row of rows) {
    counts[row.status] = Number(row.value);
    counts.all += Number(row.value);
  }
  return counts;
}
