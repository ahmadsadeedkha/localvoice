import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DateTime } from 'luxon';
import { Booking } from '../database/entities/booking.entity';
import { BOOKING_TRANSITIONS, BookingStatus } from '../database/entities/booking-status';
import { Call } from '../database/entities/call.entity';
import { Service } from '../database/entities/service.entity';
import {
  AVAILABILITY_PROVIDER,
  CALENDAR_UNAVAILABLE_RESULT,
  CalendarUnavailableError,
  TimeSlot,
  type AvailabilityProvider,
} from '../availability/availability.provider';
import { CallContext } from '../calls/call-context.types';

const HOLD_TTL_MS = 5 * 60 * 1000;
const MAX_BOOKINGS_PER_CALL = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^\+?[0-9]{7,15}$/;
const EXCLUSION_VIOLATION = '23P01';
const LABEL_FORMAT = "cccc, d LLLL 'at' h:mm a";

export interface BookInput {
  service_id?: string;
  start?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
}

class TooManyBookingsError extends Error {}

const isExclusionViolation = (e: any) =>
  e?.driverError?.code === EXCLUSION_VIOLATION || e?.code === EXCLUSION_VIOLATION;

@Injectable()
export class BookingService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(AVAILABILITY_PROVIDER) private readonly availability: AvailabilityProvider,
  ) {}

  /**
   * Voice-flow entry point. Everything in `input` came from the LLM, so it is untrusted:
   * validated here, and the slot is re-checked against real availability.
   * Errors are returned as data (not thrown) so the agent can explain them out loud.
   */
  async bookAppointment(call: CallContext, input: BookInput) {
    const { tenantId } = call;

    if (!input.service_id || !UUID_RE.test(input.service_id)) {
      return { error: 'invalid_service', message: 'Pick a service from get_business_info first.' };
    }

    const startDt = DateTime.fromISO(input.start ?? '', { setZone: true });
    if (!startDt.isValid) {
      return { error: 'invalid_start', message: 'Use the exact start value returned by check_availability.' };
    }

    const name = (input.customer_name ?? '').trim();
    if (name.length < 2 || name.length > 200) {
      return { error: 'missing_name', message: 'Ask the caller for their name.' };
    }

    const callRow = await this.ds.getRepository(Call).findOne({ where: { id: call.callId, tenantId } });
    let phone = (input.customer_phone ?? '').replace(/[\s\-()]/g, '');
    if (!phone && callRow?.fromNumber) phone = callRow.fromNumber;
    if (!PHONE_RE.test(phone)) {
      return { error: 'missing_phone', message: 'Ask the caller for a phone number we can reach them on.' };
    }

    const notes = input.notes?.trim().slice(0, 500) || null;

    const tenantRows = await this.ds.query(`SELECT timezone FROM tenants WHERE id = $1`, [tenantId]);
    if (!tenantRows.length) throw new Error('Tenant not found');
    const tz = String(tenantRows[0].timezone);

    const service = await this.ds
      .getRepository(Service)
      .findOne({ where: { id: input.service_id, tenantId, active: true } });
    if (!service) return { error: 'unknown_service', message: 'That service does not exist.' };

    // The requested start must be a genuinely free slot right now.
    const local = startDt.setZone(tz);
    // With Google connected, this re-checks the real calendar right before booking.
    let free: TimeSlot[];
    try {
      free = await this.availability.getFreeSlots({
        tenantId,
        timezone: tz,
        durationMinutes: service.durationMinutes,
        from: local.startOf('day').toJSDate(),
        to: local.endOf('day').toJSDate(),
      });
    } catch (e) {
      // Never claim a booking we couldn't verify against the calendar.
      if (e instanceof CalendarUnavailableError) return CALENDAR_UNAVAILABLE_RESULT;
      throw e;
    }
    const slot = free.find((s) => s.start.getTime() === startDt.toMillis());
    if (!slot) {
      return {
        error: 'slot_unavailable',
        message: 'That time is not available. Call check_availability again and offer other times.',
      };
    }

    try {
      const booking = await this.ds.transaction(async (m) => {
        // Retell may retry a tool call: same call + service + start returns the existing booking.
        const existing = await m.findOne(Booking, {
          where: {
            tenantId,
            callId: call.callId,
            serviceId: service.id,
            startsAt: slot.start,
            status: 'confirmed',
          },
        });
        if (existing) return existing;

        const count = await m.count(Booking, { where: { tenantId, callId: call.callId } });
        if (count >= MAX_BOOKINGS_PER_CALL) throw new TooManyBookingsError();

        const held = await this.createHold(m, {
          tenantId,
          callId: call.callId,
          resourceId: slot.resourceId,
          serviceId: service.id,
          startsAt: slot.start,
          endsAt: slot.end,
          customerName: name,
          customerPhone: phone,
          notes,
        });
        // TODO Week 4: enqueue the calendar-sync job here (after commit).
        return this.transition(m, tenantId, held.id, 'confirmed', { holdExpiresAt: null });
      });

      return {
        booked: true,
        booking_id: booking.id,
        service: service.name,
        when: DateTime.fromJSDate(booking.startsAt, { zone: tz }).toFormat(LABEL_FORMAT),
        duration_minutes: service.durationMinutes,
        customer_name: name,
      };
    } catch (e) {
      if (e instanceof TooManyBookingsError) {
        return { error: 'too_many_bookings', message: 'Booking limit for one call reached. Offer to take a message instead.' };
      }
      // Lost a race with another caller: the DB constraint is the final guard.
      if (isExclusionViolation(e)) {
        return {
          error: 'slot_unavailable',
          message: 'That time was just taken. Call check_availability again and offer other times.',
        };
      }
      throw e;
    }
  }

  /** Insert a short-lived hold. Runs inside the caller's transaction. */
  private async createHold(
    m: EntityManager,
    h: {
      tenantId: string;
      callId: string;
      resourceId: string;
      serviceId: string;
      startsAt: Date;
      endsAt: Date;
      customerName: string;
      customerPhone: string;
      notes: string | null;
    },
  ): Promise<Booking> {
    // An expired hold still blocks the exclusion constraint until the BullMQ job flips it,
    // so clear stale overlapping holds first (held -> expired is a legal transition).
    await m.query(
      `UPDATE bookings SET status = 'expired', updated_at = now()
       WHERE tenant_id = $1::uuid AND resource_id = $2::uuid
         AND status = 'held' AND hold_expires_at < now()
         AND tstzrange(starts_at, ends_at) && tstzrange($3::timestamptz, $4::timestamptz)`,
      [h.tenantId, h.resourceId, h.startsAt, h.endsAt],
    );

    return m.save(
      m.create(Booking, {
        ...h,
        status: 'held',
        holdExpiresAt: new Date(Date.now() + HOLD_TTL_MS),
      }),
    );
  }

  /** The ONLY place a booking's status changes. Row-locked so concurrent changes serialize. */
  async transition(
    m: EntityManager,
    tenantId: string,
    bookingId: string,
    to: BookingStatus,
    patch: Partial<Booking> = {},
  ): Promise<Booking> {
    const booking = await m.findOne(Booking, {
      where: { id: bookingId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (!BOOKING_TRANSITIONS[booking.status].includes(to)) {
      throw new ConflictException(`Illegal booking transition ${booking.status} -> ${to}`);
    }
    Object.assign(booking, patch, { status: to });
    return m.save(booking);
  }
}
