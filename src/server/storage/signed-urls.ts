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

export async function createDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({
      Bucket: getStorageConfig().STORAGE_BUCKET,
      Key: key,
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}
