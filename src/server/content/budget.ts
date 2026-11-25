import "server-only";
import { assertWithinCap } from "./cost";

// Text and image calls are not priced before they run, so each one reserves a
// fixed ceiling before the call. The real cost replaces the reserve after the
// call, or the reserve is kept when the provider does not report a cost.
// Video calls use the exact estimate instead (ADR 0004).
export const TEXT_IMAGE_CALL_CEILING_MINOR = 5;

export type Budget = { capMinor: number | null; spentMinor: number };

export function reserve(budget: Budget, ceilingMinor: number): void {
  assertWithinCap({
    capMinor: budget.capMinor,
    spentMinor: budget.spentMinor,
    nextCallMinor: ceilingMinor,
  });
}

export function settle(
  budget: Budget,
  reservedMinor: number,
  actualMinor: number | null,
): number {
  const charged = actualMinor ?? reservedMinor;
  budget.spentMinor += charged;
  return charged;
}
