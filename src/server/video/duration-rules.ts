import "server-only";
import { ValidationError } from "@/server/errors";

// Per-model video rules, from the OpenRouter video models docs (checked
// 2026-11-25; ADR 0004). Prices are integer US cents per second, rounded up.
// Per-model quirks stay here, not in the app code (CLAUDE.md §8).
export type VideoModelRules = {
  modelId: string;
  durations:
    | { kind: "range"; min: number; max: number }
    | { kind: "list"; values: readonly number[] };
  // Cents per second by resolution, with generate_audio false.
  centsPerSecond: Record<string, number>;
  aspectRatios: readonly string[];
  imageToVideo: boolean;
};

export const VIDEO_MODEL_RULES: readonly VideoModelRules[] = [
  {
    modelId: "alibaba/wan-3.0",
    durations: { kind: "range", min: 2, max: 30 },
    centsPerSecond: { "480p": 5, "720p": 10, "1080p": 20 },
    aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
    imageToVideo: true,
  },
  {
    modelId: "google/veo-3.1-lite",
    durations: { kind: "list", values: [4, 6, 8] },
    // Without audio: 720p $0.03/s, base (1080p) $0.05/s.
    centsPerSecond: { "720p": 3, "1080p": 5 },
    aspectRatios: ["16:9", "9:16"],
    imageToVideo: true,
  },
];

export function getVideoModelRules(modelId: string): VideoModelRules {
  const rules = VIDEO_MODEL_RULES.find((r) => r.modelId === modelId);
  if (rules === undefined) {
    throw new ValidationError(
      `Video model ${modelId} is not in the rules table. Add it before use.`,
    );
  }
  return rules;
}

// Durations the UI may offer for a model, intersected with the product's 6–15 s.
export function allowedDurations(
  rules: VideoModelRules,
  productMin: number,
  productMax: number,
): number[] {
  const { durations } = rules;
  if (durations.kind === "range") {
    const lo = Math.max(durations.min, productMin);
    const hi = Math.min(durations.max, productMax);
    const out: number[] = [];
    for (let s = lo; s <= hi; s++) out.push(s);
    return out;
  }
  return durations.values.filter((s) => s >= productMin && s <= productMax);
}

// Unsupported values are rejected, never snapped silently (ADR 0004).
export function assertDurationSupported(
  rules: VideoModelRules,
  seconds: number,
  productMin: number,
  productMax: number,
): void {
  if (!allowedDurations(rules, productMin, productMax).includes(seconds)) {
    throw new ValidationError(
      `${rules.modelId} does not support ${seconds} s videos in this range`,
    );
  }
}

export function centsPerSecond(
  rules: VideoModelRules,
  resolution: string,
): number {
  const rate = rules.centsPerSecond[resolution];
  if (rate === undefined) {
    throw new ValidationError(
      `${rules.modelId} does not support resolution ${resolution}`,
    );
  }
  return rate;
}
