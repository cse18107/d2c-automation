"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  type ContentOutputs,
  contentOutputsResponseSchema,
} from "@/schemas/content-job";
import { apiRequest } from "./content-api";
import { OutputsView } from "./outputs-view";
import { ScopeSection } from "./scope-section";
import { SpendCapForm } from "./spend-cap-form";

const POLL_MS = 2000;

// The content screen. It loads outputs from the API and polls while any run is
// queued or running. Nothing here is optimistic: each view shows what the server
// last returned.
export function ContentPanel({ productId }: { productId: string }) {
  const [outputs, setOutputs] = useState<ContentOutputs | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOutputs(
        await apiRequest(
          `/api/products/${productId}/content`,
          contentOutputsResponseSchema,
        ),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load content");
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const jobs = outputs ? Object.values(outputs.jobsByScope) : [];
  const active = jobs.some(
    (j) => j?.status === "queued" || j?.status === "running",
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  if (error && outputs === null) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load content</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (outputs === null)
    return <output className="block">Loading content…</output>;

  const cap = jobs.find((j) => j?.capMinor != null)?.capMinor ?? null;
  const currency = jobs.find((j) => j)?.currency ?? "USD";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Product status:</span>
        <Badge variant="secondary">
          {outputs.productStatus.replace(/_/g, " ")}
        </Badge>
        {active ? (
          <span className="text-sm" aria-live="polite">
            A run is in progress…
          </span>
        ) : null}
      </div>

      <SpendCapForm
        productId={productId}
        capMinor={cap}
        currency={currency}
        onSaved={load}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ScopeSection
          productId={productId}
          scope="text"
          title="Text"
          description="Product knowledge record, marketplace listing and ad copy."
          job={outputs.jobsByScope.text}
          disabled={active}
          onStarted={load}
        />
        <ScopeSection
          productId={productId}
          scope="images"
          title="Images"
          description="Six ad images from your photo, plus a white-background main image."
          job={outputs.jobsByScope.images}
          disabled={active}
          onStarted={load}
        />
        <ScopeSection
          productId={productId}
          scope="videos"
          title="Videos"
          description="Short videos from your photo, with captions and three sizes."
          job={outputs.jobsByScope.videos}
          disabled={active}
          onStarted={load}
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <OutputsView
        outputs={outputs}
        productId={productId}
        disabled={active}
        onStarted={load}
      />
    </div>
  );
}
