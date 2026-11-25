// Loading state D, design frame 14: grey bars on a white card.
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading products</span>
      <div className="h-10 w-80 animate-pulse rounded-lg bg-secondary" />
      <div className="flex flex-col gap-4 rounded-lg bg-card p-6">
        <div className="h-4 w-72 animate-pulse rounded bg-secondary" />
        <div className="h-20 w-full animate-pulse rounded-lg bg-secondary" />
        <div className="h-20 w-full animate-pulse rounded-lg bg-secondary" />
        <div className="h-20 w-full animate-pulse rounded-lg bg-secondary" />
      </div>
    </div>
  );
}
