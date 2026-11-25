import { describe, expect, it } from "vitest";
import { PermanentError, ValidationError } from "@/server/errors";
import { assertWithinCap, ceilMinor, checkCap, estimateMinor } from "./cost";

describe("ceilMinor", () => {
  it("rounds a fractional major amount up to whole minor units", () => {
    expect(ceilMinor(0.1)).toBe(10);
    expect(ceilMinor(0.0337925)).toBe(4);
    expect(ceilMinor(1.5)).toBe(150);
  });

  it("does not round up on binary floating point noise", () => {
    expect(ceilMinor(0.1 * 3)).toBe(30);
  });

  it("rejects negative and non-finite amounts", () => {
    expect(() => ceilMinor(-1)).toThrow(ValidationError);
    expect(() => ceilMinor(Number.NaN)).toThrow(ValidationError);
    expect(() => ceilMinor(Number.POSITIVE_INFINITY)).toThrow(ValidationError);
  });
});

describe("estimateMinor", () => {
  it("multiplies integer units by an integer rate", () => {
    // 3 videos × 15 s × 10 cents per second = 450 cents ($4.50)
    expect(estimateMinor(3 * 15, 10)).toBe(450);
  });

  it("rejects fractional units and rates", () => {
    expect(() => estimateMinor(1.5, 10)).toThrow(ValidationError);
    expect(() => estimateMinor(2, 0.5)).toThrow(ValidationError);
  });
});

describe("checkCap", () => {
  it("passes when the call lands exactly on the cap", () => {
    const result = checkCap({
      capMinor: 100,
      spentMinor: 60,
      nextCallMinor: 40,
    });
    expect(result.ok).toBe(true);
    expect(result.remainingMinor).toBe(0);
  });

  it("fails when the call is one minor unit over the cap", () => {
    const result = checkCap({
      capMinor: 100,
      spentMinor: 60,
      nextCallMinor: 41,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses when no cap is set", () => {
    expect(
      checkCap({ capMinor: null, spentMinor: 0, nextCallMinor: 1 }).ok,
    ).toBe(false);
  });
});

describe("assertWithinCap", () => {
  it("throws PERMANENT with the spec message when the cap is reached", () => {
    expect(() =>
      assertWithinCap({ capMinor: 100, spentMinor: 100, nextCallMinor: 1 }),
    ).toThrow(PermanentError);
    expect(() =>
      assertWithinCap({ capMinor: 100, spentMinor: 100, nextCallMinor: 1 }),
    ).toThrow("Spend cap reached");
  });

  it("asks for a cap before any generation when none is set", () => {
    expect(() =>
      assertWithinCap({ capMinor: null, spentMinor: 0, nextCallMinor: 1 }),
    ).toThrow("Set a spend cap before generating");
  });
});
