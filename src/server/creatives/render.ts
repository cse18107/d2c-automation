import "server-only";
import sharp from "sharp";
import { ValidationError } from "@/server/errors";

// Image ad sizes (spec §2, CLAUDE.md §8). Each source image is cropped to fill
// the target and re-encoded. sharp drops EXIF and other metadata by default, so
// GPS data never reaches storage.
export const AD_RATIOS = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "2:3": { width: 1080, height: 1620 },
} as const;
export type AdRatio = keyof typeof AD_RATIOS;

export type RenderedImage = {
  variant: string;
  bytes: Uint8Array;
  mediaType: "image/jpeg";
  width: number;
  height: number;
};

const MIN_SOURCE_SIDE = 600;

async function assertLargeEnough(input: Uint8Array): Promise<void> {
  const meta = await sharp(input).metadata();
  const shortest = Math.min(meta.width ?? 0, meta.height ?? 0);
  if (shortest < MIN_SOURCE_SIDE) {
    throw new ValidationError(
      `Image is too small (${shortest} px). At least ${MIN_SOURCE_SIDE} px is needed.`,
    );
  }
}

export async function renderAdRatios(
  source: Uint8Array,
  ratios: readonly AdRatio[],
): Promise<RenderedImage[]> {
  await assertLargeEnough(source);
  return Promise.all(
    ratios.map(async (ratio) => {
      const { width, height } = AD_RATIOS[ratio];
      const bytes = await sharp(source)
        .rotate()
        .resize(width, height, { fit: "cover", position: "centre" })
        .jpeg({ quality: 90 })
        .toBuffer();
      return {
        variant: ratio,
        bytes: new Uint8Array(bytes),
        mediaType: "image/jpeg" as const,
        width,
        height,
      };
    }),
  );
}

// Marketplace main image: pure white background, product fitted inside
// 2000 px (spec §2: deterministic sharp step, not free-form generation).
export async function renderMainWhite(
  source: Uint8Array,
): Promise<RenderedImage> {
  await assertLargeEnough(source);
  const size = 2000;
  const bytes = await sharp(source)
    .rotate()
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92 })
    .toBuffer();
  return {
    variant: "main_white",
    bytes: new Uint8Array(bytes),
    mediaType: "image/jpeg",
    width: size,
    height: size,
  };
}
