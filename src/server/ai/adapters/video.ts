import "server-only";
import { z } from "zod";
import type { VideoJobStatus } from "@/schemas/video";
import { PermanentError, TransientError } from "@/server/errors";
import type { OpenRouterGateway } from "../gateway";

// OpenRouter video adapter (ADR 0004). Submit, poll and download. The gateway
// owns auth and error mapping; this file only knows the video request shape.
export type SubmitVideoInput = {
  modelId: string;
  prompt: string;
  // Short-TTL signed URL to the sanitized first-frame photo (ADR 0004).
  firstFrameUrl: string;
  durationSeconds: number;
  resolution: string;
  aspectRatio: string;
};

export type SubmittedVideo = { providerJobId: string; status: VideoJobStatus };

const submitResponseSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
});

const pollResponseSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  unsigned_urls: z.array(z.string().url()).optional(),
  error: z.string().nullable().optional(),
  usage: z
    .object({ cost: z.number().nonnegative().optional() })
    .nullable()
    .optional(),
});

// Provider states. Anything in flight maps to `running`; an unknown value is a
// transient error, never a guess (the job is re-polled).
const STATUS_MAP: Record<string, VideoJobStatus> = {
  pending: "pending",
  in_progress: "running",
  running: "running",
  processing: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  expired: "expired",
};

export function mapProviderStatus(status: string): VideoJobStatus {
  const mapped = STATUS_MAP[status];
  if (mapped === undefined) {
    throw new TransientError("Video provider returned an unknown status");
  }
  return mapped;
}

export async function submitVideo(
  gateway: Pick<OpenRouterGateway, "postJson">,
  input: SubmitVideoInput,
): Promise<SubmittedVideo> {
  const raw = await gateway.postJson("/videos", {
    model: input.modelId,
    prompt: input.prompt,
    duration: input.durationSeconds,
    resolution: input.resolution,
    aspect_ratio: input.aspectRatio,
    generate_audio: false,
    frame_images: [
      {
        type: "image_url",
        image_url: { url: input.firstFrameUrl },
        frame_type: "first_frame",
      },
    ],
  });
  const parsed = submitResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TransientError("Video provider returned an unexpected shape");
  }
  return {
    providerJobId: parsed.data.id,
    status: mapProviderStatus(parsed.data.status),
  };
}

export type PolledVideo = {
  status: VideoJobStatus;
  downloadUrl: string | null;
  costMinor: number | null;
  errorMessage: string | null;
};

export async function pollVideo(
  gateway: Pick<OpenRouterGateway, "getJson">,
  providerJobId: string,
): Promise<PolledVideo> {
  const raw = await gateway.getJson(
    `/videos/${encodeURIComponent(providerJobId)}`,
  );
  const parsed = pollResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TransientError("Video provider returned an unexpected shape");
  }
  const cost = parsed.data.usage?.cost;
  return {
    status: mapProviderStatus(parsed.data.status),
    downloadUrl: parsed.data.unsigned_urls?.[0] ?? null,
    costMinor: cost === undefined ? null : Math.ceil(cost * 100 - 1e-9),
    errorMessage: parsed.data.error ?? null,
  };
}

// Maximum bytes accepted from the provider for one clip (guards the worker).
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export async function downloadVideo(
  fetchImpl: (input: string, init: RequestInit) => Promise<Response>,
  apiKey: string,
  url: string,
): Promise<Uint8Array> {
  if (!url.startsWith("https://")) {
    throw new PermanentError("Video download URL must use HTTPS");
  }
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw new TransientError("Could not download the video");
  }
  if (res.status === 404 || res.status === 410) {
    throw new PermanentError("The video expired before it was downloaded");
  }
  if (!res.ok) throw new TransientError("Could not download the video");
  const length = Number(res.headers.get("content-length") ?? "0");
  if (length > MAX_VIDEO_BYTES) {
    throw new PermanentError("Video is larger than the allowed size");
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_VIDEO_BYTES) {
    throw new PermanentError("Video is larger than the allowed size");
  }
  return bytes;
}
