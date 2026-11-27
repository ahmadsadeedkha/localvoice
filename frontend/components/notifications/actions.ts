"use server";

import { apiFetch, apiMutate } from "@/lib/api";
import type { NotificationsPayload } from "@/lib/notification-types";

/** Returns null on any failure so the bell never throws while polling. */
export async function fetchNotifications(): Promise<NotificationsPayload | null> {
  try {
    return await apiFetch<NotificationsPayload>("/notifications?limit=15");
  } catch {
    return null;
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await apiMutate("POST", `/notifications/${encodeURIComponent(id)}/read`);
  } catch {
    // best effort: the next poll shows the real state
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    await apiMutate("POST", "/notifications/read-all");
  } catch {
    // best effort: the next poll shows the real state
  }
}
