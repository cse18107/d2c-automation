import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { generateContent } from "@/server/jobs/content-function";
import { ingestProduct } from "@/server/jobs/ingest-function";

// Inngest calls this endpoint to run functions. The dev server reaches it at
// http://localhost:3000/api/inngest (see README).
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestProduct, generateContent],
});
