import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type AssetRow = {
  key: string;
  name: string;
  sizeLabel: string;
  state: "uploading" | "done" | "error";
  progress: number;
  error?: string;
  // Set for rows that exist on the server, so Remove can delete them.
  assetId?: string;
  // Local preview for files picked in this session (object URL, revoked on remove).
  previewUrl?: string;
};

const DOC_BADGE: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  md: "MD",
};

export function docBadge(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return DOC_BADGE[ext] ?? "DOC";
}

// Photo tiles from design frame 02 (the thumbnail row under the photos dropzone).
export function PhotoTiles({
  rows,
  onRemove,
  busy,
}: {
  rows: AssetRow[];
  onRemove: (row: AssetRow) => void;
  busy: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      aria-label="Product photos"
    >
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-secondary">
            {row.previewUrl ? (
              // biome-ignore lint/performance/noImgElement: local object URL preview, not optimizable
              <img
                src={row.previewUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                {row.state === "done" ? "Verified" : "Photo"}
              </span>
            )}
            {row.state === "uploading" ? (
              <div className="absolute inset-x-2 bottom-2">
                <Progress
                  value={row.progress}
                  aria-label={`${row.name} upload`}
                />
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute right-2 top-2 h-7 rounded-md bg-card px-2 text-xs"
              disabled={busy && row.state === "uploading"}
              onClick={() => onRemove(row)}
              aria-label={`Remove ${row.name}`}
            >
              Remove
            </Button>
          </div>
          <p className="truncate text-xs text-secondary-foreground">
            {row.name}
          </p>
          {row.error ? (
            <p role="alert" className="text-xs text-[#b42318]">
              {row.error}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// Document row from design frame 02: badge, file name, size and parse note.
export function DocumentRow({
  row,
  onRemove,
}: {
  row: AssetRow;
  onRemove: (row: AssetRow) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-background p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#fef3f2] text-xs font-semibold text-[#b42318]">
        {docBadge(row.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {row.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {row.state === "uploading"
            ? `Uploading ${row.progress}%`
            : `${row.sizeLabel} · Parsed as untrusted input`}
        </p>
        {row.error ? (
          <p role="alert" className="text-xs text-[#b42318]">
            {row.error}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onRemove(row)}
        aria-label={`Remove ${row.name}`}
      >
        Remove
      </Button>
    </div>
  );
}
