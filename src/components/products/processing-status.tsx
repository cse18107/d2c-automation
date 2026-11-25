"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ingestJobResponseSchema, productResponseSchema } from "@/schemas/api";
import type { IngestJob, IngestStep } from "@/schemas/ingest";
import type { Product } from "@/schemas/product";
import { messageOf } from "./messages";

const POLL_MS = 2000;
const TERMINAL = new Set<IngestJob["status"]>([
  "succeeded",
  "failed",
  "cancelled",
]);

type Snapshot = { job: IngestJob; product: Product };

// One row per pipeline step, as in design frame 03. Only "ingest" runs in Step 01;
// the rest are shown as queued, matching the design, and start in later steps.
const LATER_STEPS = [
  { name: "extract_pkr", note: "Builds the Product Knowledge Record" },
  { name: "generate_creatives", note: "Waiting for PKR" },
  { name: "generate_listings", note: "Waiting for PKR" },
  {
    name: "policy_check",
    note: "Prohibited claims, trademarks, text limits, image size",
  },
  { name: "await_review", note: "Goes to review queue when done" },
] as const;

const SUB_STEP_LABEL: Record<IngestStep["name"], string> = {
  load_assets: "Checking the files",
  parse_document: "Reading the product document",
  finalize: "Saving the results",
};

type RowState = "done" | "running" | "queued" | "failed" | "cancelled";

const PILL: Record<
  RowState,
  { label: string; className: string; dot: string }
> = {
  done: {
    label: "Done",
    className: "bg-[#ecfdf3] text-[#027a48]",
    dot: "bg-[#12b76a]",
  },
  running: {
    label: "Running",
    className: "bg-[#fffaeb] text-[#b54708]",
    dot: "bg-[#f79009]",
  },
  queued: {
    label: "Queued",
    className: "bg-secondary text-secondary-foreground",
    dot: "bg-border",
  },
  failed: {
    label: "Failed",
    className: "bg-[#fef3f2] text-[#b42318]",
    dot: "bg-[#f04438]",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-secondary text-secondary-foreground",
    dot: "bg-border",
  },
};

function ingestState(job: IngestJob): RowState {
  if (job.status === "succeeded") return "done";
  if (job.status === "failed") return "failed";
  if (job.status === "cancelled") return "cancelled";
  if (job.status === "running") return "running";
  return "queued";
}

