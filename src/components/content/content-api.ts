"use client";

import type { z } from "zod";
import { apiErrorSchema } from "@/schemas/errors";

// Thin client for the content routes. Errors are shown as the server's message
// (already normalized and free of prompt text).
export async function apiRequest<S extends z.ZodType>(
  url: string,
  schema: S,
  init?: RequestInit,
): Promise<z.output<S>> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new Error(
      parsed.success
        ? parsed.data.error.message
        : "Something went wrong. Please try again.",
    );
  }
  return schema.parse(body);
}

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 100,
  );
}

// Dollars typed by the user become integer cents (CLAUDE.md §13: no floats).
export function dollarsToMinor(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
