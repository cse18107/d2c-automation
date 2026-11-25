import { z } from "zod";
import { idSchema, isoDateTimeSchema, orgScopedSchema } from "./common";

export const ASSET_KINDS = ["image", "document"] as const;
export const assetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof assetKindSchema>;

export const productAssetSchema = orgScopedSchema.extend({
  productId: idSchema,
  kind: assetKindSchema,
  storageKey: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  exifStripped: z.boolean(),
  parsedText: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  verifiedAt: isoDateTimeSchema.nullable(),
});
export type ProductAsset = z.infer<typeof productAssetSchema>;
