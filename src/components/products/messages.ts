"use client";

// Turns any thrown value into text for the user. Unknown errors get a generic
// message rather than their internals.
export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
