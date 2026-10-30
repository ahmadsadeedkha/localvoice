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
