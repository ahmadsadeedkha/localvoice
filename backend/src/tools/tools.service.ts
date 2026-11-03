import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { BusinessHours } from '../database/entities/business-hours.entity';
import { Service } from '../database/entities/service.entity';
import {
  AVAILABILITY_PROVIDER,
  type AvailabilityProvider,
  CALENDAR_UNAVAILABLE_RESULT,
  CalendarUnavailableError,
  TimeSlot,
} from '../availability/availability.provider';
import { SLOT_STEP_MINUTES } from '../availability/mock-availability.provider';
import { freeRanges } from './free-ranges';
import { nearestSlots } from './nearest-slots';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DAYS_AHEAD = 60;
const SEARCH_DAYS = 14;
const NEAREST_COUNT = 4;
const ALT_DAYS = 3;
const ALT_SUGGESTIONS = 3;
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

const fmtClock = (t: string) =>
  DateTime.fromFormat(t.slice(0, 5), 'HH:mm').toFormat('h:mm a');

/** Evenly spread n picks so the caller hears morning AND afternoon options. */
function pickSpread<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const idx = new Set(
    Array.from({ length: n }, (_, i) =>
      Math.round((i * (arr.length - 1)) / (n - 1)),
    ),
  );
  return [...idx].map((i) => arr[i]);
}

