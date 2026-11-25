import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/errors";
import {
  allowedDurations,
  assertDurationSupported,
  centsPerSecond,
  getVideoModelRules,
} from "./duration-rules";

const MIN = 6;
const MAX = 15;

describe("getVideoModelRules", () => {
  it("returns the wan rules for the default model", () => {
    expect(getVideoModelRules("alibaba/wan-3.0").modelId).toBe(
      "alibaba/wan-3.0",
    );
  });

  it("rejects a model that is not in the table", () => {
    expect(() => getVideoModelRules("unknown/model")).toThrow(ValidationError);
  });
});

describe("allowedDurations", () => {
  it("allows every value from 6 to 15 for wan", () => {
    const wan = getVideoModelRules("alibaba/wan-3.0");
    expect(allowedDurations(wan, MIN, MAX)).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it("allows only 6 and 8 for veo-lite inside the product range", () => {
    const veo = getVideoModelRules("google/veo-3.1-lite");
    expect(allowedDurations(veo, MIN, MAX)).toEqual([6, 8]);
  });
});

describe("assertDurationSupported", () => {
  it("rejects 15 s for veo-lite instead of snapping it", () => {
    const veo = getVideoModelRules("google/veo-3.1-lite");
    expect(() => assertDurationSupported(veo, 15, MIN, MAX)).toThrow(
      ValidationError,
    );
  });

  it("accepts 8 s for veo-lite", () => {
    const veo = getVideoModelRules("google/veo-3.1-lite");
    expect(() => assertDurationSupported(veo, 8, MIN, MAX)).not.toThrow();
  });
});

describe("centsPerSecond", () => {
  it("uses the 720p wan rate of 10 cents per second", () => {
    const wan = getVideoModelRules("alibaba/wan-3.0");
    expect(centsPerSecond(wan, "720p")).toBe(10);
  });

  it("rejects a resolution the model does not offer", () => {
    const veo = getVideoModelRules("google/veo-3.1-lite");
    expect(() => centsPerSecond(veo, "480p")).toThrow(ValidationError);
  });
});
