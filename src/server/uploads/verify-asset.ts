import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import type { ProductAsset } from "@/schemas/product-asset";
import { recordAuditEvent } from "@/server/audit";
import type { Db } from "@/server/db";
import { productAssets } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { NotFoundError, ValidationError } from "@/server/errors";
import { toProductAsset } from "@/server/products/mappers";
import { readObject, removeObject, writeObject } from "@/server/storage";
import { sniffMatchesDeclared, sniffType } from "./magic-bytes";
import { MAX_FILE_BYTES } from "./rules";
import { sanitizeImage } from "./sanitize-image";

export type VerifyScope = {
  orgId: string;
  productId: string;
  assetId: string;
  actorId: string;
};

// Runs after the client has PUT the bytes to storage. Checks what the bytes
// really are, strips EXIF, and records the hash. A file that fails is deleted
// from storage along with its row, so the user can upload a replacement.
export async function verifyUploadedAsset(
  db: Db,
  scope: VerifyScope,
): Promise<ProductAsset> {
  const [row] = await db
    .select()
    .from(productAssets)
    .where(
      and(
        withOrg(productAssets, scope.orgId),
        eq(productAssets.id, scope.assetId),
        eq(productAssets.productId, scope.productId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError("Asset not found");
  }
  if (row.verifiedAt) {
    return toProductAsset(row);
  }

  try {
    const bytes = await readObject(row.storageKey).catch(() => {
      throw new ValidationError("The file has not been uploaded yet");
    });
    const verified = await checkAndPrepare(
      bytes,
      row.kind,
      row.mimeType,
      row.sizeBytes,
    );

    if (verified.bytes !== bytes) {
      await writeObject(row.storageKey, verified.bytes, verified.contentType);
    }

    const [updated] = await db
      .update(productAssets)
      .set({
        sha256: verified.sha256,
        sizeBytes: verified.bytes.byteLength,
        width: verified.width,
        height: verified.height,
        exifStripped: verified.exifStripped,
        verifiedAt: new Date().toISOString(),
      })
      .where(eq(productAssets.id, row.id))
      .returning();
    if (!updated) {
      throw new NotFoundError("Asset not found");
    }

    await recordAuditEvent(db, {
      orgId: scope.orgId,
      actorId: scope.actorId,
      action: "product.asset_uploaded",
      entityType: "product",
      entityId: scope.productId,
      metadata: {
        assetId: row.id,
        kind: row.kind,
        sizeBytes: verified.bytes.byteLength,
      },
    });
    return toProductAsset(updated);
  } catch (error) {
    await discardRejectedUpload(db, scope, row.id, row.storageKey);
    throw error;
  }
}

async function checkAndPrepare(
  bytes: Uint8Array,
  kind: "image" | "document",
  declaredMime: string,
  declaredSize: number,
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  sha256: string;
  width: number | null;
  height: number | null;
  exifStripped: boolean;
}> {
  if (bytes.byteLength !== declaredSize) {
    throw new ValidationError("Uploaded size does not match the declared size");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
    throw new ValidationError("File size is outside the allowed range");
  }
  const sniffed = sniffType(bytes);
  if (!sniffed || !sniffMatchesDeclared(sniffed, declaredMime)) {
    throw new ValidationError("File contents do not match its type");
  }

  if (kind === "image") {
    const image = await sanitizeImage(bytes);
    return {
      bytes: image.bytes,
      contentType: image.mimeType,
      sha256: image.sha256,
      width: image.width,
      height: image.height,
      exifStripped: true,
    };
  }

  return {
    bytes,
    contentType: declaredMime,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: null,
    height: null,
    exifStripped: false,
  };
}

async function discardRejectedUpload(
  db: Db,
  scope: VerifyScope,
  assetId: string,
  storageKey: string,
): Promise<void> {
  await db
    .delete(productAssets)
    .where(
      and(withOrg(productAssets, scope.orgId), eq(productAssets.id, assetId)),
    );
  // A cleanup failure must not hide the original rejection, which the caller rethrows.
  await removeObject(storageKey).catch((error: unknown) => {
    logger.warn(
      { err: error, orgId: scope.orgId, productId: scope.productId, assetId },
      "asset cleanup failed",
    );
  });
}
