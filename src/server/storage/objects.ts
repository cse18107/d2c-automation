import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getS3, getStorageConfig } from "./client";

export async function readObject(key: string): Promise<Uint8Array> {
  const response = await getS3().send(
    new GetObjectCommand({
      Bucket: getStorageConfig().STORAGE_BUCKET,
      Key: key,
    }),
  );
  if (!response.Body) {
    throw new Error("Storage returned an empty body");
  }
  return response.Body.transformToByteArray();
}

export async function writeObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await getS3().send(
    new PutObjectCommand({
      Bucket: getStorageConfig().STORAGE_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}

export async function removeObject(key: string): Promise<void> {
  await getS3().send(
    new DeleteObjectCommand({
      Bucket: getStorageConfig().STORAGE_BUCKET,
      Key: key,
    }),
  );
}
