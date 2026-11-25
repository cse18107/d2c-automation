import { z } from "zod";
import { idSchema, isoDateTimeSchema, orgScopedSchema } from "./common";

// Every status is listed so the enum is the single source of truth. Only
// draft, processing and failed are reachable in Step 01 (see product-status.ts).
export const PRODUCT_STATUSES = [
  "draft",
  "processing",
  "ready_for_review",
  "approved",
  "published",
  "failed",
] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productSchema = orgScopedSchema.extend({
  brandId: idSchema,
  name: z.string().min(1).max(120),
  status: productStatusSchema,
  ingestedAt: isoDateTimeSchema.nullable(),
  createdBy: z.string().min(1),
});
export type Product = z.infer<typeof productSchema>;

export const createProductInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateProductInput = z.infer<typeof createProductInputSchema>;
