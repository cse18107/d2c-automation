import { renderDownloadUrl } from "@/server/content/service";
import { getDb } from "@/server/db";
import { handleApi, idParam } from "@/server/http/api";

type Params = { params: Promise<{ renderId: string }> };

// Redirects to a 5-minute signed URL for one generated file, after an org check.
// The signed URL is never stored and never returned as JSON.
export async function GET(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const { renderId } = await params;
  return handleApi(async (session) => {
    const download = new URL(request.url).searchParams.get("download") === "1";
    const url = await renderDownloadUrl(
      getDb(),
      session,
      idParam(renderId),
      download,
    );
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "no-store" },
    });
  });
}
