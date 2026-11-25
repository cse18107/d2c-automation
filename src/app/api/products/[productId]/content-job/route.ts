import { contentJobResponseSchema } from "@/schemas/content-job";
import { getLatestJobs } from "@/server/content/service";
import { getDb } from "@/server/db";
import { handleApi, idParam, jsonResponse } from "@/server/http/api";

type Params = { params: Promise<{ productId: string }> };

// Polled by the content screen while a run is queued or running.
export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    const latest = await getLatestJobs(getDb(), session, idParam(productId));
    return jsonResponse(contentJobResponseSchema, {
      job: latest.latest,
      productStatus: latest.productStatus,
    });
  });
}
