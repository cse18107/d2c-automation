import "server-only";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3, getStorageConfig } from "./client";

// Short TTL on purpose (CLAUDE.md §12). Download URLs are generated per request
// and never stored.
export const SIGNED_URL_TTL_SECONDS = 300;

export async function createUploadUrl(input: {
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<string> {
  return getSignedUrl(
    getS3(),
    new PutObjectCommand({
      Bucket: getStorageConfig().STORAGE_BUCKET,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

export async function createDownloadUrl(
  key: string,
  options?: { filename?: string },
): Promise<string> {
  // A download name is set on the signed response, so cross-origin links still save
  // under a readable file name (the HTML download attribute is ignored across origins).
  const disposition = options?.filename
    ? `attachment; filename="${options.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`
    : undefined;
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({
      Bucket: getStorageConfig().STORAGE_BUCKET,
      Key: key,
      ResponseContentDisposition: disposition,
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}
