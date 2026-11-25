import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Db } from "@/server/db";

export const ORG_A = "0196a0a0-0000-7000-8000-00000000000a";
export const ORG_B = "0196a0a0-0000-7000-8000-00000000000b";

// Resets the schema of a disposable test database, migrates it, and seeds two
// orgs for tenancy tests. Refuses any database whose name does not end in "_test".
export async function resetTestDatabase(url: string): Promise<Db> {
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to reset non-test database "${dbName}"`);
  }
  const db = createDb(url);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.execute(sql`
    INSERT INTO organizations (id, name) VALUES
      (${ORG_A}, 'Org A'),
      (${ORG_B}, 'Org B')
  `);
  return db;
}

export async function closeDb(db: Db): Promise<void> {
  await (db.$client as unknown as { end: () => Promise<void> }).end();
}
