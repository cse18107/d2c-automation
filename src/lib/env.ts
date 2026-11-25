import { z } from "zod";

// Validated lazily so `next build` and drizzle-kit do not need every key.
// Not marked "server-only" because drizzle.config.ts loads it outside Next.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  STORAGE_ENDPOINT: z.url(),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_REGION: z.string().min(1).default("us-east-1"),
  DEV_SESSION_ORG_ID: z.uuid().optional(),
  INNGEST_DEV: z.enum(["0", "1"]).default("1"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const keys = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid environment configuration: ${keys}`);
  }
  return parsed.data;
}
