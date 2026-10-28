import type { HourInterval } from "@/lib/business-types";

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

export const MAX_INTERVALS_PER_DAY = 4;

/** "09:00:00" -> "09:00" */
export const clock = (t: string) => t.slice(0, 5);

/** A day can have several intervals (e.g. a lunch break). Closed days map to []. */
export function intervalsByDay(hours: HourInterval[]) {
  const byDay = new Map<number, string[]>();
  for (const d of WEEK_ORDER) byDay.set(d, []);
  const sorted = [...hours].sort((a, b) =>
    a.openTime.localeCompare(b.openTime),
  );
  for (const h of sorted) {
    byDay.get(h.dayOfWeek)?.push(`${clock(h.openTime)}–${clock(h.closeTime)}`);
  }
  return byDay;
}

/** Editable form of one opening period. Empty strings mean "not filled in yet". */
export type Period = { open: string; close: string };
export type Week = Record<number, Period[]>;

export function toWeek(hours: HourInterval[]): Week {
  const week: Week = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const h of hours) {
    week[h.dayOfWeek].push({
      open: clock(h.openTime),
      close: clock(h.closeTime),
    });
  }
  for (const d of WEEK_ORDER) {
    week[d].sort((a, b) => a.open.localeCompare(b.open));
  }
  return week;
}

export function fromWeek(week: Week): HourInterval[] {
  return WEEK_ORDER.flatMap((dayOfWeek) =>
    [...week[dayOfWeek]]
      .sort((a, b) => a.open.localeCompare(b.open))
      .map((p) => ({ dayOfWeek, openTime: p.open, closeTime: p.close })),
  );
}

/**
 * Same rules the backend enforces, so mistakes are caught before saving.
 * The backend stays the authority; this only makes the feedback instant.
 */
export function validateDay(day: number, periods: Period[]): string | null {
  const name = DAY_NAMES[day];
  if (periods.length > MAX_INTERVALS_PER_DAY) {
    return `${name} can have at most ${MAX_INTERVALS_PER_DAY} opening periods`;
  }
  const sorted = [...periods].sort((a, b) => a.open.localeCompare(b.open));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    if (!p.open || !p.close)
      return `${name}: enter both an opening and closing time`;
    if (p.close <= p.open)
      return `${name}: closing time must be after opening time`;
    if (i > 0 && p.open < sorted[i - 1].close)
      return `${name}: opening periods overlap`;
  }
  return null;
}
