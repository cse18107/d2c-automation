import "server-only";
import {
  downloadVideo,
  type PolledVideo,
  pollVideo,
  type SubmittedVideo,
  type SubmitVideoInput,
  submitVideo,
} from "@/server/ai/adapters/video";
import type {
  ChatJsonInput,
  ChatJsonResult,
  GeneratedImage,
  GenerateImageInput,
  OpenRouterGateway,
} from "@/server/ai/gateway";

// The AI surface the content stages use. Tests supply a fake; production uses
// the OpenRouter gateway. Stages never call fetch directly.
export type AiPort = {
  chatJson<T>(input: ChatJsonInput<T>): Promise<ChatJsonResult<T>>;
  generateImage(input: GenerateImageInput): Promise<GeneratedImage>;
  submitVideo(input: SubmitVideoInput): Promise<SubmittedVideo>;
  pollVideo(providerJobId: string): Promise<PolledVideo>;
  downloadVideo(url: string): Promise<Uint8Array>;
};

export function createAiPort(
  gateway: OpenRouterGateway,
  apiKey: string,
): AiPort {
  return {
    chatJson: (input) => gateway.chatJson(input),
    generateImage: (input) => gateway.generateImage(input),
    submitVideo: (input) => submitVideo(gateway, input),
    pollVideo: (id) => pollVideo(gateway, id),
    downloadVideo: (url) => downloadVideo(fetch, apiKey, url),
  };
}
