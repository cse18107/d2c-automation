"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ContentOutputs } from "@/schemas/content-job";
import type { PkrBody } from "@/schemas/pkr";
import { RunButton } from "./run-button";

type Creative = ContentOutputs["creatives"][number];
type Listing = ContentOutputs["listings"][number];

// Status is always shown as text, never colour alone (spec §4 accessibility).
const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Generating",
  generated: "Generated",
  pending_review: "Ready for review",
  blocked: "Blocked by policy",
  failed: "Failed",
  expired: "Expired at provider",
  rejected: "Rejected",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "failed" || status === "blocked"
          ? "destructive"
          : "secondary"
      }
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function policyMessages(findings: unknown[]): string[] {
  return findings
    .map((f) =>
      typeof f === "object" && f !== null && "message" in f
        ? String((f as { message: unknown }).message)
        : null,
    )
    .filter((m): m is string => m !== null);
}

function Pkr({ pkr }: { pkr: { version: number; body: unknown } }) {
  const body = pkr.body as PkrBody;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Product knowledge record (version {pkr.version})</CardTitle>
        <CardDescription>
          Every generated claim comes from these facts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <strong>{body.name}</strong>
        </p>
        {body.features.length > 0 ? (
          <ul className="list-disc pl-5">
            {body.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : null}
        {body.missingFields.length > 0 ? (
          <p>Missing from source: {body.missingFields.join(", ")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CreativeCard({
  creative,
  productId,
  disabled,
  onStarted,
}: {
  creative: Creative;
  productId: string;
  disabled: boolean;
  onStarted: () => void;
}) {
  const findings = policyMessages(creative.policyFindings);
  const preview =
    creative.renders.find((r) => r.variant === "1:1" || r.variant === "9:16") ??
    creative.renders[0];
  const failed = creative.status === "failed" || creative.status === "expired";
  return (
    <figure className="space-y-2 rounded-lg border p-3">
      {creative.kind === "image" && preview ? (
        // Alt text names the slot; the image has no text content to read.
        // biome-ignore lint/performance/noImgElement: signed URL redirect, not optimised by Next
        <img
          src={preview.downloadPath}
          alt={`${creative.slot.replace("_", " ")} creative`}
          className="w-full rounded"
        />
      ) : null}
      {creative.kind === "video" && preview ? (
        // Captions are burned into the picture by ffmpeg (ADR 0004), so there is no track.
        // biome-ignore lint/a11y/useMediaCaption: burned-in captions, see ADR 0004
        <video
          controls
          src={preview.downloadPath}
          className="w-full rounded"
          aria-label={`${creative.slot} video`}
        />
      ) : null}
      <figcaption className="flex flex-wrap items-center gap-2 text-sm">
        <span>{creative.slot.replace(/[_-]/g, " ")}</span>
        <StatusBadge status={creative.status} />
        {creative.kind === "video" ? (
          <span>{creative.durationSeconds} s</span>
        ) : null}
      </figcaption>
      {creative.renders.length > 0 ? (
        <p className="flex flex-wrap gap-3 text-sm">
          {creative.renders.map((r) => (
            <a
              key={r.id}
              href={`${r.downloadPath}?download=1`}
              download
              className="underline"
            >
              Download {r.variant}
            </a>
          ))}
        </p>
      ) : null}
      {creative.errorMessage ? (
        <p className="text-destructive text-sm">{creative.errorMessage}</p>
      ) : null}
      {findings.length > 0 ? (
        <ul className="text-sm">
          {findings.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
      {failed && creative.kind === "image" ? (
        <RunButton
          productId={productId}
          scope="images"
          options={{ slots: [creative.slot as "lifestyle"] }}
          label={`Retry ${creative.slot.replace(/[_-]/g, " ")}`}
          disabled={disabled}
          onStarted={onStarted}
          variant="outline"
        />
      ) : null}
      {failed && creative.kind === "video" ? (
        <RunButton
          productId={productId}
          scope="videos"
          options={{
            videoCount: 1,
            videoDurationSeconds: creative.durationSeconds ?? 8,
          }}
          label="Retry this video"
          disabled={disabled}
          onStarted={onStarted}
          variant="outline"
        />
      ) : null}
    </figure>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  const findings = policyMessages(listing.policyFindings);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {listing.target === "marketplace" ? "Marketplace listing" : "Ad copy"}
        </CardTitle>
        <CardDescription>
          <StatusBadge status={listing.status} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <pre className="whitespace-pre-wrap font-sans">
          {JSON.stringify(listing.body, null, 2)}
        </pre>
        {findings.length > 0 ? (
          <ul>
            {findings.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function OutputsView({
  outputs,
  productId,
  disabled,
  onStarted,
}: {
  outputs: ContentOutputs;
  productId: string;
  disabled: boolean;
  onStarted: () => void;
}) {
  const images = outputs.creatives.filter((c) => c.kind === "image");
  const videos = outputs.creatives.filter((c) => c.kind === "video");
  return (
    <div className="space-y-8">
      {outputs.pkr ? (
        <Pkr pkr={outputs.pkr} />
      ) : (
        <p>No product knowledge record yet. Generate text to create one.</p>
      )}

      <section aria-labelledby="images-heading" className="space-y-3">
        <h2 id="images-heading" className="text-lg font-semibold">
          Images
        </h2>
        {images.length === 0 ? (
          <p>No images yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((c) => (
              <CreativeCard
                key={c.id}
                creative={c}
                productId={productId}
                disabled={disabled}
                onStarted={onStarted}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="videos-heading" className="space-y-3">
        <h2 id="videos-heading" className="text-lg font-semibold">
          Videos
        </h2>
        {videos.length === 0 ? (
          <p>No videos yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((c) => (
              <CreativeCard
                key={c.id}
                creative={c}
                productId={productId}
                disabled={disabled}
                onStarted={onStarted}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="listings-heading" className="space-y-3">
        <h2 id="listings-heading" className="text-lg font-semibold">
          Listings and ad copy
        </h2>
        {outputs.listings.length === 0 ? (
          <p>No listing text yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {outputs.listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
