import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common";

// Append-only: there is no updatedAt, and the database rejects UPDATE/DELETE.
export const auditEventSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  actorId: z.string().min(1),
  action: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  entityType: z.string().min(1),
  entityId: idSchema,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: isoDateTimeSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditEventInputSchema = auditEventSchema.omit({
  id: true,
  createdAt: true,
});
export type AuditEventInput = z.infer<typeof auditEventInputSchema>;
