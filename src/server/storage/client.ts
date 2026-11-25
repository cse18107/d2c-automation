import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { getStorageEnv, type StorageEnv } from "@/lib/env";

// Path-style addressing works for MinIO locally and R2/S3 later (ADR 0002).
const globalForS3 = globalThis as unknown as { __d2cS3?: S3Client };

export function getStorageConfig(): StorageEnv {
  return getStorageEnv();
}

export function getS3(): S3Client {
  if (!globalForS3.__d2cS3) {
    const env = getStorageConfig();
    globalForS3.__d2cS3 = new S3Client({
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      forcePathStyle: true,
      // Newer SDKs add checksum headers by default; S3-compatible servers can reject
      // presigned PUTs that carry them. Compute checksums only when the API requires it.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
      },
    });
  }
  return globalForS3.__d2cS3;
}
