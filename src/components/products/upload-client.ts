"use client";

import { ApiClientError, apiFetch } from "@/lib/api-client";
import {
  type AssetUploadTicket,
  assetUploadTicketSchema,
  productAssetResponseSchema,
} from "@/schemas/api";
import type { AssetKind, ProductAsset } from "@/schemas/product-asset";
import { DOCX_MIME } from "@/schemas/product-asset";

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  docx: DOCX_MIME,
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
};

// Browsers sometimes report an empty type for .md or .docx files. Fall back to
// the extension. The server still checks the real bytes.
export function mimeTypeFor(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? "";
}

// Three steps: reserve a row and get a signed URL, PUT the bytes straight to
// storage (with progress), then ask the server to verify the file.
export async function uploadAsset(
  productId: string,
  file: File,
  kind: AssetKind,
  onProgress: (percent: number) => void,
): Promise<ProductAsset> {
  const mimeType = mimeTypeFor(file);
  const ticket = await apiFetch(
    `/api/products/${productId}/assets`,
    {
      method: "POST",
      body: JSON.stringify({
        kind,
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
      }),
    },
    (body) => assetUploadTicketSchema.parse(body),
  );

  await putToStorage(ticket, file, mimeType, onProgress);

  const { asset } = await apiFetch(
    `/api/products/${productId}/assets/${ticket.assetId}/complete`,
    { method: "POST" },
    (body) => productAssetResponseSchema.parse(body),
  );
  return asset;
}

export function removeAsset(productId: string, assetId: string): Promise<void> {
  return apiFetch(
    `/api/products/${productId}/assets/${assetId}`,
    { method: "DELETE" },
    () => undefined,
  );
}

// XHR, not fetch: fetch cannot report upload progress.
function putToStorage(
  ticket: AssetUploadTicket,
  file: File,
  mimeType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", ticket.uploadUrl);
    request.setRequestHeader("Content-Type", mimeType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(
          new ApiClientError(
            "TRANSIENT",
            "The file could not be uploaded. Try again.",
          ),
        );
      }
    };
    request.onerror = () => {
      reject(
        new ApiClientError(
          "TRANSIENT",
          "Network error during upload. Try again.",
        ),
      );
    };
    request.send(file);
  });
}
