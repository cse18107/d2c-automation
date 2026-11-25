import { describe, expect, it } from "vitest";
import { estimateRun, resolveCap } from "./service";

const base = { slotCount: 7, capMinor: null } as const;

describe("estimateRun", () => {
  it("videos: count × seconds × 720p rate, plus one call per video and the PKR", () => {
    // 2 × 8 s × 10 cents = 160. Calls: 1 PKR + 2 storyboards = 3 × 5 = 15.
    const est = estimateRun({
      ...base,
      scope: "videos",
      videoCount: 2,
      videoDurationSeconds: 8,
    });
    expect(est.videosMinor).toBe(160);
    expect(est.aiCallsMinor).toBe(15);
    expect(est.estimatedMinor).toBe(175);
  });

  it("images: one image call per slot, and no video cost", () => {
    // 7 slots × 5 = 35 cents (fixed prompts, so no text call).
    const est = estimateRun({
      ...base,
      scope: "images",
      videoCount: 2,
      videoDurationSeconds: 8,
    });
    expect(est.videosMinor).toBe(0);
    expect(est.aiCallsMinor).toBe(35);
  });

  it("text: three calls and nothing else", () => {
    const est = estimateRun({
      ...base,
      scope: "text",
      videoCount: 2,
      videoDurationSeconds: 8,
    });
    expect(est.estimatedMinor).toBe(15);
  });

  it("flags an estimate over the cap; an estimate exactly at the cap is not over", () => {
    const over = estimateRun({
      ...base,
      scope: "videos",
      videoCount: 2,
      videoDurationSeconds: 8,
      capMinor: 174,
    });
    const exact = estimateRun({
      ...base,
      scope: "videos",
      videoCount: 2,
      videoDurationSeconds: 8,
      capMinor: 175,
    });
    expect(over.overCap).toBe(true);
    expect(exact.overCap).toBe(false);
  });

  it("accepts 15 s with the default wan model (range 2 to 30 s)", () => {
    expect(() =>
      estimateRun({
        ...base,
        scope: "videos",
        videoCount: 1,
        videoDurationSeconds: 15,
      }),
    ).not.toThrow();
  });
});

describe("resolveCap", () => {
  it("uses the product cap when set", () => {
    expect(resolveCap(5000)).toBe(5000);
  });
});
