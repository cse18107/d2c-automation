import { z } from "zod";

// UUIDv7 everywhere (CLAUDE.md §13). Timestamps are UTC ISO 8601.
export const idSchema = z.uuidv7();
export const isoDateTimeSchema = z.iso.datetime();

export const orgScopedSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
