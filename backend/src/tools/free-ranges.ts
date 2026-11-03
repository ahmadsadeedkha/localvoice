import { DateTime } from 'luxon';

/**
 * Collapses a day's free start times into spoken-friendly windows.
 * [9:00, 9:15, 9:30, 14:00, 14:15] with a 15-min step
 *   -> ["9:00 AM to 9:30 AM", "2:00 PM to 2:15 PM"]
 * Each window lists the first and last possible START time. A single free
 * start becomes just "4:30 PM".
 */
export function freeRanges(starts: DateTime[], stepMinutes: number): string[] {
  const sorted = [...starts].sort((a, b) => a.toMillis() - b.toMillis());
  const stepMs = stepMinutes * 60_000;
  const ranges: string[] = [];
  const fmt = (d: DateTime) => d.toFormat('h:mm a');

  let first = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur && cur.toMillis() - prev.toMillis() === stepMs) {
      prev = cur;
      continue;
    }
    if (first) {
      ranges.push(
        first.toMillis() === prev.toMillis()
          ? fmt(first)
          : `${fmt(first)} to ${fmt(prev)}`,
      );
    }
    first = cur;
    prev = cur;
  }
  return ranges;
}
