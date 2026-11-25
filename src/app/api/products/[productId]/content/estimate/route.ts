import {
  contentEstimateQuerySchema,
  contentEstimateResponseSchema,
} from "@/schemas/content-job";
import { getEstimate } from "@/server/content/service";
import { getDb } from "@/server/db";
import { handleApi, idParam, jsonResponse } from "@/server/http/api";

type Params = { params: Promise<{ productId: string }> };

// Estimated cost before the user confirms a run (CLAUDE.md §8).
export async function GET(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    const url = new URL(request.url);
    const query = contentEstimateQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );
    const estimate = await getEstimate(
      getDb(),
      session,
      idParam(productId),
      query,
    );
    return jsonResponse(contentEstimateResponseSchema, estimate);
  });
}
