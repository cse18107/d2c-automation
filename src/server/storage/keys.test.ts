import { v4 as uuidv4, v7 } from "uuid";
import { describe, expect, it } from "vitest";
import { buildAssetKey } from "./keys";

describe("buildAssetKey", () => {
  const org = v7();
  const product = v7();
  const asset = v7();

  it("builds org/product/asset.ext from UUIDv7 ids", () => {
    expect(buildAssetKey(org, product, asset, "webp")).toBe(
      `${org}/${product}/${asset}.webp`,
    );
  });

  it("requires UUIDv7 ids, not other UUID versions", () => {
    expect(() => buildAssetKey(uuidv4(), product, asset, "webp")).toThrow(
      /UUIDv7/,
    );
  });

  it("rejects an extension outside the allowlist", () => {
    expect(() => buildAssetKey(org, product, asset, "exe")).toThrow(
      /extension/,
    );
  });

  it("never contains a filename, so path tricks cannot reach the key", () => {
    const key = buildAssetKey(org, product, asset, "pdf");
    expect(key).not.toContain("..");
    expect(key.split("/")).toHaveLength(3);
  });
});
