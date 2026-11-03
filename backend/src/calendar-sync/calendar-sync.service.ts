import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UnrecoverableError } from 'bullmq';
import { type calendar_v3 } from '@googleapis/calendar';
import { Booking } from '../database/entities/booking.entity';
import { Service } from '../database/entities/service.entity';
import {
  GoogleCalendarService,
  GoogleNotConnectedError,
} from '../integrations/google/google-calendar.service';
import {
  buildEvent,
  googleEventId,
  isAlreadyExists,
  isGone,
  isPermanentGoogleError,
} from './calendar-event';

const GOOGLE_TIMEOUT_MS = 10_000; // background job: nobody is waiting on the phone

export type SyncResult = 'synced' | 'already_synced' | 'deleted' | 'skipped';

@Injectable()
export class CalendarSyncService {
  private readonly log = new Logger(CalendarSyncService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly google: GoogleCalendarService,
  ) {}

  /**
   * Writes one confirmed booking into the business's Google Calendar.
   * Safe to run any number of times for the same booking.
   * Throws a normal Error to retry, UnrecoverableError to give up immediately.
   */
  async createEvent(tenantId: string, bookingId: string): Promise<SyncResult> {
    const booking = await this.findBooking(tenantId, bookingId);
    if (!booking || booking.status !== 'confirmed') return 'skipped';
    if (booking.calendarSyncStatus === 'synced') return 'already_synced';

    const calendarId = await this.calendarIdFor(tenantId);
    if (!calendarId) return 'skipped'; // not using Google (or disconnected since)

    const event = await this.eventFor(booking);
    const api = await this.google.calendarApi(tenantId);
    try {
      await this.google.call(tenantId, () =>
        api.events.insert(
          { calendarId, requestBody: event },
          { timeout: GOOGLE_TIMEOUT_MS },
        ),
      );
    } catch (e) {
      if (!isAlreadyExists(e)) this.rethrow(e);
      // The event exists already: an earlier attempt succeeded, or it was deleted
      // in Google, or the booking moved while this job was queued. Overwrite it
      // with the booking's current details (status 'confirmed' also restores a
      // deleted event).
      await this.patch(api, tenantId, calendarId, event);
    }

    await this.markSynced(tenantId, booking.id);
    this.log.log(`Booking ${bookingId} synced to Google Calendar`);
    return 'synced';
  }

  /** Booking was rescheduled: move its Google event (or create it if it never got one). */
  async updateEvent(tenantId: string, bookingId: string): Promise<SyncResult> {
    const booking = await this.findBooking(tenantId, bookingId);
    if (!booking || booking.status !== 'confirmed') return 'skipped';

    const calendarId = await this.calendarIdFor(tenantId);
    if (!calendarId) return 'skipped';

    if (!booking.calendarEventId) return this.createEvent(tenantId, bookingId);

    const event = await this.eventFor(booking);
    const api = await this.google.calendarApi(tenantId);
    try {
      await this.patch(api, tenantId, calendarId, event);
    } catch (e) {
      // 404: the business switched to a different calendar since this event
      // was made. Create it in the current calendar instead.
      if (!isGone(e)) this.rethrow(e);
      await this.ds
        .getRepository(Booking)
        .update(
          { id: booking.id, tenantId },
          { calendarSyncStatus: 'pending', calendarEventId: null },
        );
      return this.createEvent(tenantId, bookingId);
    }

    await this.markSynced(tenantId, booking.id);
    this.log.log(`Booking ${bookingId} moved in Google Calendar`);
    return 'synced';
  }

  /** Booking was cancelled: remove its Google event so the time shows free again. */
  async cancelEvent(tenantId: string, bookingId: string): Promise<SyncResult> {
    const booking = await this.findBooking(tenantId, bookingId);
    if (!booking || booking.status !== 'cancelled') return 'skipped';
    if (!booking.calendarEventId) return 'skipped'; // never reached Google

    const calendarId = await this.calendarIdFor(tenantId);
    if (!calendarId) return 'skipped';

    const api = await this.google.calendarApi(tenantId);
    try {
      await this.google.call(tenantId, () =>
        api.events.delete(
          {
            calendarId,
            eventId: booking.calendarEventId!,
            sendUpdates: 'none',
          },
          { timeout: GOOGLE_TIMEOUT_MS },
        ),
      );
    } catch (e) {
      // Already deleted (by a previous attempt or by hand in Google): done.
      if (!isGone(e)) this.rethrow(e);
    }
    this.log.log(`Booking ${bookingId} removed from Google Calendar`);
    return 'deleted';
  }

