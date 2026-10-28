"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiMutate } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { HourInterval } from "@/lib/business-types";

async function run(call: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await call();
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          error: "Only owners and admins can make this change.",
        };
      }
      if (e.status === 404) {
        return {
          ok: false,
          error: "That item no longer exists. Refresh the page.",
        };
      }
      if (e.status === 400 || e.status === 409) {
        return { ok: false, error: e.detail ?? "Those details aren't valid." };
      }
    }
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  revalidatePath("/services");
  return { ok: true };
}

export async function createService(input: {
  name: string;
  description: string;
  durationMinutes: number;
}): Promise<ActionResult> {
  return run(() =>
    apiMutate("POST", "/services", {
      name: input.name,
      description: input.description.trim() || null,
      durationMinutes: input.durationMinutes,
    }),
  );
}

export async function updateService(
  id: string,
  input: {
    name?: string;
    description?: string;
    durationMinutes?: number;
    active?: boolean;
  },
): Promise<ActionResult> {
  const { description, ...rest } = input;
  return run(() =>
    apiMutate("PATCH", `/services/${encodeURIComponent(id)}`, {
      ...rest,
      ...(description !== undefined && {
        description: description.trim() || null,
      }),
    }),
  );
}

export async function saveHours(hours: HourInterval[]): Promise<ActionResult> {
  return run(() => apiMutate("PUT", "/hours", { hours }));
}
