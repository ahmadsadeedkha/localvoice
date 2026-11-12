import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { type calendar_v3 } from '@googleapis/calendar';
import { Booking } from '../database/entities/booking.entity';
import { GoogleCalendarService } from '../integrations/google/google-calendar.service';
import {
  AvailabilityProvider,
  CalendarUnavailableError,
  FreeSlotQuery,
  TimeSlot,
} from './availability.provider';
import { MockAvailabilityProvider } from './mock-availability.provider';
import { BusyInterval, subtractBusy } from './subtract-busy';

/** The caller is waiting on the phone: never let Google stall the conversation. */
const GOOGLE_TIMEOUT_MS = 4000;

/**
 * Slots = business hours minus our own bookings (the DB provider)
 *         minus busy time on the business's Google Calendar.
 * Tenants that haven't connected Google get the DB-only slots, unchanged.
 */
@Injectable()
export class GoogleAvailabilityProvider implements AvailabilityProvider {
  private readonly log = new Logger(GoogleAvailabilityProvider.name);

  constructor(
    private readonly db: MockAvailabilityProvider,
    private readonly google: GoogleCalendarService,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
  ) {}

  async getFreeSlots(q: FreeSlotQuery): Promise<TimeSlot[]> {
    const connection = await this.google
      .availabilityConnection(q.tenantId)
      .catch((e: unknown) => {
        throw new CalendarUnavailableError(String(e));
      });
    const slots = await this.db.getFreeSlots(q);
    if (!connection || !slots.length) return slots;

    const own = q.excludeBookingId
      ? await this.bookings.findOne({
          where: { id: q.excludeBookingId, tenantId: q.tenantId },
        })
      : null;
    // Free/busy merges overlapping events, so only event identities can safely
    // exclude our event while preserving any other event at the same time.
    const busy = own?.calendarEventId
      ? await this.fetchBusyEvents(
          q,
          connection.calendarId!,
          own.calendarEventId,
        )
      : await this.fetchBusy(q.tenantId, connection.calendarId!, q.from, q.to);
    return subtractBusy(slots, busy);
  }

  /** When rescheduling, the booking's own Google event must not block its new time. */
  private async fetchBusyEvents(
    q: FreeSlotQuery,
    calendarId: string,
    excludedEventId: string,
  ): Promise<BusyInterval[]> {
    try {
      const deadline = Date.now() + GOOGLE_TIMEOUT_MS;
      const api = await this.google.calendarApi(q.tenantId);
      const busy: BusyInterval[] = [];
      let pageToken: string | undefined;
      do {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Calendar events lookup timed out');
        const res = await this.google.call(q.tenantId, () =>
          api.events.list(
            {
              calendarId,
              timeMin: q.from.toISOString(),
              timeMax: q.to.toISOString(),
              singleEvents: true, // Expand recurring instances within the window.
              showDeleted: false,
              maxResults: 2500,
              pageToken,
            },
            { timeout: remaining },
          ),
        );
        for (const event of res.data.items ?? []) {
          if (
            event.id === excludedEventId ||
            event.status === 'cancelled' ||
            event.transparency === 'transparent' ||
            event.attendees?.some(
              (a) => a.self && a.responseStatus === 'declined',
            )
          )
            continue;
          const zone = res.data.timeZone ?? q.timezone;
          const start = this.eventTime(event.start, zone);
          const end = this.eventTime(event.end, zone);
          if (!start.isValid || !end.isValid || end <= start) {
            throw new Error('Calendar event has invalid start/end');
          }
          busy.push({ start: start.toJSDate(), end: end.toJSDate() });
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return busy;
    } catch (e) {
      this.log.error(
        `Google events lookup failed for tenant ${q.tenantId}: ${String(e)}`,
      );
      throw new CalendarUnavailableError(String(e));
    }
  }

  private eventTime(
    value: calendar_v3.Schema$EventDateTime | undefined,
    calendarZone: string,
  ) {
    // All-day date boundaries use the calendar's timezone, not the server's.
    return DateTime.fromISO(value?.dateTime ?? value?.date ?? '', {
      zone: value?.timeZone ?? calendarZone,
    });
  }

  private async fetchBusy(
    tenantId: string,
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<BusyInterval[]> {
    try {
      const api = await this.google.calendarApi(tenantId);
      const res = await this.google.call(tenantId, () =>
        api.freebusy.query(
          {
            requestBody: {
              timeMin: from.toISOString(),
              timeMax: to.toISOString(),
              items: [{ id: calendarId }],
            },
          },
          { timeout: GOOGLE_TIMEOUT_MS },
        ),
      );

      const cal = res.data.calendars?.[calendarId];
      // Google reports per-calendar errors here (e.g. calendar deleted or access removed)
      // instead of failing the request, so treat them as failures too.
      if (!cal || cal.errors?.length) {
        throw new Error(
          `freebusy error: ${JSON.stringify(cal?.errors ?? 'calendar missing')}`,
        );
      }
      return (cal.busy ?? [])
        .filter((b) => b.start && b.end)
        .map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
    } catch (e) {
      this.log.error(
        `Google free/busy failed for tenant ${tenantId}: ${String(e)}`,
      );
      throw new CalendarUnavailableError(String(e));
    }
  }
}
