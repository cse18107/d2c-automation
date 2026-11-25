import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { v7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAuditEvent } from "@/server/audit";
import { createDb, type Db } from "./index";
import { auditEvents } from "./schema";

// Integration test: needs a disposable Postgres. It resets the schema, so it
// refuses to run against any database whose name does not end in "_test".
const url = process.env.TEST_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

// Drizzle wraps driver errors ("Failed query: ..."); the Postgres message is in the cause chain.
async function rejectionText(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const parts: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    }
    return parts.join(" | ");
  }
  throw new Error("Expected the query to be rejected");
}

describeIfDb("audit_events is append-only (database level)", () => {
  let db: Db;

  beforeAll(async () => {
    if (!url) throw new Error("TEST_DATABASE_URL is required");
    const dbName = new URL(url).pathname.replace(/^\//, "");
    if (!dbName.endsWith("_test")) {
      throw new Error(`Refusing to reset non-test database "${dbName}"`);
    }
    db = createDb(url);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    // Close the pool so the test process can exit.
    await (db.$client as unknown as { end: () => Promise<void> }).end();
  });

  const event = () => ({
    orgId: v7(),
    actorId: "dev-user",
    action: "product.created",
    entityType: "product",
    entityId: v7(),
    metadata: {},
  });

  it("accepts an insert", async () => {
    await expect(recordAuditEvent(db, event())).resolves.toBeUndefined();
  });

  it("rejects UPDATE, even when no rows match", async () => {
    const message = await rejectionText(
      db.execute(sql`UPDATE audit_events SET action = 'x.y' WHERE false`),
    );
    expect(message).toMatch(/append-only: UPDATE/);
  });

  it("rejects DELETE, even when no rows match", async () => {
    const message = await rejectionText(
      db.execute(sql`DELETE FROM audit_events WHERE false`),
    );
    expect(message).toMatch(/append-only: DELETE/);
  });

  it("rejects TRUNCATE", async () => {
    const message = await rejectionText(db.execute(sql`TRUNCATE audit_events`));
    expect(message).toMatch(/append-only: TRUNCATE/);
  });

  it("keeps the inserted row", async () => {
    const rows = await db.select().from(auditEvents);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
