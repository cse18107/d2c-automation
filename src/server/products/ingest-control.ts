import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { IngestJob } from "@/schemas/ingest";
import type { Product } from "@/schemas/product";
import { recordAuditEvent } from "@/server/audit";
import type { Db } from "@/server/db";
import { ingestJobs, products } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { ConflictError } from "@/server/errors";
import { toIngestJob } from "./ingest-mapper";
import { toProduct } from "./mappers";
import { assertTransition } from "./product-status";
import { type Actor, loadProductRow } from "./service";

// Cancel stops an active run. The worker re-reads the job before each step and
// stops when it sees "cancelled", so a cancel always wins over a late success.
export async function cancelActiveIngest(
  db: Db,
  actor: Actor,
  productId: string,
): Promise<Product> {
  const product = await loadProductRow(db, actor, productId);
  if (product.status !== "processing") {
    throw new ConflictError(
      "Only a product that is processing can be cancelled",
    );
  }

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({ id: ingestJobs.id })
      .from(ingestJobs)
      .where(
        and(
          withOrg(ingestJobs, actor.orgId),
          eq(ingestJobs.productId, productId),
          inArray(ingestJobs.status, ["queued", "running"]),
        ),
      )
      .orderBy(desc(ingestJobs.createdAt))
      .limit(1);
    if (!job) throw new ConflictError("No active ingest job to cancel");

    await tx
      .update(ingestJobs)
      .set({ status: "cancelled" })
      .where(and(withOrg(ingestJobs, actor.orgId), eq(ingestJobs.id, job.id)));
    const [updated] = await tx
      .update(products)
      .set({ status: "draft" })
      .where(
        and(
          withOrg(products, actor.orgId),
          eq(products.id, productId),
          eq(products.status, "processing"),
        ),
      )
      .returning();
    await recordAuditEvent(tx, {
      orgId: actor.orgId,
      actorId: actor.userId,
      action: "ingest.cancelled",
      entityType: "product",
      entityId: productId,
      metadata: { jobId: job.id },
    });
    if (!updated)
      throw new ConflictError(
        "The product changed while cancelling; reload and try again",
      );
    return toProduct(updated);
  });
}

// "Back to draft" after a failed run, so the user can change the uploads.
export async function returnToDraft(
  db: Db,
  actor: Actor,
  productId: string,
): Promise<Product> {
  const product = await loadProductRow(db, actor, productId);
  assertTransition(product.status, "draft");
  const [updated] = await db
    .update(products)
    .set({ status: "draft" })
    .where(
      and(
        withOrg(products, actor.orgId),
        eq(products.id, productId),
        eq(products.status, product.status),
      ),
    )
    .returning();
  if (!updated)
    throw new ConflictError("The product changed; reload and try again");
  return toProduct(updated);
}

// Latest ingest job for a product, used by the processing screen to show steps.
export async function getLatestIngest(
  db: Db,
  actor: Actor,
  productId: string,
): Promise<IngestJob | null> {
  await loadProductRow(db, actor, productId);
  const [row] = await db
    .select()
    .from(ingestJobs)
    .where(
      and(
        withOrg(ingestJobs, actor.orgId),
        eq(ingestJobs.productId, productId),
      ),
    )
    .orderBy(desc(ingestJobs.createdAt))
    .limit(1);
  return row ? toIngestJob(row) : null;
}
