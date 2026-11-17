"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startCheckout } from "@/app/(app)/billing/actions";

const PACKS_USD = [20, 50, 100, 200];
const MIN_USD = 20; // keep in sync with MIN_TOPUP_CENTS on the backend
const MAX_USD = 1000; // keep in sync with MAX_TOPUP_CENTS on the backend

export function BuyCreditsCard() {
  const [selected, setSelected] = useState<number | "custom">(50);
  const [custom, setCustom] = useState("");
  const [pending, startTransition] = useTransition();

  const amount = selected === "custom" ? Number(custom) : selected;
  const valid =
    Number.isInteger(amount) && amount >= MIN_USD && amount <= MAX_USD;

  function buy() {
    startTransition(async () => {
      const result = await startCheckout(amount * 100);
      // on success the action redirects to Stripe, so we only get here on errors
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">Buy credits</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        1 credit = $1. Minimum ${MIN_USD}, maximum ${MAX_USD}.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {PACKS_USD.map((usd) => (
          <Button
            key={usd}
            type="button"
            size="sm"
            variant={selected === usd ? "default" : "outline"}
            aria-pressed={selected === usd}
            disabled={pending}
            onClick={() => setSelected(usd)}
          >
            ${usd}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={selected === "custom" ? "default" : "outline"}
          aria-pressed={selected === "custom"}
          disabled={pending}
          onClick={() => setSelected("custom")}
        >
          Custom
        </Button>
      </div>

      {selected === "custom" && (
        <div className="mt-3 grid max-w-40 gap-1.5">
          <Label htmlFor="custom-amount">Amount in USD</Label>
          <Input
            id="custom-amount"
            type="number"
            inputMode="numeric"
            min={MIN_USD}
            max={MAX_USD}
            step={1}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            disabled={pending}
          />
          {custom !== "" && !valid && (
            <p className="text-sm text-destructive">
              Whole dollars, {MIN_USD} to {MAX_USD}.
            </p>
          )}
        </div>
      )}

      <Button className="mt-4" onClick={buy} disabled={!valid || pending}>
        {pending
          ? "Redirecting to Stripe…"
          : valid
            ? `Pay $${amount}`
            : "Choose an amount"}
      </Button>
    </section>
  );
}
