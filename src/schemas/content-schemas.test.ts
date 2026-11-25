import { describe, expect, it } from "vitest";
import { LISTING_LIMITS } from "./limits";
import { adCopySchema, marketplaceListingSchema } from "./listing-text";
import { spendCapInputSchema } from "./money";
import { pkrBodySchema } from "./pkr";
import { videoEstimateInputSchema, videoStoryboardSchema } from "./video";

const scene = {
  description: "Used on a bathroom shelf",
  caption: "Hydrates in seconds",
};

describe("pkrBodySchema", () => {
  it("accepts a minimal PKR with missing fields listed", () => {
    const parsed = pkrBodySchema.safeParse({
      name: "Gel",
      features: [],
      specs: [],
      materials: [],
      price: null,
      claims: [],
      audience: null,
      tone: null,
      missingFields: ["price"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a claim without a source reference", () => {
    const parsed = pkrBodySchema.safeParse({
      name: "Gel",
      features: [],
      specs: [],
      materials: [],
      price: null,
      claims: [{ text: "SPF 50" }],
      audience: null,
      tone: null,
      missingFields: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("marketplaceListingSchema", () => {
  const valid = {
    title: "Gel",
    bullets: ["a", "b", "c", "d", "e"],
    description: "Desc",
    keywords: ["sunscreen"],
    attributes: { volume: "50 g" },
  };

  it("requires exactly the bullet count from limits.ts", () => {
    expect(marketplaceListingSchema.safeParse(valid).success).toBe(true);
    expect(
      marketplaceListingSchema.safeParse({ ...valid, bullets: ["a"] }).success,
    ).toBe(false);
  });

  it("rejects a title over the limit", () => {
    const title = "x".repeat(LISTING_LIMITS.titleMax + 1);
    expect(
      marketplaceListingSchema.safeParse({ ...valid, title }).success,
    ).toBe(false);
  });
});

describe("adCopySchema", () => {
  it("rejects hashtags without a leading #", () => {
    const parsed = adCopySchema.safeParse({
      headlines: ["a", "b", "c"],
      primaryTexts: ["x", "y"],
      cta: "SHOP_NOW",
      hashtags: ["sunscreen"],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("videoStoryboardSchema", () => {
  it("requires exactly five scenes", () => {
    expect(
      videoStoryboardSchema.safeParse({
        scenes: [scene, scene, scene, scene, scene],
        endCardText: "Shop now",
      }).success,
    ).toBe(true);
    expect(
      videoStoryboardSchema.safeParse({
        scenes: [scene, scene, scene],
        endCardText: "Shop now",
      }).success,
    ).toBe(false);
    expect(
      videoStoryboardSchema.safeParse({
        scenes: [scene],
        endCardText: "Shop now",
      }).success,
    ).toBe(false);
  });
});

describe("videoEstimateInputSchema", () => {
  it("accepts 2 to 3 videos of 6 to 15 seconds", () => {
    expect(
      videoEstimateInputSchema.safeParse({ count: 3, durationSeconds: 15 })
        .success,
    ).toBe(true);
  });

  it("rejects 4 videos, 5 seconds and fractional seconds", () => {
    expect(
      videoEstimateInputSchema.safeParse({ count: 4, durationSeconds: 8 })
        .success,
    ).toBe(false);
    expect(
      videoEstimateInputSchema.safeParse({ count: 2, durationSeconds: 5 })
        .success,
    ).toBe(false);
    expect(
      videoEstimateInputSchema.safeParse({ count: 2, durationSeconds: 7.5 })
        .success,
    ).toBe(false);
  });
});

describe("spendCapInputSchema", () => {
  it("accepts integer minor units only", () => {
    expect(
      spendCapInputSchema.safeParse({ capMinor: 5000, currency: "USD" })
        .success,
    ).toBe(true);
    expect(
      spendCapInputSchema.safeParse({ capMinor: 50.5, currency: "USD" })
        .success,
    ).toBe(false);
    expect(
      spendCapInputSchema.safeParse({ capMinor: -1, currency: "USD" }).success,
    ).toBe(false);
  });
});
