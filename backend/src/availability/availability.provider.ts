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
