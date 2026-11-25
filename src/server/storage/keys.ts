import { idSchema } from "@/schemas/common";
import { ValidationError } from "@/server/errors";

const ALLOWED_EXTENSIONS = [
  "jpg",
  "png",
  "webp",
  "pdf",
  "docx",
  "txt",
  "md",
] as const;
export type StorageExtension = (typeof ALLOWED_EXTENSIONS)[number];

// The key never contains the uploaded filename (spec §8): names are user input
// and may contain PII or path tricks. Only server-generated UUIDv7s are used.
export function buildAssetKey(
  orgId: string,
  productId: string,
  assetId: string,
  extension: string,
): string {
  for (const id of [orgId, productId, assetId]) {
    if (!idSchema.safeParse(id).success) {
      throw new ValidationError("Storage keys require UUIDv7 identifiers");
    }
  }
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ValidationError(`Unsupported storage extension: ${extension}`);
  }
  return `${orgId}/${productId}/${assetId}.${extension}`;
}
