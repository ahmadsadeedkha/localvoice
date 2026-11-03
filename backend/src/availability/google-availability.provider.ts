import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../database/entities/booking.entity';
import { GoogleCalendarService } from '../integrations/google/google-calendar.service';
import {
  AvailabilityProvider,
  CalendarUnavailableError,
  FreeSlotQuery,
  TimeSlot,
} from './availability.provider';
import { MockAvailabilityProvider } from './mock-availability.provider';
import { BusyInterval, removeInterval, subtractBusy } from './subtract-busy';

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
    const connection = await this.google.activeConnection(q.tenantId);
    const slots = await this.db.getFreeSlots(q);
    if (!connection || !slots.length) return slots;

    const busy = await this.fetchBusy(
      q.tenantId,
      connection.calendarId!,
      q.from,
      q.to,
    );
    return subtractBusy(slots, await this.withoutOwnEvent(busy, q));
  }

  /** When rescheduling, the booking's own Google event must not block its new time. */
  private async withoutOwnEvent(
    busy: BusyInterval[],
    q: FreeSlotQuery,
  ): Promise<BusyInterval[]> {
    if (!q.excludeBookingId) return busy;
    const own = await this.bookings.findOne({
      where: { id: q.excludeBookingId, tenantId: q.tenantId },
    });
    if (!own?.calendarEventId) return busy; // never written to Google: nothing to remove
    return removeInterval(busy, { start: own.startsAt, end: own.endsAt });
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
