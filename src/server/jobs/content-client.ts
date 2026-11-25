import "server-only";
import { inngest } from "./client";

export const CONTENT_REQUESTED_EVENT = "product/content.requested" as const;

export type ContentRequestedData = {
  orgId: string;
  productId: string;
  jobId: string;
  actorId: string;
  scope: "text" | "images" | "videos";
  videoCount: number;
  videoDurationSeconds: number;
  slots?: string[];
};

export async function enqueueContent(
  data: ContentRequestedData,
): Promise<void> {
  await inngest.send({ name: CONTENT_REQUESTED_EVENT, data });
}
