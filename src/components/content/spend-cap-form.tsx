"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, dollarsToMinor, formatMoney } from "./content-api";

const capResponse = z.object({ capMinor: z.number(), currency: z.string() });

// Owner only. The server refuses other roles, and the message is shown as is.
export function SpendCapForm({
  productId,
  capMinor,
  currency,
  onSaved,
}: {
  productId: string;
  capMinor: number | null;
  currency: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(
    capMinor === null ? "" : String(capMinor / 100),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const minor = dollarsToMinor(value);
    if (minor === null) {
      setError("Enter a spend cap greater than zero");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/products/${productId}/spend-cap`, capResponse, {
        method: "PUT",
        body: JSON.stringify({ capMinor: minor, currency }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the cap");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="spend-cap">Spend cap for this product ({currency})</Label>
      <div className="flex gap-2">
        <Input
          id="spend-cap"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="for example 10.00"
          className="max-w-40"
        />
        <Button
          type="button"
          variant="outline"
          onClick={save}
          disabled={saving}
        >
          Save cap
        </Button>
      </div>
      {capMinor !== null ? (
        <p className="text-muted-foreground text-sm">
          Current cap: {formatMoney(capMinor, currency)}
        </p>
      ) : (
        <p className="text-sm">
          No cap is set. A cap is required before generating.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
