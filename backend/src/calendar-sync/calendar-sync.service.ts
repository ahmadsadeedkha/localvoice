import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
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

  /** A row lock serializes workers with reschedules/cancellations across replicas. */
  createEvent(tenantId: string, bookingId: string): Promise<SyncResult> {
    return this.withBookingLock(tenantId, bookingId, async (m, booking) => {
      if (booking.status !== 'confirmed') return 'skipped';
      if (booking.calendarSyncStatus === 'synced') return 'already_synced';
      return this.writeEvent(m, booking);
    });
  }

  updateEvent(tenantId: string, bookingId: string): Promise<SyncResult> {
    return this.withBookingLock(tenantId, bookingId, async (m, booking) => {
      if (booking.status !== 'confirmed') return 'skipped';
      return this.writeEvent(m, booking);
    });
  }

  cancelEvent(tenantId: string, bookingId: string): Promise<SyncResult> {
    return this.withBookingLock(tenantId, bookingId, async (m, booking) => {
      if (booking.status !== 'cancelled') return 'skipped';
      // A prior insert may have reached Google before timing out. Its durable
      // destination and deterministic ID let cancellation clean it up too.
      const calendarId = booking.calendarId;
      if (!calendarId) {
        if (booking.calendarEventId)
          throw new Error('Calendar destination missing');
        await this.markCancelledSynced(m, tenantId, bookingId);
        return 'skipped';
      }
      const api = await this.google.calendarApi(tenantId);
      try {
        await this.google.call(tenantId, () =>
          api.events.delete(
            {
              calendarId,
              eventId: booking.calendarEventId ?? googleEventId(bookingId),
              sendUpdates: 'none',
            },
            { timeout: GOOGLE_TIMEOUT_MS },
          ),
        );
      } catch (e) {
        if (!isGone(e)) this.rethrow(e);
      }
      await this.markCancelledSynced(m, tenantId, bookingId);
      return 'deleted';
    });
  }

  private async writeEvent(
    m: EntityManager,
    booking: Booking,
  ): Promise<SyncResult> {
    const { tenantId } = booking;
    const calendarId =
      booking.calendarId ?? (await this.calendarIdFor(tenantId));
    if (!calendarId) return 'skipped';
    if (!booking.calendarId) {
      // Commit this destination even if Google fails, so retries never switch
      // calendars after a timeout whose insert may actually have succeeded.
      await m
        .getRepository(Booking)
        .update({ id: booking.id, tenantId }, { calendarId });
      booking.calendarId = calendarId;
    }
    const event = await this.eventFor(booking);
    const api = await this.google.calendarApi(tenantId);
    const insert = async () => {
      try {
        await this.google.call(tenantId, () =>
          api.events.insert(
            {
              calendarId,
              requestBody: event,
            },
            { timeout: GOOGLE_TIMEOUT_MS },
          ),
        );
      } catch (e) {
        if (!isAlreadyExists(e)) this.rethrow(e);
        await this.patch(api, tenantId, calendarId, event);
      }
    };
    if (booking.calendarEventId) {
      try {
        await this.patch(api, tenantId, calendarId, event);
      } catch (e) {
        if (!isGone(e)) this.rethrow(e);
        await insert();
      }
    } else {
      await insert();
    }
    await this.markSynced(m, tenantId, booking.id);
    return 'synced';
  }

  private async withBookingLock(
    tenantId: string,
    bookingId: string,
    work: (m: EntityManager, booking: Booking) => Promise<SyncResult>,
  ): Promise<SyncResult> {
    let failure: { error: unknown } | undefined;
    const result = await this.ds.transaction(async (m) => {
      const booking = await m.getRepository(Booking).findOne({
        where: { id: bookingId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!booking) return 'skipped' as const;
      try {
        return await work(m, booking);
      } catch (error) {
        // Preserve the destination on external failures, then let BullMQ retry.
        failure = { error };
        return 'skipped' as const;
      }
    });
    if (failure) throw failure.error;
    return result;
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
   * Safety net: pending updates and deletions for a connected tenant
   * (e.g. Redis was down at booking time, so the job was never queued).
   */
  async findUnsynced(
    limit = 100,
  ): Promise<
    { tenantId: string; bookingId: string; status: 'confirmed' | 'cancelled' }[]
  > {
    const rows: {
      tenant_id: string;
      id: string;
      status: 'confirmed' | 'cancelled';
    }[] = await this.ds.query(
      `SELECT b.tenant_id, b.id, b.status
       FROM bookings b
       JOIN google_calendar_connections g
         ON g.tenant_id = b.tenant_id AND g.status = 'active' AND g.calendar_id IS NOT NULL
       WHERE ((b.status = 'confirmed' AND b.starts_at > now()) OR b.status = 'cancelled')
         AND b.calendar_sync_status = 'pending'
         AND b.updated_at < now() - interval '2 minutes'
       ORDER BY b.starts_at
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      tenantId: r.tenant_id,
      bookingId: r.id,
      status: r.status,
    }));
  }

  // ---------- helpers ----------

  private async markCancelledSynced(
    m: EntityManager,
    tenantId: string,
    bookingId: string,
  ) {
    await m
      .getRepository(Booking)
      .update(
        { id: bookingId, tenantId, status: 'cancelled' },
        { calendarSyncStatus: 'synced', calendarEventId: null },
      );
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

  private async markSynced(
    m: EntityManager,
    tenantId: string,
    bookingId: string,
  ) {
    await m.getRepository(Booking).update(
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
