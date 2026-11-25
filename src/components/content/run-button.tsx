"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  type ContentEstimate,
  type ContentScope,
  contentEstimateResponseSchema,
  contentJobResponseSchema,
  type JobOptions,
  RUNNABLE_SLOTS,
} from "@/schemas/content-job";
import { apiRequest, formatMoney } from "./content-api";

// One paid run: shows the estimate, asks for confirmation, then starts the run.
// The primary button names the action (CLAUDE.md §10). A fresh Idempotency-Key is
// used for each click, so a double click cannot start two runs.
export function RunButton({
  productId,
  scope,
  options,
  label,
  disabled,
  onStarted,
  variant = "default",
}: {
  productId: string;
  scope: ContentScope;
  options: JobOptions;
  label: string;
  disabled: boolean;
  onStarted: () => void;
  variant?: "default" | "outline";
}) {
  const videoCount = options.videoCount ?? 2;
  const durationSeconds = options.videoDurationSeconds ?? 8;
  const slotCount = options.slots?.length ?? RUNNABLE_SLOTS.length;
  const [estimate, setEstimate] = useState<ContentEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams({
      scope,
      videoCount: String(videoCount),
      videoDurationSeconds: String(durationSeconds),
      slotCount: String(slotCount),
    });
    apiRequest(
      `/api/products/${productId}/content/estimate?${query.toString()}`,
      contentEstimateResponseSchema,
    )
      .then((value) => {
        setEstimate(value);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Could not load the estimate",
        ),
      );
  }, [productId, scope, videoCount, durationSeconds, slotCount]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(
        `/api/products/${productId}/content`,
        contentJobResponseSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            costConfirmed: true,
            scope,
            videoCount,
            videoDurationSeconds: durationSeconds,
            ...(options.slots ? { slots: options.slots } : {}),
          }),
        },
      );
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  const blocked = disabled || busy || estimate === null || estimate.overCap;
  return (
    <div className="space-y-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant={variant} disabled={blocked}>
            {label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {estimate
                ? `Estimated cost ${formatMoney(estimate.estimatedMinor, estimate.currency)}${
                    estimate.capMinor !== null
                      ? `, within the cap of ${formatMoney(estimate.capMinor, estimate.currency)}`
                      : ""
                  }. Models: text ${estimate.textModelId}, image ${estimate.imageModelId}, video ${estimate.videoModelId}. Videos are sent to the video provider, which does not offer zero data retention. Failed video jobs may still be charged.`
                : "Loading the estimate."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={start}>{label}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {estimate?.overCap ? (
        <p className="text-destructive text-sm">
          Over the spend cap. Raise the cap or choose less work.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