export function ProcessingStatus({ productId }: { productId: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [notStarted, setNotStarted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A retry is a new run, so it gets a new key. A failed request reuses the key.
  const retryKey = useRef<string>(crypto.randomUUID());

  const load = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/api/products/${productId}/ingest`,
        {},
        (body) => ingestJobResponseSchema.parse(body),
      );
      setSnapshot(response);
      setNotStarted(false);
      setLoadError(null);
    } catch (caught: unknown) {
      if (caught instanceof ApiClientError && caught.code === "NOT_FOUND") {
        setNotStarted(true);
        return;
      }
      setLoadError(messageOf(caught));
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while the job is active. Terminal states stop the timer.
  const jobStatus = snapshot?.job.status;
  useEffect(() => {
    if (!jobStatus || TERMINAL.has(jobStatus)) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [jobStatus, load]);

  async function cancel() {
    setBusy(true);
    setActionError(null);
    try {
      const response = await apiFetch(
        `/api/products/${productId}/ingest/cancel`,
        { method: "POST" },
        (body) => ingestJobResponseSchema.parse(body),
      );
      setSnapshot(response);
    } catch (caught: unknown) {
      setActionError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setActionError(null);
    try {
      const response = await apiFetch(
        `/api/products/${productId}/ingest`,
        {
          method: "POST",
          headers: { "Idempotency-Key": retryKey.current },
          body: JSON.stringify({ factsConfirmed: true }),
        },
        (body) => ingestJobResponseSchema.parse(body),
      );
      retryKey.current = crypto.randomUUID();
      setSnapshot(response);
    } catch (caught: unknown) {
      setActionError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function backToDraft() {
    setBusy(true);
    setActionError(null);
    try {
      await apiFetch(
        `/api/products/${productId}/return-to-draft`,
        { method: "POST" },
        (body) => productResponseSchema.parse(body),
      );
      router.push(`/products/${productId}/upload`);
    } catch (caught: unknown) {
      setActionError(messageOf(caught));
      setBusy(false);
    }
  }

  if (notStarted) {
    return (
      <Alert>
        <p>Processing has not started for this product yet.</p>
        <Link className="underline" href={`/products/${productId}/upload`}>
          Go to the upload step
        </Link>
      </Alert>
    );
  }

  if (loadError && !snapshot) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg bg-card p-6"
      >
        <h2 className="text-lg font-semibold text-foreground">
          Could not load the processing status
        </h2>
        <p className="text-sm text-secondary-foreground">{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div
        aria-busy="true"
        className="flex flex-col gap-4 rounded-lg bg-card p-6"
      >
        <span className="sr-only">Loading processing status</span>
        <div className="h-16 w-full animate-pulse rounded-lg bg-secondary" />
        <div className="h-16 w-full animate-pulse rounded-lg bg-secondary" />
      </div>
    );
  }

  const { job, product } = snapshot;
  const active = job.status === "queued" || job.status === "running";
  const ingest = ingestState(job);
  const currentStep = job.steps.find(
    (step) => step.status === "running" || step.status === "failed",
  );
  const failedStep = job.steps.find((step) => step.status === "failed");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Products / {product.name}
        </p>
        <h1
          className="text-3xl font-bold tracking-tight text-foreground"
          aria-live="polite"
        >
          Processing — {product.name}
        </h1>
        <p className="text-base text-muted-foreground">
          You can leave this page. Steps are durable and resume if a worker
          restarts.
        </p>
      </div>

      {job.status === "failed" ? (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-lg bg-card p-6"
        >
          <h2 className="text-lg font-semibold text-foreground">
            Could not read the product document
          </h2>
          <p className="text-sm text-secondary-foreground">
            {failedStep?.error ??
              "Processing failed. Retry, or go back to the upload step and change the files."}
          </p>
          {actionError ? (
            <p className="text-sm text-[#b42318]">{actionError}</p>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              disabled={busy}
              onClick={() => void retry()}
              className="rounded-lg"
            >
              Retry ingest
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void backToDraft()}
              className="rounded-lg"
            >
              Upload another file
            </Button>
          </div>
        </section>
      ) : null}

      {job.status === "succeeded" ? (
        <section className="flex flex-col gap-2 rounded-lg bg-[#ecfdf3] p-6">
          <h2 className="text-lg font-semibold text-[#027a48]">
            Files processed
          </h2>
          <p className="text-sm text-secondary-foreground">
            The product is back in draft with its facts saved. Reviewing the
            extracted facts arrives in the next step.
          </p>
        </section>
      ) : null}

      {job.status === "cancelled" ? (
        <section className="rounded-lg bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Processing was cancelled
          </h2>
          <p className="text-sm text-secondary-foreground">
            The product is back in draft. You can change the files and start
            again.
          </p>
        </section>
      ) : null}

      <section
        aria-label="Pipeline steps"
        className="flex flex-col rounded-lg bg-card px-6 py-2"
      >
        <StepRow
          name="ingest"
          note={
            job.status === "succeeded"
              ? "Photos and document stored · EXIF stripped"
              : currentStep
                ? SUB_STEP_LABEL[currentStep.name]
                : "Stores the photos and document"
          }
          state={ingest}
        />
        {LATER_STEPS.map((step) => (
          <StepRow
            key={step.name}
            name={step.name}
            note={step.note}
            state="queued"
          />
        ))}
      </section>

      {actionError && job.status !== "failed" ? (
        <p className="text-sm text-[#b42318]">{actionError}</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {active ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void cancel()}
            className="rounded-lg"
          >
            Cancel job
          </Button>
        ) : null}
        {job.status === "cancelled" ? (
          <Button variant="outline" asChild className="rounded-lg">
            <Link href={`/products/${productId}/upload`}>Back to upload</Link>
          </Button>
        ) : null}
        {job.status === "succeeded" ? (
          <Button variant="outline" asChild className="rounded-lg">
            <Link href="/products">Back to products</Link>
          </Button>
        ) : null}
        {/* Step 02 builds the PKR screen. Disabled until then (spec Q4). */}
        <Button
          disabled
          title="Available in the next step"
          className="rounded-lg"
        >
          Open PKR when ready
        </Button>
      </div>
    </div>
  );
}

function StepRow({
  name,
  note,
  state,
}: {
  name: string;
  note: string;
  state: RowState;
}) {
  const pill = PILL[state];
  return (
    <div className="flex items-center gap-4 border-b border-border py-4 last:border-b-0">
      <span
        className={cn("size-7 shrink-0 rounded-full", pill.dot)}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-foreground">{name}</p>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      <span
        className={cn(
          "rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
          pill.className,
        )}
      >
        {pill.label}
      </span>
    </div>
  );
}
