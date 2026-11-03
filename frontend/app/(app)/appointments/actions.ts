"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch, apiMutate } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { RescheduleSlots } from "@/lib/business-types";

function toError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403)
      return "Only owners and admins can change appointments.";
    if (e.status === 404)
      return "That appointment no longer exists. Refresh the page.";
    // 400 bad input, 409 slot taken / already cancelled, 503 Google unreachable:
    // the backend's message is written for people, so show it.
    if ([400, 409, 503].includes(e.status) && e.detail) return e.detail;
  }
  return "Something went wrong. Please try again.";
}

async function run(call: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await call();
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
  revalidatePath("/appointments");
  return { ok: true };
}

const path = (id: string, action: string) =>
  `/appointments/${encodeURIComponent(id)}/${action}`;

export async function getRescheduleSlots(
  id: string,
  date: string,
): Promise<{ ok: true; data: RescheduleSlots } | { ok: false; error: string }> {
  try {
    const data = await apiFetch<RescheduleSlots>(
      `${path(id, "slots")}?date=${encodeURIComponent(date)}`,
    );
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

export async function rescheduleAppointment(
  id: string,
  start: string,
): Promise<ActionResult> {
  return run(() => apiMutate("PATCH", path(id, "reschedule"), { start }));
}

export async function cancelAppointment(id: string): Promise<ActionResult> {
  return run(() => apiMutate("POST", path(id, "cancel")));
}

export async function retryCalendarSync(id: string): Promise<ActionResult> {
  return run(() => apiMutate("POST", path(id, "retry-sync")));
}
