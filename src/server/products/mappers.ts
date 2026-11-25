import type { Product } from "@/schemas/product";
import type { ProductAsset } from "@/schemas/product-asset";
import type { productAssets, products } from "@/server/db/schema";

type ProductRow = typeof products.$inferSelect;
type AssetRow = typeof productAssets.$inferSelect;

import { toIso, toIsoOrNull } from "./iso";

// DB rows use snake_case columns; the API and UI use camelCase (schemas/).
export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    name: row.name,
    status: row.status,
    ingestedAt: toIsoOrNull(row.ingestedAt),
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toProductAsset(row: AssetRow): ProductAsset {
  return {
    id: row.id,
    orgId: row.orgId,
    productId: row.productId,
    kind: row.kind,
    storageKey: row.storageKey,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    exifStripped: row.exifStripped,
    parsedText: row.parsedText,
    sortOrder: row.sortOrder,
    verifiedAt: toIsoOrNull(row.verifiedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}
