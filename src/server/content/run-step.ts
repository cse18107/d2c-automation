import "server-only";
import { NonRetriableError } from "inngest";
import { AppError } from "@/server/errors";

// Wraps one stage so permanent failures (bad input, spend cap, missing key) are
// not retried: they end the run through onFailure. Transient and rate-limit errors
// are retried by Inngest.
export async function nonRetriable<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      error instanceof AppError &&
      error.code !== "TRANSIENT" &&
      error.code !== "RATE_LIMITED"
    ) {
      throw new NonRetriableError(error.message);
    }
    throw error;
  }
}
