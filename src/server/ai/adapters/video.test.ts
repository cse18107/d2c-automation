import { describe, expect, it, vi } from "vitest";
import { PermanentError, TransientError } from "@/server/errors";
import { type FetchLike, OpenRouterGateway } from "../gateway";
import {
  downloadVideo,
  mapProviderStatus,
  pollVideo,
  submitVideo,
} from "./video";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const submitInput = {
  modelId: "alibaba/wan-3.0",
  prompt: "Person-free scene of the gel on a bathroom shelf",
  firstFrameUrl: "https://storage.example/first.jpg",
  durationSeconds: 8,
  resolution: "720p",
  aspectRatio: "9:16",
};

describe("submitVideo", () => {
  it("posts a first-frame image-to-video request without zdr and with audio off", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      json({ id: "job_1", status: "pending" }, 202),
    );
    const gw = new OpenRouterGateway({ apiKey: "k", fetchImpl });
    const result = await submitVideo(gw, submitInput);

    expect(result).toEqual({ providerJobId: "job_1", status: "pending" });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/v1/videos");
    const body = JSON.parse(String(init?.body));
    expect(body.generate_audio).toBe(false);
    expect(body.zdr).toBeUndefined();
    expect(body.frame_images).toEqual([
      {
        type: "image_url",
        image_url: { url: "https://storage.example/first.jpg" },
        frame_type: "first_frame",
      },
    ]);
  });
});

describe("pollVideo", () => {
  it("returns the download URL and cost when completed", async () => {
    const gw = new OpenRouterGateway({
      apiKey: "k",
      fetchImpl: async () =>
        json({
          id: "job_1",
          status: "completed",
          unsigned_urls: ["https://cdn.example/v.mp4"],
          usage: { cost: 0.8 },
        }),
    });
    const polled = await pollVideo(gw, "job_1");
    expect(polled.status).toBe("completed");
    expect(polled.downloadUrl).toBe("https://cdn.example/v.mp4");
    expect(polled.costMinor).toBe(80);
  });

  it("records the cost of a failed job and its error text", async () => {
    const gw = new OpenRouterGateway({
      apiKey: "k",
      fetchImpl: async () =>
        json({
          id: "job_2",
          status: "failed",
          error: "content policy",
          usage: { cost: 0.1 },
        }),
    });
    const polled = await pollVideo(gw, "job_2");
    expect(polled.status).toBe("failed");
    expect(polled.costMinor).toBe(10);
    expect(polled.errorMessage).toBe("content policy");
  });

  it("encodes the job id in the path", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      json({ id: "a/b", status: "running" }),
    );
    const gw = new OpenRouterGateway({ apiKey: "k", fetchImpl });
    await pollVideo(gw, "a/b");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://openrouter.ai/api/v1/videos/a%2Fb",
    );
  });
});

describe("mapProviderStatus", () => {
  it("maps in-flight states to running", () => {
    expect(mapProviderStatus("in_progress")).toBe("running");
  });

  it("treats an unknown status as transient rather than guessing", () => {
    expect(() => mapProviderStatus("mystery")).toThrow(TransientError);
  });
});

describe("downloadVideo", () => {
  it("returns the bytes with the key header", async () => {
    const fetchImpl = vi.fn<FetchLike>(
      async () => new Response(new Uint8Array([1, 2, 3])),
    );
    const bytes = await downloadVideo(
      fetchImpl,
      "k",
      "https://cdn.example/v.mp4",
    );
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer k");
  });

  it("refuses a non-HTTPS URL", async () => {
    await expect(
      downloadVideo(
        async () => new Response(),
        "k",
        "http://cdn.example/v.mp4",
      ),
    ).rejects.toBeInstanceOf(PermanentError);
  });

  it("reports an expired copy as permanent", async () => {
    await expect(
      downloadVideo(
        async () => new Response(null, { status: 410 }),
        "k",
        "https://cdn.example/v.mp4",
      ),
    ).rejects.toThrow("expired");
  });
});
