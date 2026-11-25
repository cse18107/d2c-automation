"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ContentScope, JobView } from "@/schemas/content-job";
import { RunButton } from "./run-button";

const STATUS_TEXT: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
};

// One section per run: text, images or videos. It shows the last run of that kind,
// its steps, and a retry button when that run failed.
export function ScopeSection({
  productId,
  scope,
  title,
  description,
  job,
  disabled,
  onStarted,
}: {
  productId: string;
  scope: ContentScope;
  title: string;
  description: string;
  job: JobView | null;
  disabled: boolean;
  onStarted: () => void;
}) {
  const [videoCount, setVideoCount] = useState(2);
  const [duration, setDuration] = useState(8);
  const failed = job?.status === "failed";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {job ? (
          <div className="space-y-2 text-sm" aria-live="polite">
            <p>
              Last run:{" "}
              <Badge variant={failed ? "destructive" : "secondary"}>
                {STATUS_TEXT[job.status] ?? job.status}
              </Badge>
              {job.capMinor !== null
                ? ` · spent ${(job.spentMinor / 100).toFixed(2)} of ${(job.capMinor / 100).toFixed(2)} ${job.currency}`
                : ""}
            </p>
            {job.steps.length > 0 ? (
              <ol className="list-decimal pl-5">
                {job.steps.map((s) => (
                  <li key={`${s.name}-${s.at}`}>
                    {s.name.replace(/[_-]/g, " ")}: {s.status}
                    {s.error ? ` (${s.error})` : ""}
                  </li>
                ))}
              </ol>
            ) : null}
            {failed ? (
              <p className="text-destructive">
                {job.errorMessage ?? "The run failed."}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm">Not run yet.</p>
        )}

        {scope === "videos" ? (
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label>
              Videos
              <select
                className="ml-2 rounded-md border px-2 py-1"
                value={videoCount}
                onChange={(e) => setVideoCount(Number(e.target.value))}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <label>
              Length (seconds)
              <select
                className="ml-2 rounded-md border px-2 py-1"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {Array.from({ length: 10 }, (_, i) => i + 6).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <RunButton
            productId={productId}
            scope={scope}
            options={
              scope === "videos"
                ? { videoCount, videoDurationSeconds: duration }
                : {}
            }
            label={`Generate ${title.toLowerCase()}`}
            disabled={disabled}
            onStarted={onStarted}
          />
          {failed && job ? (
            <RunButton
              productId={productId}
              scope={scope}
              options={job.options}
              label={`Retry ${title.toLowerCase()}`}
              disabled={disabled}
              onStarted={onStarted}
              variant="outline"
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
