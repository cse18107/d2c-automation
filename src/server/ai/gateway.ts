import "server-only";
import { z } from "zod";
import {
  PermanentError,
  RateLimitedError,
  TransientError,
  ValidationError,
} from "@/server/errors";

// The one OpenRouter gateway (CLAUDE.md §8, ADR 0003). Everything goes through
// `fetch` with an injected implementation, so tests never reach the network.
// Response bodies are never copied into errors: they can echo prompts.

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type GatewayOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

export type ChatJsonInput<T> = {
  modelId: string;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parse: z.ZodType<T>;
};

export type ChatJsonResult<T> = {
  value: T;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costMinor: number | null;
};

export type ImageInput = { mediaType: string; base64: string };

export type GenerateImageInput = {
  modelId: string;
  prompt: string;
  inputImages?: readonly ImageInput[];
  aspectRatio?: string;
  resolution?: string;
};

export type GeneratedImage = {
  base64: string;
  mediaType: string;
  costMinor: number | null;
};

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

const chatResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      cost: z.number().nonnegative().optional(),
    })
    .optional(),
});

const imageResponseSchema = z.object({
  data: z
    .array(
      z.object({
        b64_json: z.string().min(1).optional(),
        media_type: z.string().optional(),
      }),
    )
    .min(1),
  usage: z.object({ cost: z.number().nonnegative().optional() }).optional(),
});

// The model's output was not valid JSON or failed the schema. This is the only
// error that triggers the one retry in structured.ts.
export class AiOutputError extends ValidationError {}

// Maps an HTTP status to a normalized error (ADR 0003). No body text is copied.
export function errorForStatus(status: number, providerReason?: string): Error {
  if (status === 401 || status === 403) {
    return new PermanentError("AI provider rejected the API key");
  }
  if (status === 402) {
    return new PermanentError(
      "OpenRouter account has no credit left. Add credit at openrouter.ai, then try again.",
    );
  }
  if (status === 404) {
    return new PermanentError("Model unavailable. Choose another model.");
  }
  if (status === 400 || status === 422) {
    return new ValidationError(
      providerReason
        ? `AI provider rejected the request: ${providerReason}`
        : "AI provider rejected the request",
    );
  }
  if (status === 429) {
    return new RateLimitedError("AI provider rate limit reached");
  }
  if (status >= 500) {
    return new TransientError("AI provider is temporarily unavailable");
  }
  return new PermanentError(`AI provider returned status ${status}`);
}

// The provider's error message, if it sent one. Truncated, and only the message
// field is read, so no request or prompt text is copied into our errors.
async function providerReason(res: Response): Promise<string | undefined> {
  const body: unknown = await res.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("error" in body))
    return undefined;
  const error = (body as { error: unknown }).error;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? (error as { message: unknown }).message
      : error;
  return typeof message === "string" ? message.slice(0, 300) : undefined;
}

export class OpenRouterGateway {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: GatewayOptions) {
    if (options.apiKey.length === 0) {
      throw new PermanentError("OPENROUTER_API_KEY is not set");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  // Shared request helper. Adds the key only as a header, never to a log line.
  async postJson(path: string, body: unknown): Promise<unknown> {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async getJson(path: string): Promise<unknown> {
    return this.request(path, { method: "GET" });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
    } catch {
      throw new TransientError("Could not reach the AI provider");
    }
    if (!res.ok) {
      throw errorForStatus(res.status, await providerReason(res));
    }
    return res.json().catch(() => {
      throw new TransientError("AI provider returned an unreadable response");
    });
  }

  async chatJson<T>(input: ChatJsonInput<T>): Promise<ChatJsonResult<T>> {
    const raw = await this.postJson("/chat/completions", {
      model: input.modelId,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: input.jsonSchema,
        },
      },
    });
    const parsed = chatResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new TransientError("AI provider returned an unexpected shape");
    }
    const content = parsed.data.choices[0]?.message.content;
    if (content === null || content === undefined) {
      throw new ValidationError("AI provider returned no content");
    }
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      throw new AiOutputError("AI output was not valid JSON");
    }
    const value = input.parse.safeParse(json);
    if (!value.success) {
      throw new AiOutputError(
        `AI output failed validation: ${value.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`,
      );
    }
    return {
      value: value.data,
      modelId: input.modelId,
      inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
      outputTokens: parsed.data.usage?.completion_tokens ?? 0,
      costMinor:
        parsed.data.usage?.cost === undefined
          ? null
          : Math.ceil(parsed.data.usage.cost * 100 - 1e-9),
    };
  }

  async generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
    const raw = await this.postJson("/images", {
      model: input.modelId,
      prompt: input.prompt,
      response_format: "b64_json",
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.resolution ? { resolution: input.resolution } : {}),
      ...(input.inputImages && input.inputImages.length > 0
        ? {
            input_references: input.inputImages.map((img) => ({
              type: "image_url",
              image_url: {
                url: `data:${img.mediaType};base64,${img.base64}`,
              },
            })),
          }
        : {}),
    });
    const parsed = imageResponseSchema.safeParse(raw);
    const first = parsed.success ? parsed.data.data[0] : undefined;
    if (!parsed.success || first?.b64_json === undefined) {
      throw new TransientError("AI provider returned no image");
    }
    return {
      base64: first.b64_json,
      mediaType: first.media_type ?? "image/png",
      costMinor:
        parsed.data.usage?.cost === undefined
          ? null
          : Math.ceil(parsed.data.usage.cost * 100 - 1e-9),
    };
  }
}
