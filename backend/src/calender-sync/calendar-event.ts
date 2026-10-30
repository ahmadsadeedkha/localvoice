import { type calendar_v3 } from '@googleapis/calendar';

/**
 * Google lets us choose the event id (lowercase a-v and 0-9, 5-1024 chars).
 * A UUID without dashes is hex, so it qualifies. Using the booking id means a
 * retried job can never create a second event: Google answers 409 instead.
 */
export function googleEventId(bookingId: string): string {
  return bookingId.replace(/-/g, '').toLowerCase();
}

export interface EventInput {
  bookingId: string;
  serviceName: string;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}

export function buildEvent(b: EventInput): calendar_v3.Schema$Event {
  const who = b.customerName ?? 'Caller';
  const description = [
    `Customer: ${who}`,
    b.customerPhone ? `Phone: ${b.customerPhone}` : null,
    b.notes ? `Notes: ${b.notes}` : null,
    '',
    'Booked by the LocalVoice AI phone receptionist.',
  ]
    .filter((l) => l !== null)
    .join('\n');

  return {
    id: googleEventId(b.bookingId),
    summary: `${b.serviceName} - ${who}`,
    description,
    start: { dateTime: b.startsAt.toISOString(), timeZone: b.timezone },
    end: { dateTime: b.endsAt.toISOString(), timeZone: b.timezone },
    transparency: 'opaque', // shows as Busy, so free/busy blocks this time too
    extendedProperties: { private: { localvoiceBookingId: b.bookingId } },
  };
}

const statusOf = (e: any): number | undefined =>
  e?.status ??
  e?.response?.status ??
  (typeof e?.code === 'number' ? e.code : undefined);

/** 409: an event with our id already exists, i.e. an earlier attempt succeeded. */
export const isAlreadyExists = (e: unknown) => statusOf(e) === 409;

/** Errors that retrying won't fix (bad request, calendar gone, no write access). */
export const isPermanentGoogleError = (e: unknown) =>
  [400, 403, 404].includes(statusOf(e) ?? 0);
