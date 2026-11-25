import { z } from "zod";

const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("d2c-autopilot"),
  timestamp: z.iso.datetime(),
});

export type Health = z.infer<typeof healthSchema>;

export function GET(): Response {
  const body: Health = healthSchema.parse({
    status: "ok",
    service: "d2c-autopilot",
    timestamp: new Date().toISOString(),
  });

  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
