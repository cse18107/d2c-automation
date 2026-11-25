import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, orgIdColumn } from "./columns";

// Append-only. No updated_at: the table never changes after insert.
// UPDATE, DELETE and TRUNCATE are rejected by a trigger (migration 0002).
export const auditEvents = pgTable("audit_events", {
  id: idColumn(),
  orgId: orgIdColumn(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  metadata: jsonb("metadata")
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});
