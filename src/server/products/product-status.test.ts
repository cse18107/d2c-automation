import { describe, expect, it } from "vitest";
import { ConflictError } from "@/server/errors";
import { assertTransition, canTransition } from "./product-status";

describe("Step 01 product status transitions", () => {
  it("allows the legal ingest path", () => {
    expect(canTransition("draft", "processing")).toBe(true);
    expect(canTransition("processing", "draft")).toBe(true);
    expect(canTransition("processing", "failed")).toBe(true);
    expect(canTransition("failed", "processing")).toBe(true);
    expect(canTransition("failed", "draft")).toBe(true);
  });

  it("rejects every transition into approved or published", () => {
    const from = [
      "draft",
      "processing",
      "ready_for_review",
      "approved",
      "published",
      "failed",
    ] as const;
    for (const source of from) {
      expect(canTransition(source, "approved")).toBe(false);
      expect(canTransition(source, "published")).toBe(false);
    }
  });

  it("rejects the illegal transitions named in the spec", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("processing", "published")).toBe(false);
    expect(canTransition("failed", "approved")).toBe(false);
  });

  it("rejects ready_for_review, which belongs to a later step", () => {
    expect(canTransition("processing", "ready_for_review")).toBe(false);
    expect(canTransition("draft", "ready_for_review")).toBe(false);
  });

  it("throws a typed ConflictError for an illegal move", () => {
    expect(() => assertTransition("draft", "published")).toThrow(ConflictError);
  });
});
