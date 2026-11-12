import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { DateTime } from 'luxon';
import { Booking } from '../database/entities/booking.entity';
import { Service } from '../database/entities/service.entity';
import {
  AVAILABILITY_PROVIDER,
  type AvailabilityProvider,
  CalendarUnavailableError,
  type TimeSlot,
} from '../availability/availability.provider';
import {
  CALENDAR_SYNC_QUEUE,
  CANCEL_EVENT_JOB,
  CREATE_EVENT_JOB_OPTS,
  UPDATE_EVENT_JOB,
  cancelEventJobId,
  updateEventJobId,
} from '../calendar-sync/calendar-sync.constants';
import { enqueueSync } from '../calendar-sync/enqueue';
import { BookingService } from './booking.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS_AHEAD = 60;
const EXCLUSION_VIOLATION = '23P01';

const isExclusionViolation = (e: any) =>
  e?.driverError?.code === EXCLUSION_VIOLATION ||
  e?.code === EXCLUSION_VIOLATION;

/** Staff-side changes to existing bookings, from the dashboard. */
@Injectable()
export class AppointmentChangesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(AVAILABILITY_PROVIDER)
    private readonly availability: AvailabilityProvider,
    private readonly bookings: BookingService,
    @InjectQueue(CALENDAR_SYNC_QUEUE) private readonly calendarSync: Queue,
  ) {}

  /** Free times on `date` this booking could move to (its own time counts as free). */
  async slots(tenantId: string, bookingId: string, date: string) {
    if (!DATE_RE.test(date ?? '')) {
      throw new BadRequestException('Date must be YYYY-MM-DD');
    }
    const booking = await this.changeable(tenantId, bookingId);
    const [tz, service] = await Promise.all([
      this.timezone(tenantId),
      this.service(tenantId, booking.serviceId),
    ]);

    const day = DateTime.fromISO(date, { zone: tz }).startOf('day');
    const today = DateTime.now().setZone(tz).startOf('day');
    if (!day.isValid) throw new BadRequestException('That date is not valid');
    if (day < today) throw new BadRequestException('That date has passed');
    if (day > today.plus({ days: MAX_DAYS_AHEAD })) {
      throw new BadRequestException(
        `Appointments can be moved up to ${MAX_DAYS_AHEAD} days ahead`,
      );
    }

    const free = await this.freeSlots(tenantId, tz, service, booking.id, day);
    const unique = [...new Set(free.map((s) => s.start.getTime()))].sort(
      (a, b) => a - b,
    );
    return {
      timezone: tz,
      date,
      durationMinutes: service.durationMinutes,
      currentStart: booking.startsAt.toISOString(),
      slots: unique.map((ms) => {
        const dt = DateTime.fromMillis(ms, { zone: tz });
        return { start: dt.toISO()!, label: dt.toFormat('h:mm a') };
      }),
    };
  }

  async reschedule(tenantId: string, bookingId: string, start: string) {
    const startDt = DateTime.fromISO(start ?? '', { setZone: true });
    if (!startDt.isValid) throw new BadRequestException('Pick a time');

    const booking = await this.changeable(tenantId, bookingId);
    if (booking.startsAt.getTime() === startDt.toMillis()) {
      return { rescheduled: false, startsAt: booking.startsAt };
    }

    const [tz, service] = await Promise.all([
      this.timezone(tenantId),
      this.service(tenantId, booking.serviceId),
    ]);
    const day = startDt.setZone(tz).startOf('day');
    const free = await this.freeSlots(tenantId, tz, service, booking.id, day);
    const slot = free.find((s) => s.start.getTime() === startDt.toMillis());
    if (!slot) {
      throw new ConflictException(
        'That time is no longer free. Pick another time.',
      );
    }

    try {
      await this.ds.transaction(async (m) => {
        const locked = await m.findOne(Booking, {
          where: { id: booking.id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked || locked.status !== 'confirmed') {
          throw new ConflictException(
            'This appointment can no longer be changed',
          );
        }
        Object.assign(locked, {
          startsAt: slot.start,
          endsAt: slot.end,
          resourceId: slot.resourceId,
          // The Google event now shows the old time until the job moves it.
          calendarSyncStatus: 'pending',
        });
        await m.save(locked);
      });
    } catch (e) {
      // Someone else (e.g. a caller on the phone) took it a moment ago.
      if (isExclusionViolation(e)) {
        throw new ConflictException(
          'That time was just taken. Pick another time.',
        );
      }
      throw e;
    }

    await enqueueSync(
      this.calendarSync,
      UPDATE_EVENT_JOB,
      { tenantId, bookingId: booking.id },
      { ...CREATE_EVENT_JOB_OPTS, jobId: updateEventJobId(booking.id) },
    );
    return { rescheduled: true, startsAt: slot.start };
  }

  async cancel(tenantId: string, bookingId: string) {
    await this.changeable(tenantId, bookingId);
    await this.ds.transaction((m) =>
      this.bookings.transition(m, tenantId, bookingId, 'cancelled', {
        calendarSyncStatus: 'pending',
      }),
    );
    await enqueueSync(
      this.calendarSync,
      CANCEL_EVENT_JOB,
      { tenantId, bookingId },
      { ...CREATE_EVENT_JOB_OPTS, jobId: cancelEventJobId(bookingId) },
    );
    return { cancelled: true };
  }

  /** For bookings whose calendar sync gave up (e.g. Google was disconnected at the time). */
  async retrySync(tenantId: string, bookingId: string) {
    const result = await this.ds.getRepository(Booking).update(
      {
        id: bookingId,
        tenantId,
        status: 'confirmed',
        calendarSyncStatus: 'failed',
      },
      { calendarSyncStatus: 'pending' },
    );
    if (!result.affected) {
      throw new ConflictException('Only failed calendar syncs can be retried');
    }
    await enqueueSync(
      this.calendarSync,
      UPDATE_EVENT_JOB,
      { tenantId, bookingId },
      { ...CREATE_EVENT_JOB_OPTS, jobId: updateEventJobId(bookingId) },
    );
    return { queued: true };
  }

  // ---------- helpers ----------

  /** Only upcoming, confirmed bookings can be moved or cancelled. */
  private async changeable(tenantId: string, bookingId: string) {
    const booking = await this.ds
      .getRepository(Booking)
      .findOne({ where: { id: bookingId, tenantId } });
    if (!booking) throw new NotFoundException('Appointment not found');
    if (booking.status !== 'confirmed') {
      throw new ConflictException(
        `This appointment is already ${booking.status}`,
      );
    }
    if (booking.endsAt.getTime() < Date.now()) {
      throw new ConflictException('This appointment is in the past');
    }
    return booking;
  }

  private async timezone(tenantId: string): Promise<string> {
    const rows = await this.ds.query(
      `SELECT timezone FROM tenants WHERE id = $1::uuid`,
      [tenantId],
    );
    return String(rows[0]?.timezone ?? 'UTC');
  }

  private async service(tenantId: string, serviceId: string) {
    // Not filtered by `active`: an existing booking keeps its service even if
    // the service was deactivated later.
    const service = await this.ds
      .getRepository(Service)
      .findOne({ where: { id: serviceId, tenantId } });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  private async freeSlots(
    tenantId: string,
    tz: string,
    service: Service,
    excludeBookingId: string,
    day: DateTime,
  ): Promise<TimeSlot[]> {
    try {
      const slots = await this.availability.getFreeSlots({
        tenantId,
        timezone: tz,
        durationMinutes: service.durationMinutes,
        from: day.startOf('day').toJSDate(),
        to: day.endOf('day').toJSDate(),
        excludeBookingId,
      });
      return slots.filter((s) => s.start.getTime() > Date.now());
    } catch (e) {
      if (e instanceof CalendarUnavailableError) {
        throw new ServiceUnavailableException(
          "Google Calendar can't be reached right now. Try again shortly.",
        );
      }
      throw e;
    }
  }
}
