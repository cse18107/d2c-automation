import "server-only";
import type { z } from "zod";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { idSchema } from "@/schemas/common";
import { type ApiErrorCode, apiErrorSchema } from "@/schemas/errors";
import { AppError, ValidationError } from "@/server/errors";
import { getSession, type Session } from "@/server/session";

// Shared plumbing for route handlers. Handlers stay thin: parse input, call a
// server module, return a validated response. (CLAUDE.md §11)

const NO_STORE = { "Cache-Control": "no-store" } as const;

// Output is validated against its schema before it leaves the server.
export function jsonResponse<S extends z.ZodType>(
  schema: S,
  body: z.input<S>,
  status = 200,
): Response {
  return Response.json(schema.parse(body), { status, headers: NO_STORE });
}

export function errorResponse(
  code: ApiErrorCode,
  status: number,
  message: string,
): Response {
  return Response.json(apiErrorSchema.parse({ error: { code, message } }), {
    status,
    headers: NO_STORE,
  });
}

export async function handleApi(
  work: (session: Session) => Promise<Response>,
): Promise<Response> {
  try {
    return await work(getSession());
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.code, error.status, error.message);
    }
    if (error instanceof ZodError) {
      return errorResponse(
        "VALIDATION",
        400,
        error.issues[0]?.message ?? "Invalid request",
      );
    }
    logger.error({ err: error }, "unhandled API error");
    return errorResponse(
      "INTERNAL",
      500,
      "Something went wrong. Please try again.",
    );
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be JSON");
  }
}

export function requireWriter(session: Session): void {
  if (session.role === "viewer") {
    throw new AppError("FORBIDDEN", 403, "Viewers cannot change products");
  }
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 255) {
    throw new ValidationError(
      "An Idempotency-Key header (8 to 255 characters) is required",
    );
  }
  return key;
}

export function idParam(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError("Invalid identifier");
  }
  return parsed.data;
}
