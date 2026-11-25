import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so it reads DATABASE_URL directly and
// does not go through src/lib/env.ts (which needs the full app config).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
