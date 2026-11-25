// Route-level loading state so navigation shows a shell immediately (design frame 14, state D).
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading</span>
      <div className="h-4 w-48 animate-pulse rounded bg-secondary" />
      <div className="h-9 w-96 animate-pulse rounded-lg bg-secondary" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_352px]">
        <div className="h-72 animate-pulse rounded-lg bg-card" />
        <div className="h-72 animate-pulse rounded-lg bg-card" />
      </div>
    </div>
  );
}
