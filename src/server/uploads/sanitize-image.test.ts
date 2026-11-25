import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/errors";
import { sanitizeImage } from "./sanitize-image";

async function jpegWithExif(
  width: number,
  height: number,
): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .withExif({
      IFD0: { Copyright: "private photographer", Artist: "Jane Doe" },
    })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("sanitizeImage", () => {
  it("removes EXIF metadata from a JPEG", async () => {
    const input = await jpegWithExif(800, 800);
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();

    const result = await sanitizeImage(input);
    const after = await sharp(result.bytes).metadata();
    expect(after.exif).toBeUndefined();
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("reports the stored dimensions and a sha256 of the sanitized bytes", async () => {
    const result = await sanitizeImage(await jpegWithExif(900, 700));
    expect(result.width).toBe(900);
    expect(result.height).toBe(700);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an image whose shortest side is under 600 px", async () => {
    await expect(
      sanitizeImage(await jpegWithExif(500, 900)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects bytes that are not a decodable image", async () => {
    await expect(
      sanitizeImage(new TextEncoder().encode("not an image")),
    ).rejects.toThrow(/decoded/);
  });
});
