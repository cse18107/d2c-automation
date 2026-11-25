import { describe, expect, it } from "vitest";
import { renderKey, sha256Hex } from "./persist";

describe("renderKey", () => {
  const ids = {
    org: "0195b7a8-0000-7000-8000-000000000001",
    product: "0195b7a8-0000-7000-8000-000000000002",
    creative: "0195b7a8-0000-7000-8000-000000000003",
  };

  it("builds an org and product scoped key with no colon in the file name", () => {
    expect(
      renderKey(ids.org, ids.product, ids.creative, "4:5", "image/jpeg"),
    ).toBe(`${ids.org}/${ids.product}/generated/${ids.creative}/4x5.jpg`);
  });

  it("uses an mp4 extension for video renders", () => {
    expect(
      renderKey(ids.org, ids.product, ids.creative, "9:16", "video/mp4"),
    ).toMatch(/9x16\.mp4$/);
  });
});

describe("sha256Hex", () => {
  it("hashes the exact bytes", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
