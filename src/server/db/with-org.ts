import "server-only";
import { eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// Every tenant-scoped query must include this predicate (CLAUDE.md §12).
// Takes the table's orgId column so a query cannot be written without it
// by accident: callers pass `withOrg(products, orgId)` into `.where(...)`.
export function withOrg(table: { orgId: AnyPgColumn }, orgId: string): SQL {
  return eq(table.orgId, orgId);
}
