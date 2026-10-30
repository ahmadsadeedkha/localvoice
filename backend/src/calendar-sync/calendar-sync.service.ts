import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UnrecoverableError } from 'bullmq';
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
  isPermanentGoogleError,
} from './calendar-event';

const GOOGLE_TIMEOUT_MS = 10_000; // background job: nobody is waiting on the phone

export type SyncResult = 'synced' | 'already_synced' | 'skipped';

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
    const booking = await this.ds
      .getRepository(Booking)
      .findOne({ where: { id: bookingId, tenantId } });
    if (!booking || booking.status !== 'confirmed') return 'skipped';
    if (booking.calendarSyncStatus === 'synced') return 'already_synced';

    // Not using Google (or disconnected since): leave the booking as is, nothing to sync to.
    const connection = await this.google.activeConnection(tenantId);
    if (!connection) return 'skipped';

    const [service, tenantRows] = await Promise.all([
      this.ds
        .getRepository(Service)
        .findOne({ where: { id: booking.serviceId, tenantId } }),
      this.ds.query(`SELECT timezone FROM tenants WHERE id = $1`, [tenantId]),
    ]);
    const timezone = String(tenantRows[0]?.timezone ?? 'UTC');

    const event = buildEvent({
      bookingId: booking.id,
      serviceName: service?.name ?? 'Appointment',
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      notes: booking.notes,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      timezone,
    });

    try {
      const api = await this.google.calendarApi(tenantId);
      await this.google.call(tenantId, () =>
        api.events.insert(
          { calendarId: connection.calendarId!, requestBody: event },
          { timeout: GOOGLE_TIMEOUT_MS },
        ),
      );
    } catch (e) {
      if (isAlreadyExists(e)) {
        // An earlier attempt created it but crashed before saving: just record it.
        this.log.log(`Event for booking ${bookingId} already exists in Google`);
      } else if (e instanceof GoogleNotConnectedError) {
        throw new UnrecoverableError('google_access_revoked');
      } else if (isPermanentGoogleError(e)) {
        throw new UnrecoverableError(`google_rejected: ${String(e)}`);
      } else {
        throw e; // network, 429, 5xx: BullMQ retries with backoff
      }
    }

    await this.ds
      .getRepository(Booking)
      .update(
        { id: booking.id, tenantId },
        {
          calendarSyncStatus: 'synced',
          calendarEventId: googleEventId(booking.id),
        },
      );
    this.log.log(`Booking ${bookingId} synced to Google Calendar`);
    return 'synced';
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
         AND b.created_at < now() - interval '2 minutes'
       ORDER BY b.starts_at
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ tenantId: r.tenant_id, bookingId: r.id }));
  }
}
