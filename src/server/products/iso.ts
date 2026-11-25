// Postgres returns timestamps as "2026-11-25 14:06:50+00". The API contract is
// UTC ISO 8601 (CLAUDE.md §13), so every mapper converts through this helper.
export function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

export function toIsoOrNull(value: string | Date | null): string | null {
  return value === null ? null : toIso(value);
}
