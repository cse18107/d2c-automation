import "server-only";
import type { ApiErrorCode } from "@/schemas/errors";

// Typed errors (CLAUDE.md §13). Route handlers map each class to a normalized
// { error: { code, message } } response; nothing is swallowed.
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, status: number, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION", 400, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("NOT_FOUND", 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", 409, message);
  }
}

export class PermanentError extends AppError {
  constructor(message: string) {
    super("PERMANENT", 422, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Rate limited, try again shortly") {
    super("RATE_LIMITED", 429, message);
  }
}

export class TransientError extends AppError {
  constructor(message: string) {
    super("TRANSIENT", 503, message);
  }
}
