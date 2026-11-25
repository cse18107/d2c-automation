"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import {
  downloadUrlResponseSchema,
  ingestJobResponseSchema,
} from "@/schemas/api";
import type { AssetKind, ProductAsset } from "@/schemas/product-asset";
import { AssetDropzone } from "./asset-dropzone";
import { type AssetRow, DocumentRow, PhotoTiles } from "./asset-list";
import { formatSize, messageOf } from "./messages";
import { mimeTypeFor, removeAsset, uploadAsset } from "./upload-client";
import { WhatHappensNext } from "./wizard/what-happens-next";
import { WizardFrame } from "./wizard/wizard-frame";

const MAX_IMAGES = 10;
const MAX_DOCUMENTS = 1;
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const DOCUMENT_ACCEPT =
  ".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown";

type PendingRow = AssetRow & { kind: AssetKind };

// Verified files come from the server. Files still uploading (or failed) stay local
// until the server accepts them. Only verified files count toward the start checks.
export function UploadStep({
  productId,
  productName,
  initialAssets,
}: {
  productId: string;
  productName: string;
  initialAssets: ProductAsset[];
}) {
  const router = useRouter();
  const [assets, setAssets] = useState<ProductAsset[]>(initialAssets);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [factsConfirmed, setFactsConfirmed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Reused across retries of the same click, so a network retry cannot start two jobs.
  const idempotencyKey = useRef(crypto.randomUUID());
  const previews = useRef(new Set<string>());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const requestedThumbs = useRef(new Set<string>());

  // Thumbnails for verified photos come from short-lived signed URLs, fetched once per photo.
  useEffect(() => {
    for (const asset of assets) {
      if (asset.kind !== "image" || requestedThumbs.current.has(asset.id))
        continue;
      requestedThumbs.current.add(asset.id);
      apiFetch(
        `/api/products/${productId}/assets/${asset.id}/url`,
        {},
        (body) => downloadUrlResponseSchema.parse(body),
      )
        .then(({ url }) =>
          setThumbs((current) => ({ ...current, [asset.id]: url })),
        )
        .catch(() => undefined);
    }
  }, [assets, productId]);

  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const images = assets.filter((a) => a.kind === "image");
  const documents = assets.filter((a) => a.kind === "document");
  const pendingImages = pending.filter(
    (p) => p.kind === "image" && p.state !== "error",
  );
  const pendingDocuments = pending.filter(
    (p) => p.kind === "document" && p.state !== "error",
  );
  const uploading = pending.some((p) => p.state === "uploading");

  const imageRows: AssetRow[] = [
    ...assets
      .filter((a) => a.kind === "image")
      .map((asset) => ({
        key: asset.id,
        name: asset.originalFilename,
        previewUrl: thumbs[asset.id],
        sizeLabel: formatSize(asset.sizeBytes),
        state: "done" as const,
        progress: 100,
        assetId: asset.id,
      })),
    ...pending.filter((p) => p.kind === "image"),
  ];
  const documentRows: AssetRow[] = [
    ...assets
      .filter((a) => a.kind === "document")
      .map((asset) => ({
        key: asset.id,
        name: asset.originalFilename,
        sizeLabel: formatSize(asset.sizeBytes),
        state: "done" as const,
        progress: 100,
        assetId: asset.id,
      })),
    ...pending.filter((p) => p.kind === "document"),
  ];

  const canStart =
    factsConfirmed &&
    images.length > 0 &&
    documents.length > 0 &&
    !uploading &&
    !starting;

  function updatePending(key: string, patch: Partial<PendingRow>) {
    setPending((rowsNow) =>
      rowsNow.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  async function addFiles(kind: AssetKind, files: File[]) {
    setStartError(null);
    const limit = kind === "image" ? MAX_IMAGES : MAX_DOCUMENTS;
    const current =
      kind === "image"
        ? images.length + pendingImages.length
        : documents.length + pendingDocuments.length;
    const room = Math.max(0, limit - current);
    const accepted = files.slice(0, room);

    for (const file of accepted) {
      const key = crypto.randomUUID();
      const tooLarge = file.size > MAX_BYTES;
      const unsupported = mimeTypeFor(file) === "";
      const previewUrl =
        kind === "image" && !tooLarge && !unsupported
          ? URL.createObjectURL(file)
          : undefined;
      if (previewUrl) previews.current.add(previewUrl);
      setPending((rowsNow) => [
        ...rowsNow,
        {
          key,
          kind,
          name: file.name,
          sizeLabel: formatSize(file.size),
          state: tooLarge || unsupported ? "error" : "uploading",
          progress: 0,
          previewUrl,
          error: tooLarge
            ? "This file is larger than 10 MB."
            : unsupported
              ? "This file type is not supported."
              : undefined,
        },
      ]);
      if (tooLarge || unsupported) continue;

      try {
        const asset = await uploadAsset(productId, file, kind, (percent) =>
          updatePending(key, { progress: percent }),
        );
        setAssets((current) => [...current, asset]);
        setPending((rowsNow) => rowsNow.filter((row) => row.key !== key));
      } catch (caught: unknown) {
        updatePending(key, { state: "error", error: messageOf(caught) });
      }
    }

    if (files.length > accepted.length) {
      setStartError(
        kind === "image"
          ? `You can add up to ${MAX_IMAGES} photos. Extra files were not added.`
          : "You can add one document. Extra files were not added.",
      );
    }
  }

  async function removeRow(row: AssetRow) {
    if (row.previewUrl) {
      URL.revokeObjectURL(row.previewUrl);
      previews.current.delete(row.previewUrl);
    }
    if (row.assetId) {
      try {
        await removeAsset(productId, row.assetId);
        setAssets((current) =>
          current.filter((asset) => asset.id !== row.assetId),
        );
      } catch (caught: unknown) {
        setStartError(messageOf(caught));
      }
      return;
    }
    setPending((rowsNow) => rowsNow.filter((item) => item.key !== row.key));
  }

  async function startProcessing() {
    setStarting(true);
    setStartError(null);
    try {
      await apiFetch(
        `/api/products/${productId}/ingest`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey.current },
          body: JSON.stringify({ factsConfirmed: true }),
        },
        (body) => ingestJobResponseSchema.parse(body),
      );
      router.push(`/products/${productId}/processing`);
    } catch (caught: unknown) {
      setStartError(messageOf(caught));
      setStarting(false);
    }
  }

  const photoCount = images.length + pendingImages.length;
  const documentCount = documents.length + pendingDocuments.length;

  return (
    <WizardFrame
      breadcrumb={`Products / ${productName}`}
      side={
        <WhatHappensNext>
          <div className="flex items-start gap-3">
            <Checkbox
              id="facts-confirmed"
              checked={factsConfirmed}
              onCheckedChange={(checked) => setFactsConfirmed(checked === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="facts-confirmed"
              className="text-sm leading-5 text-secondary-foreground"
            >
              The document describes this product, and the photos show the real
              product.
            </Label>
          </div>
          {startError ? (
            <Alert role="alert" variant="destructive">
              {startError}
            </Alert>
          ) : null}
          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="outline" asChild className="rounded-lg">
              <Link href="/products">Cancel</Link>
            </Button>
            <Button
              className="rounded-lg"
              disabled={!canStart}
              onClick={() => void startProcessing()}
            >
              {starting ? "Starting…" : "Start processing"}
            </Button>
          </div>
          {!canStart ? (
            <p className="text-xs text-muted-foreground">
              {uploading
                ? "Wait for the uploads to finish."
                : photoCount === 0 || documentCount === 0
                  ? "Add at least one photo and the product document."
                  : "Confirm the facts above to start."}
            </p>
          ) : null}
        </WhatHappensNext>
      }
    >
      <section
        aria-labelledby="photos-heading"
        className="flex flex-col gap-4 rounded-lg bg-card p-6"
      >
        <h2
          id="photos-heading"
          className="text-base font-semibold text-foreground"
        >
          Product photos
        </h2>
        <AssetDropzone
          title={`Drop 1–${MAX_IMAGES} product photos here`}
          helper="JPG, PNG or WebP · max 10 MB each · GPS metadata is stripped automatically"
          accept={IMAGE_ACCEPT}
          multiple
          disabled={photoCount >= MAX_IMAGES}
          onFiles={(files) => void addFiles("image", files)}
        />
        <PhotoTiles
          rows={imageRows}
          onRemove={(row) => void removeRow(row)}
          busy={uploading}
        />
      </section>

      <section
        aria-labelledby="document-heading"
        className="flex flex-col gap-4 rounded-lg bg-card p-6"
      >
        <h2
          id="document-heading"
          className="text-base font-semibold text-foreground"
        >
          Product document
        </h2>
        {documentRows.map((row) => (
          <DocumentRow
            key={row.key}
            row={row}
            onRemove={(item) => void removeRow(item)}
          />
        ))}
        {documentCount < MAX_DOCUMENTS ? (
          <AssetDropzone
            title="Drop the product document here"
            helper="PDF, DOCX, TXT or MD. Include description, specs, USPs, materials, price, dimensions and certifications."
            accept={DOCUMENT_ACCEPT}
            multiple={false}
            disabled={false}
            onFiles={(files) => void addFiles("document", files)}
          />
        ) : null}
      </section>
    </WizardFrame>
  );
}
