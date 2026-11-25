import { describe, expect, it } from "vitest";
import { createProductInputSchema, productStatusSchema } from "./product";

describe("productStatusSchema", () => {
  it("accepts every status in the spec", () => {
    for (const status of [
      "draft",
      "processing",
      "ready_for_review",
      "approved",
      "published",
      "failed",
    ]) {
      expect(productStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(productStatusSchema.safeParse("live").success).toBe(false);
  });
});

describe("createProductInputSchema", () => {
  it("trims the name and accepts 1 to 120 characters", () => {
    expect(createProductInputSchema.parse({ name: "  Mug  " }).name).toBe(
      "Mug",
    );
    expect(
      createProductInputSchema.safeParse({ name: "a".repeat(120) }).success,
    ).toBe(true);
  });

  it("rejects an empty name after trimming", () => {
    expect(createProductInputSchema.safeParse({ name: "   " }).success).toBe(
      false,
    );
  });

  it("rejects a name over 120 characters", () => {
    expect(
      createProductInputSchema.safeParse({ name: "a".repeat(121) }).success,
    ).toBe(false);
  });
});
