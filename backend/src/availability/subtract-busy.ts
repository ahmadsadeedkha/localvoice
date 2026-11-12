import { TimeSlot } from './availability.provider';

export interface BusyInterval {
  start: Date;
  end: Date;
}

/**
 * Drops every slot that overlaps a busy interval. Touching edges don't count:
 * a 10:00-11:00 busy block leaves an 11:00 slot free.
 * One calendar per business, so busy time blocks every resource.
 */
export function subtractBusy(
  slots: TimeSlot[],
  busy: BusyInterval[],
): TimeSlot[] {
  if (!busy.length) return slots;
  return slots.filter(
    (s) => !busy.some((b) => s.start < b.end && s.end > b.start),
  );
}

/**
 * Cuts one interval out of the busy list (splitting a block if needed).
 * Only use when the whole cut is known to be removable. Aggregated calendar
 * busy intervals cannot identify which individual event owns a time range.
 */
export function removeInterval(
  busy: BusyInterval[],
  cut: BusyInterval,
): BusyInterval[] {
  return busy.flatMap((b) => {
    if (cut.end <= b.start || cut.start >= b.end) return [b]; // no overlap
    const parts: BusyInterval[] = [];
    if (b.start < cut.start) parts.push({ start: b.start, end: cut.start });
    if (b.end > cut.end) parts.push({ start: cut.end, end: b.end });
    return parts;
  });
}
