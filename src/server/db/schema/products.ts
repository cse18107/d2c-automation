import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { PRODUCT_STATUSES } from "../../../schemas/product";
import { idColumn, orgIdColumn, timestamps } from "./columns";

export const productStatusEnum = pgEnum("product_status", PRODUCT_STATUSES);

export const products = pgTable(
  "products",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    brandId: uuid("brand_id").notNull(),
    name: text("name").notNull(),
    status: productStatusEnum("status").notNull().default("draft"),
    // Per-product spend cap in minor units. Set only by an owner (CLAUDE.md §7.5).
    spendCapMinor: integer("spend_cap_minor"),
    ingestedAt: timestamp("ingested_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [
    index("products_org_status_updated_idx").on(t.orgId, t.status, t.updatedAt),
  ],
);
