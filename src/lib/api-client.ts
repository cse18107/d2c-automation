"use client";

import { type ApiErrorCode, apiErrorSchema } from "@/schemas/errors";

// Thrown for any non-2xx response, with the server's normalized code and message.
export class ApiClientError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

// Every response is parsed by the caller's schema, so a server/client contract
// drift fails here, not later in the UI.
export async function apiFetch<T>(
  url: string,
  init: RequestInit,
  parse: (body: unknown) => T,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    return parse(undefined);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.code,
        parsed.data.error.message,
      );
    }
    throw new ApiClientError("INTERNAL", `Request failed (${response.status})`);
  }
  return parse(body);
}
