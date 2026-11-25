import { describe, expect, it } from "vitest";
import { dollarsToMinor, formatMoney } from "./content-api";

describe("dollarsToMinor", () => {
  it("turns dollars into integer cents without float drift", () => {
    expect(dollarsToMinor("10")).toBe(1000);
    expect(dollarsToMinor("0.1")).toBe(10);
    expect(dollarsToMinor("19.99")).toBe(1999);
  });

  it("rejects zero, negatives and text", () => {
    expect(dollarsToMinor("0")).toBeNull();
    expect(dollarsToMinor("-5")).toBeNull();
    expect(dollarsToMinor("abc")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats minor units as currency", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
  });
});
