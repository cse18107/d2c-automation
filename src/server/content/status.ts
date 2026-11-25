import "server-only";
import { ConflictError } from "@/server/errors";

// Content job state machine (spec §5, §9). Every illegal transition is rejected
// here, not only in the UI. Terminal states have no outgoing transitions.
export const CONTENT_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type ContentJobStatus = (typeof CONTENT_JOB_STATUSES)[number];

const CONTENT_JOB_TRANSITIONS: Record<
  ContentJobStatus,
  readonly ContentJobStatus[]
> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionContentJob(
  from: ContentJobStatus,
  to: ContentJobStatus,
): boolean {
  return CONTENT_JOB_TRANSITIONS[from].includes(to);
}

export function assertContentJobTransition(
  from: ContentJobStatus,
  to: ContentJobStatus,
): void {
  if (!canTransitionContentJob(from, to)) {
    throw new ConflictError(`A content job cannot move from ${from} to ${to}`);
  }
}

// The pipeline stages in order (CLAUDE.md §1, §9). `await_review` is the last
// stage of this feature; approval is Step 03.
export const CONTENT_STEPS = [
  "extract_pkr",
  "generate_creatives",
  "generate_videos",
  "generate_listings",
  "policy_check",
  "await_review",
] as const;
export type ContentStep = (typeof CONTENT_STEPS)[number];
