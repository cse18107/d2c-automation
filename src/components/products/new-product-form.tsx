"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { productResponseSchema } from "@/schemas/api";
import { createProductInputSchema } from "@/schemas/product";
import { messageOf } from "./messages";
import { WhatHappensNext } from "./wizard/what-happens-next";
import { WizardFrame } from "./wizard/wizard-frame";

// The design's wizard starts at uploads. The name is needed to create the draft,
// so it is the first card here, and the upload step follows it.
export function NewProductForm() {
  const router = useRouter();
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createProductInputSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a product name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(
        "/api/products",
        { method: "POST", body: JSON.stringify(parsed.data) },
        (body) => productResponseSchema.parse(body),
      );
      router.push(`/products/${response.product.id}/upload`);
    } catch (caught: unknown) {
      setError(messageOf(caught));
      setBusy(false);
    }
  }

  return (
    <WizardFrame
      breadcrumb="Products / New product"
      side={
        <WhatHappensNext>
          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="outline" asChild className="rounded-lg">
              <Link href="/products">Cancel</Link>
            </Button>
            <Button
              className="rounded-lg"
              type="submit"
              form="new-product-form"
              disabled={busy}
            >
              {busy ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </WhatHappensNext>
      }
    >
      <form
        id="new-product-form"
        onSubmit={onSubmit}
        noValidate
        aria-label="New product"
        className="flex flex-col gap-4 rounded-lg bg-card p-6"
      >
        <h2 className="text-base font-semibold text-foreground">
          Product name
        </h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId} className="sr-only">
            Product name
          </Label>
          <Input
            id={inputId}
            value={name}
            maxLength={120}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Ember Ceramic Mug 350ml"
            className="h-10 rounded-lg"
          />
          {error ? (
            <p id={errorId} role="alert" className="text-sm text-[#b42318]">
              {error}
            </p>
          ) : null}
        </div>
        {busy ? <Alert>Creating your draft…</Alert> : null}
      </form>
    </WizardFrame>
  );
}