@Injectable()
export class ToolsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
    @InjectRepository(BusinessHours)
    private readonly hoursRepo: Repository<BusinessHours>,
    @Inject(AVAILABILITY_PROVIDER)
    private readonly availability: AvailabilityProvider,
  ) {}

  private async getTenant(
    tenantId: string,
  ): Promise<{ name: string; timezone: string }> {
    const rows = await this.ds.query(
      `SELECT name, timezone FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (!rows.length) throw new Error('Tenant not found');
    return { name: String(rows[0].name), timezone: String(rows[0].timezone) };
  }

  async getBusinessInfo(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    const now = DateTime.now().setZone(tenant.timezone);
    const [services, hours] = await Promise.all([
      this.serviceRepo.find({
        where: { tenantId, active: true },
        order: { name: 'ASC' },
      }),
      this.hoursRepo.find({ where: { tenantId } }),
    ]);

    const weekly = MON_FIRST.map((dow) => {
      const intervals = hours
        .filter((h) => h.dayOfWeek === dow)
        .sort((a, b) => a.openTime.localeCompare(b.openTime));
      return {
        day: DAY_NAMES[dow],
        hours: intervals.length
          ? intervals
              .map((i) => `${fmtClock(i.openTime)} to ${fmtClock(i.closeTime)}`)
              .join(', ')
          : 'Closed',
      };
    });

    const nowClock = now.toFormat('HH:mm:ss');
    const isOpenNow = hours.some(
      (h) =>
        h.dayOfWeek === now.weekday % 7 &&
        nowClock >= h.openTime &&
        nowClock < h.closeTime,
    );

    return {
      business_name: tenant.name,
      timezone: tenant.timezone,
      current_local_time: now.toFormat('cccc, d LLLL yyyy, h:mm a'),
      current_local_date: now.toISODate(),
      is_open_now: isOpenNow,
      hours: weekly,
      services: services.map((s) => ({
        service_id: s.id,
        name: s.name,
        description: s.description,
        duration_minutes: s.durationMinutes,
      })),
    };
  }

  /**
   * Args come from the LLM, so treat them as untrusted input.
   * Errors are returned as data (HTTP 200) so the agent can recover out loud.
   */
  async checkAvailability(
    tenantId: string,
    args: { service_id?: string; date?: string; time?: string },
  ) {
    if (!args?.service_id || !UUID_RE.test(args.service_id)) {
      return {
        error: 'invalid_service',
        message: 'Pick a service from get_business_info first.',
      };
    }
    if (!args.date || !DATE_RE.test(args.date)) {
      return { error: 'invalid_date', message: 'Date must be YYYY-MM-DD.' };
    }
    // Optional: the caller asked for a specific time ("around 2 PM" -> "14:00").
    const time = args.time?.trim() || undefined;
    if (time && !TIME_RE.test(time)) {
      return {
        error: 'invalid_time',
        message: 'Time must be HH:mm in 24-hour format, e.g. 14:00.',
      };
    }

    const tenant = await this.getTenant(tenantId);
    const tz = tenant.timezone;
    const requested = DateTime.fromISO(args.date, { zone: tz }).startOf('day');
    const today = DateTime.now().setZone(tz).startOf('day');

    if (!requested.isValid)
      return { error: 'invalid_date', message: 'That date is not valid.' };
    if (requested < today)
      return {
        error: 'date_in_past',
        message: 'That date has already passed.',
      };
    if (requested > today.plus({ days: MAX_DAYS_AHEAD })) {
      return {
        error: 'too_far_ahead',
        message: `We only book up to ${MAX_DAYS_AHEAD} days ahead.`,
      };
    }

    // Tenant-scoped lookup: another tenant's service id simply won't be found.
    const service = await this.serviceRepo.findOne({
      where: { id: args.service_id, tenantId, active: true },
    });
    if (!service)
      return {
        error: 'unknown_service',
        message: 'That service does not exist.',
      };

    let all: TimeSlot[];
    try {
      all = await this.availability.getFreeSlots({
        tenantId,
        timezone: tz,
        durationMinutes: service.durationMinutes,
        from: requested.toJSDate(),
        to: requested.plus({ days: SEARCH_DAYS }).endOf('day').toJSDate(),
      });
    } catch (e) {
      if (e instanceof CalendarUnavailableError)
        return CALENDAR_UNAVAILABLE_RESULT;
      throw e;
    }

    // Callers don't care which resource: collapse to unique start times.
    const unique = new Map<number, TimeSlot>();
    for (const s of all)
      if (!unique.has(s.start.getTime())) unique.set(s.start.getTime(), s);

    const byDay = new Map<string, DateTime[]>();
    [...unique.values()]
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .forEach((s) => {
        const dt = DateTime.fromJSDate(s.start, { zone: tz });
        const key = dt.toISODate()!;
        byDay.set(key, [...(byDay.get(key) ?? []), dt]);
      });

    const toSlot = (dt: DateTime) => ({
      start: dt.toISO()!, // includes UTC offset; pass back unchanged to book_appointment
      label: dt.toFormat('h:mm a'),
    });
    const dayLabel = (d: DateTime) => d.toFormat('cccc, d LLLL');
    const target = time
      ? requested.set({
          hour: Number(time.slice(0, 2)),
          minute: Number(time.slice(3, 5)),
        })
      : null;

    const onDay = byDay.get(requested.toISODate()!) ?? [];
    if (onDay.length) {
      const exact = target
        ? onDay.find((d) => d.toMillis() === target.toMillis())
        : undefined;
      return {
        service: service.name,
        duration_minutes: service.durationMinutes,
        date: requested.toISODate(),
        day_label: dayLabel(requested),
        requested_date_available: true,
        ...(target && {
          requested_time: target.toFormat('h:mm a'),
          requested_time_available: !!exact,
          // Available: book this exact start. Not available: offer these instead.
          ...(exact
            ? { start: exact.toISO() }
            : {
                nearest: nearestSlots(onDay, target, NEAREST_COUNT).map(toSlot),
              }),
        }),
        // Start-time windows, for "what times do you have?" answers.
        free_ranges: freeRanges(onDay, SLOT_STEP_MINUTES),
        // Every free start time that day, so follow-ups ("what about 2:15?")
        // can be answered and booked without calling this tool again.
        slots: onDay.map(toSlot),
      };
    }

    const alternatives = [...byDay.entries()]
      .filter(([day]) => day !== requested.toISODate())
      .slice(0, ALT_DAYS)
      .map(([day, dts]) => {
        const d = DateTime.fromISO(day, { zone: tz });
        const sameTime = target
          ? d.set({ hour: target.hour, minute: target.minute })
          : null;
        return {
          date: day,
          day_label: dayLabel(d),
          free_ranges: freeRanges(dts, SLOT_STEP_MINUTES),
          suggested: (sameTime
            ? nearestSlots(dts, sameTime, ALT_SUGGESTIONS)
            : pickSpread(dts, ALT_SUGGESTIONS)
          ).map(toSlot),
        };
      });

    return {
      service: service.name,
      duration_minutes: service.durationMinutes,
      date: requested.toISODate(),
      day_label: dayLabel(requested),
      requested_date_available: false,
      alternatives,
      message: alternatives.length
        ? undefined
        : `Nothing available in the next ${SEARCH_DAYS} days.`,
    };
  }
}
