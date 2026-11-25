// In-memory stand-in for src/server/storage, used by integration tests so CI
// never talks to a real object store (CLAUDE.md §14). Tests mock the storage
// module with this file.
export const fakeStore = new Map<string, Uint8Array>();

export async function createUploadUrl(input: { key: string }): Promise<string> {
  return `https://fake-storage.test/upload/${input.key}`;
}

export async function createDownloadUrl(key: string): Promise<string> {
  return `https://fake-storage.test/download/${key}`;
}

export async function readObject(key: string): Promise<Uint8Array> {
  const bytes = fakeStore.get(key);
  if (!bytes) throw new Error(`No object at ${key}`);
  return bytes;
}

export async function writeObject(
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  fakeStore.set(key, bytes);
}

export async function removeObject(key: string): Promise<void> {
  fakeStore.delete(key);
}

export function buildAssetKeyFake(
  orgId: string,
  productId: string,
  assetId: string,
  ext: string,
): string {
  return `${orgId}/${productId}/${assetId}.${ext}`;
}

export { buildAssetKey } from "@/server/storage/keys";
export { SIGNED_URL_TTL_SECONDS } from "@/server/storage/signed-urls";
