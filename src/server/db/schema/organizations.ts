import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./columns";

// Organizations are the tenant root, so they have no org_id of their own.
export const organizations = pgTable("organizations", {
  id: idColumn(),
  name: text("name").notNull(),
  // Kill switch (CLAUDE.md §7.9). Stored now so the schema is stable; not read in Step 01.
  pausePublishing: boolean("pause_publishing").notNull().default(false),
  ...timestamps,
});
