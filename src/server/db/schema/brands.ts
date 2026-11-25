import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { idColumn, orgIdColumn, timestamps } from "./columns";

export const brands = pgTable(
  "brands",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("brands_org_slug_uq").on(t.orgId, t.slug)],
);
