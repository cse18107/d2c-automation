import "server-only";
import {
  INGEST_REQUESTED_EVENT,
  type IngestRequestedData,
  inngest,
} from "./client";

// Sends the event that starts an ingest run. The job row is written first, so
// if this send fails the caller can resend with the same idempotency key.
export async function enqueueIngest(data: IngestRequestedData): Promise<void> {
  await inngest.send({ name: INGEST_REQUESTED_EVENT, data });
}

export { inngest } from "./client";
