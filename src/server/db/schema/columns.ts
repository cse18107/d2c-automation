import { timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 } from "uuid";

// IDs are generated in the app (UUIDv7) so they are known before insert,
// which the upload ticket flow needs.
export const idColumn = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => v7());

export const orgIdColumn = () => uuid("org_id").notNull();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date().toISOString()),
};
