import "server-only";
import { type AuditEventInput, auditEventInputSchema } from "@/schemas/audit";
import type { Db } from "@/server/db";
import { auditEvents } from "@/server/db/schema";
import { ValidationError } from "@/server/errors";

// Keys that must never reach the audit log (CLAUDE.md §7.8, §12). Matched
// case-insensitively against every metadata key, at the top level.
const FORBIDDEN_METADATA_KEY =
  /token|secret|password|signed|url|authorization|cookie/i;

// The only write path for audit_events. The table is append-only in the
// database too (migration 0001_audit_append_only), so this is the only insert.
export async function recordAuditEvent(
  db: Pick<Db, "insert">,
  input: unknown,
): Promise<void> {
  const parsed = auditEventInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid audit event");
  }
  const event: AuditEventInput = parsed.data;

  const forbidden = Object.keys(event.metadata).filter((key) =>
    FORBIDDEN_METADATA_KEY.test(key),
  );
  if (forbidden.length > 0) {
    throw new ValidationError(
      `Audit metadata contains forbidden keys: ${forbidden.join(", ")}`,
    );
  }

  await db.insert(auditEvents).values(event);
}
