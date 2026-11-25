import { z } from "zod";

// Each area validates only its own keys, so the database layer does not need
// storage credentials and drizzle-kit can run with just DATABASE_URL.
// Not "server-only": drizzle.config.ts loads this outside Next.js.

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const storageSchema = z.object({
  STORAGE_ENDPOINT: z.url(),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_REGION: z.string().min(1).default("us-east-1"),
});

const sessionSchema = z.object({
  DEV_SESSION_ORG_ID: z.uuidv7().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type StorageEnv = z.infer<typeof storageSchema>;
export type SessionEnv = z.infer<typeof sessionSchema>;

function parseEnv<T extends z.ZodType>(
  schema: T,
  source: NodeJS.ProcessEnv,
): z.output<T> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const keys = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid environment configuration: ${keys}`);
  }
  return parsed.data;
}

export function getDatabaseUrl(
  source: NodeJS.ProcessEnv = process.env,
): string {
  return parseEnv(databaseSchema, source).DATABASE_URL;
}

export function getStorageEnv(
  source: NodeJS.ProcessEnv = process.env,
): StorageEnv {
  return parseEnv(storageSchema, source);
}

export function getSessionEnv(
  source: NodeJS.ProcessEnv = process.env,
): SessionEnv {
  return parseEnv(sessionSchema, source);
}