  /** Called once retries are exhausted (or on an unrecoverable error). Staff see it in the dashboard. */
  async markFailed(tenantId: string, bookingId: string, reason: string) {
    await this.ds
      .getRepository(Booking)
      .update(
        { id: bookingId, tenantId, calendarSyncStatus: 'pending' },
        { calendarSyncStatus: 'failed' },
      );
    this.log.error(
      `Booking ${bookingId} could not be synced to Google Calendar: ${reason}`,
    );
  }

  /**
   * Safety net: confirmed future bookings still 'pending' for a connected tenant
   * (e.g. Redis was down at booking time, so the job was never queued).
   */
  async findUnsynced(
    limit = 100,
  ): Promise<{ tenantId: string; bookingId: string }[]> {
    const rows: { tenant_id: string; id: string }[] = await this.ds.query(
      `SELECT b.tenant_id, b.id
       FROM bookings b
       JOIN google_calendar_connections g
         ON g.tenant_id = b.tenant_id AND g.status = 'active' AND g.calendar_id IS NOT NULL
       WHERE b.status = 'confirmed'
         AND b.calendar_sync_status = 'pending'
         AND b.starts_at > now()
         AND b.updated_at < now() - interval '2 minutes'
       ORDER BY b.starts_at
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ tenantId: r.tenant_id, bookingId: r.id }));
  }

  // ---------- helpers ----------

  private findBooking(tenantId: string, bookingId: string) {
    return this.ds
      .getRepository(Booking)
      .findOne({ where: { id: bookingId, tenantId } });
  }

  private async calendarIdFor(tenantId: string): Promise<string | null> {
    const connection = await this.google.activeConnection(tenantId);
    return connection?.calendarId ?? null;
  }

  private async eventFor(booking: Booking): Promise<calendar_v3.Schema$Event> {
    const [service, tenantRows] = await Promise.all([
      this.ds.getRepository(Service).findOne({
        where: { id: booking.serviceId, tenantId: booking.tenantId },
      }),
      this.ds.query(`SELECT timezone FROM tenants WHERE id = $1`, [
        booking.tenantId,
      ]),
    ]);
    return buildEvent({
      bookingId: booking.id,
      serviceName: service?.name ?? 'Appointment',
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      notes: booking.notes,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      timezone: String(tenantRows[0]?.timezone ?? 'UTC'),
    });
  }

  /** Overwrites our event with the booking's current details. */
  private async patch(
    api: calendar_v3.Calendar,
    tenantId: string,
    calendarId: string,
    event: calendar_v3.Schema$Event,
  ) {
    const { id, ...body } = event;
    await this.google.call(tenantId, () =>
      api.events.patch(
        {
          calendarId,
          eventId: id!,
          requestBody: { ...body, status: 'confirmed' },
          sendUpdates: 'none',
        },
        { timeout: GOOGLE_TIMEOUT_MS },
      ),
    );
  }

  private async markSynced(tenantId: string, bookingId: string) {
    await this.ds.getRepository(Booking).update(
      { id: bookingId, tenantId },
      {
        calendarSyncStatus: 'synced',
        calendarEventId: googleEventId(bookingId),
      },
    );
  }

  /** Decides retry vs give up for any Google error. Always throws. */
  private rethrow(e: unknown): never {
    if (e instanceof GoogleNotConnectedError) {
      throw new UnrecoverableError('google_access_revoked');
    }
    if (isPermanentGoogleError(e)) {
      throw new UnrecoverableError(`google_rejected: ${String(e)}`);
    }
    throw e; // network, 429, 5xx: BullMQ retries with backoff
  }
}
