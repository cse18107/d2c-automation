import "server-only";
import { and, eq } from "drizzle-orm";
import type { AiPort } from "@/server/content/ai-port";
import { assertWithinCap } from "@/server/content/cost";
import type { Db } from "@/server/db";
import { aiCalls, contentJobs } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { NotFoundError } from "@/server/errors";

// Everything a stage needs. Built once per job by the Inngest function, so the
// stages stay plain functions that tests can drive with fakes.
export type StageScope = {
  orgId: string;
  productId: string;
  jobId: string;
  actorId: string;
};

export type StoragePort = {
  readObject(key: string): Promise<Uint8Array>;
  writeObject(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
  createDownloadUrl(key: string): Promise<string>;
};

export type StageContext = {
  db: Db;
  scope: StageScope;
  ai: AiPort;
  storage: StoragePort;
  models: { text: string; image: string; imageEdit: string; video: string };
  ffmpegPath: string;
  fontFile: string;
};

export type StepRecord = {
  name: string;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  at: string;
};

export type Budget = { capMinor: number | null; spentMinor: number };

export async function loadBudget(ctx: StageContext): Promise<Budget> {
  const [row] = await ctx.db
    .select({
      capMinor: contentJobs.capMinor,
      spentMinor: contentJobs.spentMinor,
    })
    .from(contentJobs)
    .where(
      and(
        withOrg(contentJobs, ctx.scope.orgId),
        eq(contentJobs.id, ctx.scope.jobId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Content job not found");
  return { capMinor: row.capMinor, spentMinor: row.spentMinor };
}

async function saveSpent(ctx: StageContext, spentMinor: number): Promise<void> {
  await ctx.db
    .update(contentJobs)
    .set({ spentMinor })
    .where(
      and(
        withOrg(contentJobs, ctx.scope.orgId),
        eq(contentJobs.id, ctx.scope.jobId),
      ),
    );
}

async function recordAiCall(
  ctx: StageContext,
  input: {
    purpose: string;
    promptVersion: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    costMinor: number;
    status: "ok" | "error";
  },
): Promise<void> {
  // Append-only table (migration 0004). Insert only.
  await ctx.db.insert(aiCalls).values({
    orgId: ctx.scope.orgId,
    productId: ctx.scope.productId,
    contentJobId: ctx.scope.jobId,
    purpose: input.purpose,
    promptVersion: input.promptVersion,
    modelId: input.modelId,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costMinor: input.costMinor,
    currency: "USD",
    status: input.status,
  });
}

export type PaidResult<T> = {
  value: T;
  costMinor: number | null;
  inputTokens?: number;
  outputTokens?: number;
};

// Runs one model call with a spend reservation (budget.ts). The cap is checked
// first, the ceiling is reserved, and the real cost replaces it afterwards. If
// the call fails, the reservation stays: the provider may still have charged.
export async function paidCall<T>(
  ctx: StageContext,
  input: {
    purpose: string;
    promptVersion: string;
    modelId: string;
    ceilingMinor: number;
    run: () => Promise<PaidResult<T>>;
  },
): Promise<{ value: T; chargedMinor: number }> {
  const budget = await loadBudget(ctx);
  assertWithinCap({
    capMinor: budget.capMinor,
    spentMinor: budget.spentMinor,
    nextCallMinor: input.ceilingMinor,
  });
  await saveSpent(ctx, budget.spentMinor + input.ceilingMinor);

  let result: PaidResult<T>;
  try {
    result = await input.run();
  } catch (error) {
    await recordAiCall(ctx, {
      purpose: input.purpose,
      promptVersion: input.promptVersion,
      modelId: input.modelId,
      inputTokens: 0,
      outputTokens: 0,
      costMinor: input.ceilingMinor,
      status: "error",
    });
    throw error;
  }

  const charged = result.costMinor ?? input.ceilingMinor;
  await saveSpent(ctx, budget.spentMinor + charged);
  await recordAiCall(ctx, {
    purpose: input.purpose,
    promptVersion: input.promptVersion,
    modelId: input.modelId,
    inputTokens: result.inputTokens ?? 0,
    outputTokens: result.outputTokens ?? 0,
    costMinor: charged,
    status: "ok",
  });
  return { value: result.value, chargedMinor: charged };
}

// Video spend uses the exact estimate, held until the job finishes (ADR 0004).
export async function reserveVideoSpend(
  ctx: StageContext,
  estimateMinor: number,
): Promise<void> {
  const budget = await loadBudget(ctx);
  assertWithinCap({
    capMinor: budget.capMinor,
    spentMinor: budget.spentMinor,
    nextCallMinor: estimateMinor,
  });
  await saveSpent(ctx, budget.spentMinor + estimateMinor);
}

// Replaces the held estimate with the provider's reported cost. A null cost keeps
// the estimate. Passing 0 releases a job that never reached the provider.
export async function settleVideoSpend(
  ctx: StageContext,
  estimateMinor: number,
  actualMinor: number | null,
): Promise<number> {
  const budget = await loadBudget(ctx);
  const charged = actualMinor ?? estimateMinor;
  await saveSpent(
    ctx,
    Math.max(0, budget.spentMinor - estimateMinor + charged),
  );
  return charged;
}

export async function setStepStatus(
  ctx: StageContext,
  name: string,
  status: "running" | "succeeded" | "failed",
  error: string | null,
): Promise<void> {
  const [job] = await ctx.db
    .select({ steps: contentJobs.steps })
    .from(contentJobs)
    .where(
      and(
        withOrg(contentJobs, ctx.scope.orgId),
        eq(contentJobs.id, ctx.scope.jobId),
      ),
    )
    .limit(1);
  if (!job) return;
  const steps = (job.steps as StepRecord[]).filter((s) => s.name !== name);
  steps.push({ name, status, error, at: new Date().toISOString() });
  await ctx.db
    .update(contentJobs)
    .set({ steps })
    .where(
      and(
        withOrg(contentJobs, ctx.scope.orgId),
        eq(contentJobs.id, ctx.scope.jobId),
      ),
    );
}
