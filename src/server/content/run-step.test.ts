import { NonRetriableError } from "inngest";
import { describe, expect, it } from "vitest";
import { PermanentError, TransientError } from "@/server/errors";
import { nonRetriable } from "./run-step";

describe("nonRetriable", () => {
  it("turns a permanent failure into a non-retriable one", async () => {
    await expect(
      nonRetriable(() =>
        Promise.reject(new PermanentError("Spend cap reached")),
      ),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("keeps a transient failure retriable", async () => {
    await expect(
      nonRetriable(() => Promise.reject(new TransientError("try later"))),
    ).rejects.not.toBeInstanceOf(NonRetriableError);
  });

  it("returns the value on success", async () => {
    await expect(nonRetriable(async () => 42)).resolves.toBe(42);
  });
});
