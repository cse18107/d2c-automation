import { z } from "zod";

// Normalized API error shape: { error: { code, message } } (CLAUDE.md §11).
export const apiErrorCodeSchema = z.enum([
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "TRANSIENT",
  "PERMANENT",
  "FORBIDDEN",
  "UNAUTHENTICATED",
  "INTERNAL",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
