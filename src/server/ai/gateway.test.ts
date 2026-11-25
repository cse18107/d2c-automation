import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  PermanentError,
  RateLimitedError,
  TransientError,
  ValidationError,
} from "@/server/errors";
import {
  AiOutputError,
  errorForStatus,
  type FetchLike,
  OpenRouterGateway,
} from "./gateway";
import { callStructured } from "./structured";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function gatewayWith(fetchImpl: FetchLike): OpenRouterGateway {
  return new OpenRouterGateway({ apiKey: "test-key", fetchImpl });
}

const chatBody = (content: string, cost?: number) => ({
  choices: [{ message: { content } }],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    ...(cost === undefined ? {} : { cost }),
  },
});

const nameSchema = z.object({ name: z.string().min(1) });
const nameJson = { type: "object", properties: { name: { type: "string" } } };

describe("OpenRouterGateway.chatJson", () => {
  it("sends the key as a header and parses a valid answer", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      json(chatBody('{"name":"Gel"}', 0.0021)),
    );
    const result = await gatewayWith(fetchImpl).chatJson({
      modelId: "test/text",
      system: "s",
      user: "u",
      schemaName: "name",
      jsonSchema: nameJson,
      parse: nameSchema,
    });

    expect(result.value).toEqual({ name: "Gel" });
    expect(result.costMinor).toBe(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
    expect(JSON.parse(String(init?.body)).response_format.type).toBe(
      "json_schema",
    );
  });

  it("reports invalid JSON as an output error, not a transient one", async () => {
    const gw = gatewayWith(async () => json(chatBody("not json")));
    await expect(
      gw.chatJson({
        modelId: "m",
        system: "s",
        user: "u",
        schemaName: "n",
        jsonSchema: nameJson,
        parse: nameSchema,
      }),
    ).rejects.toBeInstanceOf(AiOutputError);
  });
});

describe("callStructured", () => {
  it("retries once with the validation error and returns the second answer", async () => {
    const replies = [chatBody('{"name":""}'), chatBody('{"name":"Gel"}')];
    const fetchImpl = vi.fn<FetchLike>(async () => json(replies.shift()));
    const result = await callStructured(gatewayWith(fetchImpl), {
      modelId: "m",
      system: "s",
      user: "u",
      schemaName: "n",
      jsonSchema: nameJson,
      parse: nameSchema,
    });
    expect(result.value.name).toBe("Gel");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(retryBody.messages[1].content).toContain("rejected");
  });

  it("fails with VALIDATION after the second bad answer, with no third call", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      json(chatBody('{"name":""}')),
    );
    await expect(
      callStructured(gatewayWith(fetchImpl), {
        modelId: "m",
        system: "s",
        user: "u",
        schemaName: "n",
        jsonSchema: nameJson,
        parse: nameSchema,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a provider error such as a rejected request", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json({}, 400));
    await expect(
      callStructured(gatewayWith(fetchImpl), {
        modelId: "m",
        system: "s",
        user: "u",
        schemaName: "n",
        jsonSchema: nameJson,
        parse: nameSchema,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("OpenRouterGateway error mapping", () => {
  it.each([
    [401, PermanentError],
    [404, PermanentError],
    [429, RateLimitedError],
    [503, TransientError],
  ])("maps HTTP %i to the normalized error class", async (status, cls) => {
    const gw = gatewayWith(async () => json({ error: "prompt echo" }, status));
    await expect(gw.postJson("/chat/completions", {})).rejects.toBeInstanceOf(
      cls,
    );
  });

  it("never copies the response body into the error message", async () => {
    const gw = gatewayWith(async () =>
      json({ error: "SECRET PROMPT TEXT" }, 500),
    );
    await expect(gw.postJson("/x", {})).rejects.toThrow(
      "AI provider is temporarily unavailable",
    );
  });

  it("treats a network failure as transient", async () => {
    const gw = gatewayWith(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(gw.postJson("/x", {})).rejects.toBeInstanceOf(TransientError);
  });

  it("refuses to start without a key", () => {
    expect(() => new OpenRouterGateway({ apiKey: "" })).toThrow(PermanentError);
  });
});

describe("OpenRouterGateway.generateImage", () => {
  it("sends input photos as data URLs in input_references and returns base64", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      json({ data: [{ b64_json: "aGk=", media_type: "image/png" }] }),
    );
    const img = await gatewayWith(fetchImpl).generateImage({
      modelId: "test/image-edit",
      prompt: "lifestyle shot",
      inputImages: [{ mediaType: "image/jpeg", base64: "anBn" }],
      aspectRatio: "1:1",
    });
    expect(img).toEqual({
      base64: "aGk=",
      mediaType: "image/png",
      costMinor: null,
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.response_format).toBe("b64_json");
    expect(body.input_references[0].image_url.url).toBe(
      "data:image/jpeg;base64,anBn",
    );
  });

  it("fails transiently when the response has no image", async () => {
    const gw = gatewayWith(async () => json({ data: [{}] }));
    await expect(
      gw.generateImage({ modelId: "m", prompt: "p" }),
    ).rejects.toBeInstanceOf(TransientError);
  });
});

describe("errorForStatus 402", () => {
  it("explains that the OpenRouter account needs credit", () => {
    const err = errorForStatus(402);
    expect(err).toBeInstanceOf(PermanentError);
    expect(err.message).toContain("no credit left");
  });
});
