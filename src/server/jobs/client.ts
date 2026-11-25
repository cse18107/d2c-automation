import "server-only";
import { Inngest } from "inngest";

// The app's Inngest client. Events are sent from request handlers (cheap) and
// handled by functions served at /api/inngest (where the long work runs).
export const inngest = new Inngest({ id: "d2c-autopilot" });

export const INGEST_REQUESTED_EVENT = "product/ingest.requested" as const;

export type IngestRequestedData = {
  orgId: string;
  productId: string;
  jobId: string;
  actorId: string;
};
