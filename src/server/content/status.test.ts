import { describe, expect, it } from "vitest";
import { ConflictError } from "@/server/errors";
import {
  assertContentJobTransition,
  CONTENT_JOB_STATUSES,
  type ContentJobStatus,
  canTransitionContentJob,
} from "./status";

const LEGAL: [ContentJobStatus, ContentJobStatus][] = [
  ["queued", "running"],
  ["queued", "cancelled"],
  ["running", "succeeded"],
  ["running", "failed"],
  ["running", "cancelled"],
];

describe("content job transitions", () => {
  it.each(LEGAL)("allows %s -> %s", (from, to) => {
    expect(canTransitionContentJob(from, to)).toBe(true);
  });

  it("rejects every other pair, including a second running job", () => {
    const legalKeys = new Set(LEGAL.map(([a, b]) => `${a}>${b}`));
    for (const from of CONTENT_JOB_STATUSES) {
      for (const to of CONTENT_JOB_STATUSES) {
        if (legalKeys.has(`${from}>${to}`)) continue;
        expect(canTransitionContentJob(from, to), `${from} -> ${to}`).toBe(
          false,
        );
      }
    }
  });

  it("treats succeeded, failed and cancelled as terminal", () => {
    for (const terminal of ["succeeded", "failed", "cancelled"] as const) {
      for (const to of CONTENT_JOB_STATUSES) {
        expect(() => assertContentJobTransition(terminal, to)).toThrow(
          ConflictError,
        );
      }
    }
  });

  it("names both states in the conflict message", () => {
    expect(() => assertContentJobTransition("running", "queued")).toThrow(
      "from running to queued",
    );
  });
});
