"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";

type View = "idle" | "confirming" | "credited" | "delayed" | "cancelled";

const POLL_MS = 2000;
const MAX_POLLS = 10;

const VIEWS: Record<
  Exclude<View, "idle">,
  { text: string; cls: string; Icon: LucideIcon; spin?: boolean }
> = {
  confirming: {
    text: "Thanks! Confirming your payment…",
    cls: "bg-info-soft text-info",
    Icon: Loader2,
    spin: true,
  },
  credited: {
    text: "Payment confirmed. Funds have been added to your balance.",
    cls: "bg-success-soft text-success",
    Icon: CheckCircle2,
  },
  delayed: {
    text: "Your payment went through. Your balance can take a minute to update. Refresh the page if you don't see them.",
    cls: "bg-warning-soft text-warning",
    Icon: Clock,
  },
  cancelled: {
    text: "Checkout cancelled. You haven't been charged.",
    cls: "bg-muted text-muted-foreground",
    Icon: Info,
  },
};

export function CheckoutReturnBanner({
  initial,
  balance,
}: {
  initial: "success" | "cancelled" | null;
  balance: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<View>(
    initial === "success"
      ? "confirming"
      : initial === "cancelled"
        ? "cancelled"
        : "idle",
  );
  // the balance when the page first loaded after paying
  const [startBalance] = useState(balance);
  const view: View =
    state === "confirming" && balance !== startBalance ? "credited" : state;

  // drop ?checkout=... so a refresh doesn't repeat the message
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("checkout")) return;
    url.searchParams.delete("checkout");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  // re-fetch the page data until the webhook has credited the payment
  useEffect(() => {
    if (view !== "confirming") return;
    let polls = 0;
    const id = window.setInterval(() => {
      polls += 1;
      router.refresh();
      if (polls >= MAX_POLLS) {
        window.clearInterval(id);
        setState((s) => (s === "confirming" ? "delayed" : s));
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [view, router]);

  if (view === "idle") return null;
  const { text, cls, Icon, spin } = VIEWS[view];

  return (
    <div
      role="status"
      className={`mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${cls}`}
    >
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${spin ? "animate-spin" : ""}`}
        aria-hidden
      />
      <div className="flex-1">{text}</div>
      {view !== "confirming" && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setState("idle")}
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
