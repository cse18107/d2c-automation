import "server-only";
import type { z } from "zod";
import type { ChatJsonInput, ChatJsonResult } from "./gateway";
import { AiOutputError } from "./gateway";

// Any object with a chatJson method: the OpenRouter gateway or a test fake.
export type ChatJsonCapable = {
  chatJson<T>(input: ChatJsonInput<T>): Promise<ChatJsonResult<T>>;
};

// Structured call with one retry (CLAUDE.md §8). The second attempt carries the
// validation error text so the model can correct its output. A second failure
// is a VALIDATION error and fails the step; it is never retried further.
export type StructuredInput<T> = {
  modelId: string;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parse: z.ZodType<T>;
};

export async function callStructured<T>(
  gateway: ChatJsonCapable,
  input: StructuredInput<T>,
): Promise<ChatJsonResult<T>> {
  try {
    return await gateway.chatJson(input);
  } catch (error) {
    if (!(error instanceof AiOutputError)) throw error;
    return gateway.chatJson({
      ...input,
      user: `${input.user}\n\nYour previous answer was rejected: ${error.message}. Return only JSON that matches the schema.`,
    });
  }
}
