"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, apiFetch, apiMutate } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";

function toResult(e: unknown): ActionResult {
  if (e instanceof ApiError) {
    if (e.status === 403) {
      return {
        ok: false,
        error: "Only owners and admins can change integrations.",
      };
    }
    if (e.status === 409) {
      return {
        ok: false,
        error: "Google access has expired. Reconnect Google Calendar.",
      };
    }
    if (e.status === 400) {
      return { ok: false, error: e.detail ?? "That calendar can't be used." };
    }
  }
  return { ok: false, error: "Something went wrong. Please try again." };
}

/**
 * Asks the backend for Google's consent URL, then sends the browser there.
 * Google sends the user back to the backend's callback, which redirects to
 * /integrations?google=connected (or =error&reason=...).
 */
export async function connectGoogle(): Promise<void> {
  let url: string;
  try {
    ({ url } = await apiFetch<{ url: string }>("/integrations/google/connect"));
  } catch (e) {
    const reason =
      e instanceof ApiError && e.status === 403 ? "forbidden" : "start_failed";
    redirect(`/integrations?google=error&reason=${reason}`);
  }
  redirect(url); // outside try: redirect() works by throwing
}

export async function selectGoogleCalendar(
  calendarId: string,
): Promise<ActionResult> {
  try {
    await apiMutate("PUT", "/integrations/google/calendar", { calendarId });
  } catch (e) {
    return toResult(e);
  }
  revalidatePath("/integrations");
  return { ok: true };
}

export async function disconnectGoogle(): Promise<ActionResult> {
  try {
    await apiMutate("DELETE", "/integrations/google");
  } catch (e) {
    return toResult(e);
  }
  revalidatePath("/integrations");
  return { ok: true };
}
