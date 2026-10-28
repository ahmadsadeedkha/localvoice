import type { ServicesResponse } from "@/lib/business-types";

// Shown Monday-first; the database uses 0 = Sunday ... 6 = Saturday.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "09:00:00" -> "09:00" */
export const clock = (t: string) => t.slice(0, 5);

/** A day can have several intervals (e.g. a lunch break). Closed days map to []. */
export function intervalsByDay(hours: ServicesResponse["hours"]) {
  const byDay = new Map<number, string[]>();
  for (const d of WEEK_ORDER) byDay.set(d, []);
  for (const h of hours) {
    byDay.get(h.dayOfWeek)?.push(`${clock(h.openTime)}–${clock(h.closeTime)}`);
  }
  return byDay;
}
