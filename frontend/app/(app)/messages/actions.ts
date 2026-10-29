"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiMutate } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { MessageStatus } from "@/lib/message-types";

export async function updateMessageStatus(
  id: string,
  status: MessageStatus,
): Promise<ActionResult> {
  try {
    await apiMutate("PATCH", `/messages/${encodeURIComponent(id)}`, { status });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return {
        ok: false,
        error: "That message no longer exists. Refresh the page.",
      };
    }
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  revalidatePath("/messages");
  return { ok: true };
}
