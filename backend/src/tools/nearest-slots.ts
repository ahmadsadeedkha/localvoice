import { DateTime } from 'luxon';

/**
 * The n slots closest to the caller's preferred time, returned in time order.
 * Used instead of an even spread when the caller names a time ("around 2").
 */
export function nearestSlots(
  slots: DateTime[],
  target: DateTime,
  n: number,
): DateTime[] {
  return [...slots]
    .sort(
      (a, b) =>
        Math.abs(a.toMillis() - target.toMillis()) -
          Math.abs(b.toMillis() - target.toMillis()) ||
        a.toMillis() - b.toMillis(), // tie: earlier first
    )
    .slice(0, n)
    .sort((a, b) => a.toMillis() - b.toMillis());
}
