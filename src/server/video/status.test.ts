import { describe, expect, it } from "vitest";
import type { VideoJobStatus } from "@/schemas/video";
import { ConflictError } from "@/server/errors";
import {
  assertVideoJobTransition,
  canSubmitVideoJob,
  canTransitionVideoJob,
} from "./status";

const ALL: VideoJobStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "expired",
  "rejected",
];

const LEGAL: [VideoJobStatus, VideoJobStatus][] = [
  ["pending", "running"],
  ["pending", "failed"],
  ["pending", "cancelled"],
  ["running", "completed"],
  ["running", "failed"],
  ["running", "cancelled"],
  ["running", "expired"],
  ["completed", "rejected"],
];

describe("video job transitions", () => {
  it.each(LEGAL)("allows %s -> %s", (from, to) => {
    expect(canTransitionVideoJob(from, to)).toBe(true);
  });

  it("rejects every other pair", () => {
    const legal = new Set(LEGAL.map(([a, b]) => `${a}>${b}`));
    for (const from of ALL) {
      for (const to of ALL) {
        if (legal.has(`${from}>${to}`)) continue;
        expect(canTransitionVideoJob(from, to), `${from} -> ${to}`).toBe(false);
      }
    }
  });

  it("never moves an expired job back to completed", () => {
    expect(() => assertVideoJobTransition("expired", "completed")).toThrow(
      ConflictError,
    );
  });

  it("only submits a pending job with no provider id", () => {
    expect(canSubmitVideoJob({ status: "pending", providerJobId: null })).toBe(
      true,
    );
    expect(
      canSubmitVideoJob({ status: "pending", providerJobId: "job_1" }),
    ).toBe(false);
    expect(canSubmitVideoJob({ status: "running", providerJobId: null })).toBe(
      false,
    );
  });
});
