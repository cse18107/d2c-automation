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

// AI and video settings (ADR 0003, ADR 0004). Model IDs are never hard-coded in
// app code. Text and image defaults are deliberately absent until the OpenRouter
// models check is done (spec Q5); a missing value fails with a clear message.
const aiSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  // Defaults checked against OpenRouter models list on 2026-11-25 (ADR 0003).
  AI_TEXT_MODEL_ID: z.string().min(1).default("anthropic/claude-haiku-5.5"),
  AI_IMAGE_MODEL_ID: z.string().min(1).default("google/gemini-3.1-flash-image"),
  AI_IMAGE_EDIT_MODEL_ID: z
    .string()
    .min(1)
    .default("google/gemini-3.1-flash-image"),
  AI_VIDEO_MODEL_ID: z.string().min(1).default("alibaba/wan-3.0"),
  // Used when the run asks for sound (see duration-rules.ts for its price).
  AI_VIDEO_SOUND_MODEL_ID: z
    .string()
    .min(1)
    .default("google/gemini-omni-1.2-flash"),
  AI_VIDEO_FALLBACK_MODEL_ID: z.string().min(1).default("google/veo-3.1-lite"),
  AI_DEFAULT_SPEND_CAP_MINOR: z.coerce.number().int().positive().optional(),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  // Font for burned-in captions. The default is the macOS Arial path.
  FFMPEG_FONT_FILE: z
    .string()
    .min(1)
    .default("/System/Library/Fonts/Supplemental/Arial.ttf"),
});

export type AiEnv = z.infer<typeof aiSchema>;

export function getAiEnv(source: NodeJS.ProcessEnv = process.env): AiEnv {
  return parseEnv(aiSchema, source);
}
