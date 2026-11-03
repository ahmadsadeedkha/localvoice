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
 * Used when rescheduling: the booking's own Google event shows as busy, but
 * the booking is the thing being moved, so its own time must count as free.
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
