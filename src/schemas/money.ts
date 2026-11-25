import { z } from "zod";

// Money is an integer count of minor units plus an ISO 4217 code (CLAUDE.md §13).
// Floats are rejected so cost arithmetic never drifts.
export const moneySchema = z.object({
  minor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type Money = z.infer<typeof moneySchema>;

export const spendCapInputSchema = z.object({
  capMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type SpendCapInput = z.infer<typeof spendCapInputSchema>;

export const spendCapResponseSchema = spendCapInputSchema;
