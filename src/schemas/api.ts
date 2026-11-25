import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common";
import { ingestJobSchema } from "./ingest";
import { productSchema, productStatusSchema } from "./product";
import { ASSET_KINDS, productAssetSchema } from "./product-asset";

// Request and response contracts for /api/products (CLAUDE.md §11).
// Each route parses its input with these and validates its output before sending.

export const listProductsQuerySchema = z.object({
  status: productStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const productListItemSchema = productSchema.extend({
  imageCount: z.number().int().nonnegative(),
  documentName: z.string().nullable(),
});
export type ProductListItem = z.infer<typeof productListItemSchema>;

export const productListResponseSchema = z.object({
  items: z.array(productListItemSchema),
});

export const productResponseSchema = z.object({
  product: productSchema,
  assets: z.array(productAssetSchema),
});

export const requestAssetUploadInputSchema = z.object({
  kind: z.enum(ASSET_KINDS),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().positive(),
});

export const assetUploadTicketSchema = z.object({
  assetId: idSchema,
  uploadUrl: z.url(),
  expiresAt: isoDateTimeSchema,
});

export const productAssetResponseSchema = z.object({
  asset: productAssetSchema,
});

export const submitIngestInputSchema = z.object({
  factsConfirmed: z.literal(true),
});

export const ingestJobResponseSchema = z.object({
  job: ingestJobSchema,
  product: productSchema,
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type RequestAssetUploadInput = z.infer<
  typeof requestAssetUploadInputSchema
>;
export type AssetUploadTicket = z.infer<typeof assetUploadTicketSchema>;

export const downloadUrlResponseSchema = z.object({
  url: z.url(),
  expiresInSeconds: z.number().int().positive(),
});
