import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/errors";
import { AD_RATIOS, renderAdRatios, renderMainWhite } from "./render";

async function sample(width: number, height: number): Promise<Uint8Array> {
  const png = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 180, b: 90 },
    },
  })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

describe("renderAdRatios", () => {
  it("produces each requested ad size at its exact dimensions", async () => {
    const source = await sample(1024, 1024);
    const out = await renderAdRatios(source, ["1:1", "9:16", "16:9"]);
    for (const render of out) {
      const meta = await sharp(render.bytes).metadata();
      const expected = AD_RATIOS[render.variant as "1:1"];
      expect(meta.width).toBe(expected.width);
      expect(meta.height).toBe(expected.height);
      expect(render.mediaType).toBe("image/jpeg");
    }
  });

  it("strips metadata from the output", async () => {
    const withExif = await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#ffffff" },
    })
      .withExifMerge({ IFD0: { Copyright: "test" } })
      .jpeg()
      .toBuffer();
    const [render] = await renderAdRatios(new Uint8Array(withExif), ["1:1"]);
    const meta = await sharp(render?.bytes ?? new Uint8Array()).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("refuses a source image below 600 px on the short side", async () => {
    const small = await sample(400, 900);
    await expect(renderAdRatios(small, ["1:1"])).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("renderMainWhite", () => {
  it("produces a 2000 px square with a white background", async () => {
    const source = await sample(900, 600);
    const main = await renderMainWhite(source);
    const meta = await sharp(main.bytes).metadata();
    expect(meta.width).toBe(2000);
    expect(meta.height).toBe(2000);
    const corner = await sharp(main.bytes)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(Array.from(corner)).toEqual([255, 255, 255]);
  });
});
