"use client";

import { type DragEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  helper: string;
  accept: string;
  multiple: boolean;
  disabled: boolean;
  onFiles: (files: File[]) => void;
};

// Drop area from design frame 02. The visible "Browse files" button is the keyboard
// path; drag and drop is an extra path on the same region.
export function AssetDropzone({
  title,
  helper,
  accept,
  multiple,
  disabled,
  onFiles,
}: Props) {
  const inputId = useId();
  const titleId = `${inputId}-title`;
  const helperId = `${inputId}-helper`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section
      aria-labelledby={titleId}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col gap-3 rounded-lg border border-dashed p-6 ${
        dragging ? "border-primary bg-accent" : "border-input bg-background"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div className="flex flex-col gap-1">
        <p id={titleId} className="text-sm font-medium text-foreground">
          {title}
        </p>
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-lg border-border bg-card px-3 text-sm font-medium"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-labelledby={titleId}
          aria-describedby={helperId}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) onFiles(files);
          }}
        />
      </div>
    </section>
  );
}
