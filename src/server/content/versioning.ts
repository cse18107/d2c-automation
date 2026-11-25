import "server-only";

// Versions are append-only. A regeneration writes a new row with the next
// version number; old rows are never updated (spec §7).
export function nextVersion(existingVersions: readonly number[]): number {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

export type VersionedRow<TSlot extends string> = {
  slot: TSlot;
  version: number;
};

// The latest version for each slot, e.g. the newest lifestyle image.
export function latestPerSlot<
  TSlot extends string,
  T extends VersionedRow<TSlot>,
>(rows: readonly T[]): Map<TSlot, T> {
  const latest = new Map<TSlot, T>();
  for (const row of rows) {
    const current = latest.get(row.slot);
    if (current === undefined || row.version > current.version) {
      latest.set(row.slot, row);
    }
  }
  return latest;
}
