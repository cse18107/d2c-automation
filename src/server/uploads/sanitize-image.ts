import "server-only";
import { createHash } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import { ValidationError } from "@/server/errors";
import { MIN_IMAGE_SIDE_PX } from "./rules";

export type SanitizedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sha256: string;
};

// Re-encodes the image. sharp drops EXIF (including GPS) and other metadata
// unless withMetadata() is called. rotate() applies the EXIF orientation first,
// so the stored pixels are upright without the tag.
export async function sanitizeImage(
  input: Uint8Array,
): Promise<SanitizedImage> {
  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await sharp(input, { failOn: "error" })
      .rotate()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ValidationError("Image could not be decoded");
  }

  const { width, height, format } = output.info;
  const mimeType = mimeTypeFor(format);
  if (!mimeType) {
    throw new ValidationError("Image format is not supported");
  }
  if (Math.min(width, height) < MIN_IMAGE_SIDE_PX) {
    throw new ValidationError(
      `Images must be at least ${MIN_IMAGE_SIDE_PX} px on the shortest side`,
    );
  }

  const bytes = new Uint8Array(output.data);
  return {
    bytes,
    width,
    height,
    mimeType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function mimeTypeFor(format: string): SanitizedImage["mimeType"] | null {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}
