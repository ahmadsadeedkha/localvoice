"use server";

import { redirect } from "next/navigation";
import { ApiError, apiMutate } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";

/** Creates a Stripe Checkout session, then sends the browser to it. */
export async function startCheckout(
  amountCents: number,
): Promise<ActionResult> {
  let url: string;
  try {
    ({ url } = await apiMutate<{ url: string }>(
      "POST",
      "/billing/checkout-sessions",
      { amountCents },
    ));
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      return { ok: false, error: "Only owners and admins can buy credits." };
    }
    if (e instanceof ApiError && e.status === 400) {
      return { ok: false, error: e.detail ?? "That amount can't be used." };
    }
    return { ok: false, error: "Could not start checkout. Please try again." };
  }
  redirect(url); // outside try: redirect() works by throwing
}
