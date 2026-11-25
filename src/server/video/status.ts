import "server-only";
import type { VideoJobStatus } from "@/schemas/video";
import { ConflictError } from "@/server/errors";

// Video job state machine (spec §5, §13a, ADR 0004). `rejected` comes from the
// fidelity check after a download, so it is reachable only from `completed`.
// `expired` means OpenRouter's copy was removed before we downloaded it.
const VIDEO_TRANSITIONS: Record<VideoJobStatus, readonly VideoJobStatus[]> = {
  pending: ["running", "failed", "cancelled"],
  running: ["completed", "failed", "cancelled", "expired"],
  completed: ["rejected"],
  failed: [],
  cancelled: [],
  expired: [],
  rejected: [],
};

export function canTransitionVideoJob(
  from: VideoJobStatus,
  to: VideoJobStatus,
): boolean {
  return VIDEO_TRANSITIONS[from].includes(to);
}

export function assertVideoJobTransition(
  from: VideoJobStatus,
  to: VideoJobStatus,
): void {
  if (!canTransitionVideoJob(from, to)) {
    throw new ConflictError(`A video job cannot move from ${from} to ${to}`);
  }
}

// A row with a provider job id is never submitted again (ADR 0004, idempotency).
export function canSubmitVideoJob(input: {
  status: VideoJobStatus;
  providerJobId: string | null;
}): boolean {
  return input.status === "pending" && input.providerJobId === null;
}
