import { pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { ROLES } from "../../../schemas/member";
import { idColumn, orgIdColumn, timestamps } from "./columns";

export const roleEnum = pgEnum("member_role", ROLES);

export const members = pgTable(
  "members",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    userId: text("user_id").notNull(),
    role: roleEnum("role").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("members_org_user_uq").on(t.orgId, t.userId)],
);
