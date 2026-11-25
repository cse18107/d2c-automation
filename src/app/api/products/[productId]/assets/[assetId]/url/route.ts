import { and, eq } from "drizzle-orm";
import { downloadUrlResponseSchema } from "@/schemas/api";
import { getDb } from "@/server/db";
import { productAssets } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { NotFoundError } from "@/server/errors";
import { handleApi, idParam, jsonResponse } from "@/server/http/api";
import { loadProductRow } from "@/server/products/service";
import { createDownloadUrl, SIGNED_URL_TTL_SECONDS } from "@/server/storage";

type Params = { params: Promise<{ productId: string; assetId: string }> };

// A short-lived read URL for a verified asset, used for thumbnails. Generated per
// request and never stored (CLAUDE.md §12).
export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId, assetId } = await params;
  return handleApi(async (session) => {
    const db = getDb();
    const product = idParam(productId);
    await loadProductRow(db, session, product);
    const [row] = await db
      .select({
        storageKey: productAssets.storageKey,
        verifiedAt: productAssets.verifiedAt,
      })
      .from(productAssets)
      .where(
        and(
          withOrg(productAssets, session.orgId),
          eq(productAssets.id, idParam(assetId)),
          eq(productAssets.productId, product),
        ),
      )
      .limit(1);
    if (!row || !row.verifiedAt) throw new NotFoundError("Asset not found");
    const url = await createDownloadUrl(row.storageKey);
    return jsonResponse(downloadUrlResponseSchema, {
      url,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    });
  });
}
