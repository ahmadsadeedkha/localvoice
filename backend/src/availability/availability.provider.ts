export interface TimeSlot {
  start: Date;
  end: Date;
  resourceId: string;
}

export interface FreeSlotQuery {
  tenantId: string;
  /** IANA timezone of the tenant, e.g. 'America/Chicago' */
  timezone: string;
  durationMinutes: number;
  from: Date;
  to: Date;
}

export interface AvailabilityProvider {
  getFreeSlots(query: FreeSlotQuery): Promise<TimeSlot[]>;
}

/** Injection token, so Week 4 can swap in a Google Calendar provider without touching the tools. */
export const AVAILABILITY_PROVIDER = Symbol('AVAILABILITY_PROVIDER');

/**
 * The external calendar couldn't be read (Google down, slow, or access revoked).
 * We fail closed: offering slots we can't verify risks double-booking a real job.
 */
export class CalendarUnavailableError extends Error {}

/** What the voice tools return when that happens, so the agent can recover out loud. */
export const CALENDAR_UNAVAILABLE_RESULT = {
  error: 'calendar_unavailable',
  message:
    "The booking calendar can't be reached right now. Don't promise a time. Offer to take a message so the team can call back to book.",
} as const;