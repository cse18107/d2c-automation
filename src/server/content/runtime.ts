import "server-only";
import { getAiEnv } from "@/lib/env";
import { OpenRouterGateway } from "@/server/ai/gateway";
import { getDb } from "@/server/db";
import { PermanentError } from "@/server/errors";
import { createDownloadUrl, readObject, writeObject } from "@/server/storage";
import { createAiPort } from "./ai-port";
import type { StageContext, StageScope } from "./stages/context";

// Wires the real providers into the stage context. Only the Inngest function and
// the routes call this; the stages themselves take the context as an argument.
export function buildStageContext(scope: StageScope): StageContext {
  const env = getAiEnv();
  if (!env.OPENROUTER_API_KEY) {
    throw new PermanentError(
      "OPENROUTER_API_KEY is not set. Add it to .env.local and restart the server.",
    );
  }
  const gateway = new OpenRouterGateway({ apiKey: env.OPENROUTER_API_KEY });
  return {
    db: getDb(),
    scope,
    ai: createAiPort(gateway, env.OPENROUTER_API_KEY),
    storage: {
      readObject,
      writeObject: (key, bytes, contentType) =>
        writeObject(key, bytes, contentType),
      createDownloadUrl,
    },
    models: {
      text: env.AI_TEXT_MODEL_ID,
      image: env.AI_IMAGE_MODEL_ID,
      imageEdit: env.AI_IMAGE_EDIT_MODEL_ID,
      video: env.AI_VIDEO_MODEL_ID,
    },
    ffmpegPath: env.FFMPEG_PATH,
    fontFile: env.FFMPEG_FONT_FILE,
  };
}
