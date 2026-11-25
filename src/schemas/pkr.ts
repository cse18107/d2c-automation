import { z } from "zod";
import { moneySchema } from "./money";

// Product Knowledge Record (CLAUDE.md §5). The PKR is the only source of claims
// for generated content (CLAUDE.md §8). Missing facts go in missingFields, never
// filled in by the model.
export const pkrClaimSchema = z.object({
  text: z.string().min(1).max(300),
  // Where in the source document the claim came from (for the reviewer).
  sourceRef: z.string().min(1).max(200),
});

export const pkrSpecSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(200),
});

export const pkrBodySchema = z.object({
  name: z.string().min(1).max(120),
  features: z.array(z.string().min(1).max(200)).max(20),
  specs: z.array(pkrSpecSchema).max(40),
  materials: z.array(z.string().min(1).max(80)).max(20),
  price: moneySchema.nullable(),
  claims: z.array(pkrClaimSchema).max(30),
  audience: z.string().max(300).nullable(),
  tone: z.string().max(120).nullable(),
  missingFields: z.array(z.string().min(1).max(80)).max(30),
});
export type PkrBody = z.infer<typeof pkrBodySchema>;

export const pkrRecordSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(["generated", "superseded"]),
  body: pkrBodySchema,
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  promptVersion: z.string().min(1).max(40),
  modelId: z.string().min(1).max(200),
});
export type PkrRecord = z.infer<typeof pkrRecordSchema>;
