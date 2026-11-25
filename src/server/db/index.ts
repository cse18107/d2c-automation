import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";

export function createDb(url: string) {
  const client = postgres(url, { max: 10, prepare: true });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

// One pool per process. Next.js dev reloads modules, so cache on globalThis.
const globalForDb = globalThis as unknown as { __d2cDb?: Db };

export function getDb(): Db {
  globalForDb.__d2cDb ??= createDb(getDatabaseUrl());
  return globalForDb.__d2cDb;
}
