import "server-only";
import {
  failContentJob,
  markContentJobRunning,
  markContentJobSucceeded,
} from "@/server/content/job-lifecycle";
import { nonRetriable } from "@/server/content/run-step";
import { buildStageContext } from "@/server/content/runtime";
import type { StageScope } from "@/server/content/stages/context";
import { generateCreativesStage } from "@/server/content/stages/creatives";
import { generateListingsStage } from "@/server/content/stages/listings";
import { loadProductInputs } from "@/server/content/stages/load";
import { ensurePkrStage, extractPkrStage } from "@/server/content/stages/pkr";
import {
  pollVideoStage,
  submitVideoStage,
  timeOutVideo,
} from "@/server/content/stages/videos";
import { getDb } from "@/server/db";
import { inngest } from "./client";
import {
  CONTENT_REQUESTED_EVENT,
  type ContentRequestedData,
} from "./content-client";

// Video providers take minutes. Poll every 30 s for up to 40 rounds (20 min).
const POLL_INTERVAL = "30s";
const MAX_POLL_ROUNDS = 40;

function toScope(data: ContentRequestedData): StageScope {
  return {
    orgId: data.orgId,
    productId: data.productId,
    jobId: data.jobId,
    actorId: data.actorId,
  };
}

// One durable run per content job. The run's scope picks the stages:
//   text    -> PKR (new version) -> marketplace listing and ad copy
//   images  -> PKR (reused if present) -> image slots (only the requested ones)
//   videos  -> PKR (reused if present) -> one video per request, then polling
// Each stage is a memoized step, so a retry resumes at the failed step. Each video
// is submitted in its own step, so a retry never submits the same video twice.
export const generateContent = inngest.createFunction(
  {
    id: "generate-content",
    triggers: [{ event: CONTENT_REQUESTED_EVENT }],
    retries: 2,
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event: { data: ContentRequestedData } })
        .event.data;
      const message =
        error instanceof Error ? error.message : "Generation failed";
      // NonRetriableError marks a permanent failure (bad input, spend cap, missing key).
      const permanent =
        error instanceof Error && error.name === "NonRetriableError";
      await failContentJob(
        getDb(),
        toScope(original),
        permanent ? "PERMANENT" : "TRANSIENT",
        message,
      );
    },
  },
  async ({ event, step }) => {
    const data = event.data as ContentRequestedData;
    const scope = toScope(data);
    const db = getDb();
    // Inngest returns step output after a JSON round trip. Every stage returns plain
    // JSON (ids, PKR body, poll outcome), so the cast only restores the type.
    const runStep = <T>(id: string, fn: () => Promise<T>): Promise<T> =>
      step.run(id, () => nonRetriable(fn)) as unknown as Promise<T>;

    const started = await step.run("start", () =>
      markContentJobRunning(db, scope),
    );
    if (!started) return { status: "stopped" as const };

    const inputs = await runStep("load-inputs", () =>
      loadProductInputs(buildStageContext(scope)),
    );
    const pkrInput = {
      productName: inputs.productName,
      documentText: inputs.documentText,
    };

    if (data.scope === "text") {
      const pkr = await runStep("extract-pkr", () =>
        extractPkrStage(buildStageContext(scope), pkrInput),
      );
      await runStep("generate-listings", () =>
        generateListingsStage(buildStageContext(scope), {
          pkr: pkr.body,
          pkrId: pkr.pkrId,
        }),
      );
    } else {
      if (data.scope === "images") {
        const pkr = await runStep("ensure-pkr", () =>
          ensurePkrStage(buildStageContext(scope), pkrInput),
        );
        await runStep("generate-creatives", () =>
          generateCreativesStage(buildStageContext(scope), {
            pkr: pkr.body,
            photo: inputs.photo,
            slots: data.slots,
          }),
        );
      } else {
        const pkr = await runStep("ensure-pkr", () =>
          ensurePkrStage(buildStageContext(scope), pkrInput),
        );
        const videoIds: string[] = [];
        for (let n = 1; n <= data.videoCount; n++) {
          const id = await runStep(`submit-video-${n}`, () =>
            submitVideoStage(buildStageContext(scope), {
              pkr: pkr.body,
              photo: inputs.photo,
              productName: inputs.productName,
              durationSeconds: data.videoDurationSeconds,
              videoNumber: n,
            }),
          );
          videoIds.push(id);
        }

        // Round-robin polling: every unfinished video is checked once per round.
        let pending = videoIds;
        for (
          let round = 1;
          round <= MAX_POLL_ROUNDS && pending.length > 0;
          round++
        ) {
          await step.sleep(`wait-${round}`, POLL_INTERVAL);
          const stillRunning: string[] = [];
          for (const id of pending) {
            const outcome = await runStep(`poll-${round}-${id}`, () =>
              pollVideoStage(buildStageContext(scope), id),
            );
            if (!outcome.done) stillRunning.push(id);
          }
          pending = stillRunning;
        }
        for (const id of pending) {
          await runStep(`timeout-${id}`, () =>
            timeOutVideo(buildStageContext(scope), id),
          );
        }
      }
    }

    await step.run("finalize", () => markContentJobSucceeded(db, scope));
    return { status: "succeeded" as const };
  },
);
