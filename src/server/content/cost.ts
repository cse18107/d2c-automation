import "server-only";
import { PermanentError, ValidationError } from "@/server/errors";

// A cap hit stops the whole job. Stages must rethrow it instead of recording a
// failed item and carrying on.
export class SpendCapError extends PermanentError {}

// Cost arithmetic in integer minor units (CLAUDE.md §13). Provider prices are
// fractional (for example $0.0337925 per second), so every estimate rounds UP to
// a whole minor unit. Rounding up keeps the cap check conservative.
export function ceilMinor(amountMajor: number): number {
  if (!Number.isFinite(amountMajor) || amountMajor < 0) {
    throw new ValidationError("Price must be a finite, non-negative amount");
  }
  // Subtract a tiny epsilon so 0.10 * 100 (10.000000000000002) does not round up
  // to 11 because of binary floating point.
  const minor = Math.ceil(amountMajor * 100 - 1e-9);
  if (!Number.isSafeInteger(minor)) {
    throw new ValidationError("Cost is out of range");
  }
  return minor;
}

// Estimate for `units` (count of calls, or seconds) at an integer rate per unit.
export function estimateMinor(units: number, ratePerUnitMinor: number): number {
  if (!Number.isSafeInteger(units) || units < 0) {
    throw new ValidationError("Units must be a non-negative integer");
  }
  if (!Number.isSafeInteger(ratePerUnitMinor) || ratePerUnitMinor < 0) {
    throw new ValidationError("Rate must be a non-negative integer");
  }
  const total = units * ratePerUnitMinor;
  if (!Number.isSafeInteger(total)) {
    throw new ValidationError("Estimate is out of range");
  }
  return total;
}

export type CapCheck =
  | { ok: true; remainingMinor: number }
  | { ok: false; remainingMinor: number };

// The cap check before every paid call (CLAUDE.md §7.5). Equal to the cap passes;
// one minor unit over fails. The app never raises the cap itself.
export function checkCap(input: {
  capMinor: number | null;
  spentMinor: number;
  nextCallMinor: number;
}): CapCheck {
  if (input.capMinor === null) {
    return { ok: false, remainingMinor: 0 };
  }
  const remaining = input.capMinor - input.spentMinor;
  if (input.spentMinor + input.nextCallMinor > input.capMinor) {
    return { ok: false, remainingMinor: Math.max(0, remaining) };
  }
  return { ok: true, remainingMinor: remaining - input.nextCallMinor };
}

export function assertWithinCap(input: {
  capMinor: number | null;
  spentMinor: number;
  nextCallMinor: number;
}): void {
  if (input.capMinor === null) {
    throw new ValidationError("Set a spend cap before generating");
  }
  const result = checkCap(input);
  if (!result.ok) {
    // PERMANENT: the job stops and does not retry (spec §9).
    throw new SpendCapError("Spend cap reached");
  }
}
