import type { z } from "zod";

// Typed error for rejected input (CLAUDE.md §13: throw typed errors, never swallow).
export class ValidationError extends Error {
  readonly code = "VALIDATION" as const;
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(message: string, issues: readonly z.core.$ZodIssue[] = []) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}
