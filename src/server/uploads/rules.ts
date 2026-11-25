import "server-only";
import { type AssetKind, DOCX_MIME } from "@/schemas/product-asset";
import { ValidationError } from "@/server/errors";

// Upload rules from spec §8. Client checks are a convenience; these are enforced.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 10;
export const MAX_DOCUMENTS_PER_PRODUCT = 1;
export const MIN_IMAGE_SIDE_PX = 600;
export const MAX_PDF_PAGES = 50;

const ALLOWED_MIME: Record<AssetKind, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  document: ["application/pdf", DOCX_MIME, "text/plain", "text/markdown"],
};

// Extensions that may accompany each MIME type. The extension must agree with the MIME.
const EXTENSIONS_BY_MIME: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  [DOCX_MIME]: ["docx"],
  "text/plain": ["txt"],
  "text/markdown": ["md", "markdown"],
};

export const STORAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  [DOCX_MIME]: "docx",
  "text/plain": "txt",
  "text/markdown": "md",
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function validateUploadRequest(input: {
  kind: AssetKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): void {
  if (!ALLOWED_MIME[input.kind].includes(input.mimeType)) {
    throw new ValidationError(
      `${input.mimeType} is not allowed for ${input.kind} uploads`,
    );
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new ValidationError("File is empty");
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    throw new ValidationError("File is larger than 10 MB");
  }
  const extension = extensionOf(input.filename);
  const allowedExtensions = EXTENSIONS_BY_MIME[input.mimeType] ?? [];
  if (!allowedExtensions.includes(extension)) {
    throw new ValidationError("File extension does not match its type");
  }
}

export function assertCountAllows(
  kind: AssetKind,
  existingCount: number,
): void {
  const limit =
    kind === "image" ? MAX_IMAGES_PER_PRODUCT : MAX_DOCUMENTS_PER_PRODUCT;
  if (existingCount >= limit) {
    throw new ValidationError(
      kind === "image"
        ? `A product can have at most ${limit} images`
        : `A product can have at most ${limit} document`,
    );
  }
}
