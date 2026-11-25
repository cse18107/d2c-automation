import "server-only";
import { and, count, eq } from "drizzle-orm";
import { v7 } from "uuid";
import { logger } from "@/lib/logger";
import type { AssetUploadTicket, RequestAssetUploadInput } from "@/schemas/api";
import type { ProductAsset } from "@/schemas/product-asset";
import { recordAuditEvent } from "@/server/audit";
import type { Db } from "@/server/db";
import { productAssets } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { ConflictError } from "@/server/errors";
import {
  buildAssetKey,
  createUploadUrl,
  removeObject,
  SIGNED_URL_TTL_SECONDS,
} from "@/server/storage";
import {
  assertCountAllows,
  extensionOf,
  STORAGE_EXTENSION_BY_MIME,
  validateUploadRequest,
} from "@/server/uploads/rules";
import { verifyUploadedAsset } from "@/server/uploads/verify-asset";
import { type Actor, loadProductRow } from "./service";

function assertDraft(status: string): void {
  if (status !== "draft") {
    throw new ConflictError(
      "Files can only be changed while the product is a draft",
    );
  }
}

// Step 1 of upload: validate the request, reserve a row, and return a
// short-lived signed PUT URL. The bytes go straight to storage.
export async function requestAssetUpload(
  db: Db,
  actor: Actor,
  productId: string,
  input: RequestAssetUploadInput,
): Promise<AssetUploadTicket> {
  const product = await loadProductRow(db, actor, productId);
  assertDraft(product.status);
  validateUploadRequest(input);

  const [{ value: existingCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(productAssets)
    .where(
      and(
        withOrg(productAssets, actor.orgId),
        eq(productAssets.productId, productId),
        eq(productAssets.kind, input.kind),
      ),
    );
  assertCountAllows(input.kind, Number(existingCount));

  const assetId = v7();
  const extension =
    STORAGE_EXTENSION_BY_MIME[input.mimeType] ?? extensionOf(input.filename);
  const storageKey = buildAssetKey(actor.orgId, productId, assetId, extension);
  await db.insert(productAssets).values({
    id: assetId,
    orgId: actor.orgId,
    productId,
    kind: input.kind,
    storageKey,
    originalFilename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256: "",
    exifStripped: false,
    sortOrder: Number(existingCount),
  });

  const uploadUrl = await createUploadUrl({
    key: storageKey,
    contentType: input.mimeType,
    contentLength: input.sizeBytes,
  });
  return {
    assetId,
    uploadUrl,
    expiresAt: new Date(
      Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    ).toISOString(),
  };
}

// Step 2 of upload: the server re-reads the object and checks it.
export async function completeAssetUpload(
  db: Db,
  actor: Actor,
  productId: string,
  assetId: string,
): Promise<ProductAsset> {
  const product = await loadProductRow(db, actor, productId);
  assertDraft(product.status);
  return verifyUploadedAsset(db, {
    orgId: actor.orgId,
    productId,
    assetId,
    actorId: actor.userId,
  });
}

export async function removeAsset(
  db: Db,
  actor: Actor,
  productId: string,
  assetId: string,
): Promise<void> {
  const product = await loadProductRow(db, actor, productId);
  assertDraft(product.status);

  const [row] = await db
    .delete(productAssets)
    .where(
      and(
        withOrg(productAssets, actor.orgId),
        eq(productAssets.id, assetId),
        eq(productAssets.productId, productId),
      ),
    )
    .returning();
  if (!row) return;

  await recordAuditEvent(db, {
    orgId: actor.orgId,
    actorId: actor.userId,
    action: "product.asset_removed",
    entityType: "product",
    entityId: productId,
    metadata: { assetId, kind: row.kind },
  });
  await removeObject(row.storageKey).catch((error: unknown) => {
    logger.warn(
      { err: error, orgId: actor.orgId, productId, assetId },
      "asset object removal failed",
    );
  });
}
