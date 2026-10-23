import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { Booking } from '../database/entities/booking.entity';
import { BusinessHours } from '../database/entities/business-hours.entity';
import { Resource } from '../database/entities/resource.entity';
import { AvailabilityProvider, FreeSlotQuery, TimeSlot } from './availability.provider';

const SLOT_STEP_MINUTES = 30;
const LEAD_TIME_MINUTES = 60; // don't offer slots starting in the next hour

/**
 * "Mock" = no external calendar. Slots come from business_hours minus our own
 * active bookings (confirmed, or held and not yet expired).
 * Week 4: a Google provider additionally subtracts Google busy times.
 */
@Injectable()
export class MockAvailabilityProvider implements AvailabilityProvider {
  constructor(
    @InjectRepository(BusinessHours) private readonly hoursRepo: Repository<BusinessHours>,
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
  ) {}

  async getFreeSlots(q: FreeSlotQuery): Promise<TimeSlot[]> {
    const [hours, resources, busy] = await Promise.all([
      this.hoursRepo.find({ where: { tenantId: q.tenantId } }),
      this.resourceRepo.find({ where: { tenantId: q.tenantId, active: true } }),
      this.bookingRepo
        .createQueryBuilder('b')
        .where('b.tenantId = :tenantId', { tenantId: q.tenantId })
        .andWhere('b.startsAt < :to AND b.endsAt > :from', { from: q.from, to: q.to })
        .andWhere(
          new Brackets((qb) =>
            qb
              .where(`b.status = 'confirmed'`)
              .orWhere(`b.status = 'held' AND b.holdExpiresAt > now()`),
          ),
        )
        .getMany(),
    ]);

    const earliest = DateTime.now().plus({ minutes: LEAD_TIME_MINUTES });
    const slots: TimeSlot[] = [];

    let day = DateTime.fromJSDate(q.from, { zone: q.timezone }).startOf('day');
    const lastDay = DateTime.fromJSDate(q.to, { zone: q.timezone }).startOf('day');

    for (; day <= lastDay; day = day.plus({ days: 1 })) {
      const dow = day.weekday % 7; // luxon: Mon=1..Sun=7 -> our 0=Sun..6=Sat
      for (const h of hours.filter((x) => x.dayOfWeek === dow)) {
        const [oh, om] = h.openTime.split(':').map(Number);
        const [ch, cm] = h.closeTime.split(':').map(Number);
        const open = day.set({ hour: oh, minute: om });
        const close = day.set({ hour: ch, minute: cm });

        for (
          let t = open;
          t.plus({ minutes: q.durationMinutes }) <= close;
          t = t.plus({ minutes: SLOT_STEP_MINUTES })
        ) {
          if (t < earliest) continue;
          const start = t.toJSDate();
          const end = t.plus({ minutes: q.durationMinutes }).toJSDate();

          for (const r of resources) {
            const clash = busy.some(
              (b) => b.resourceId === r.id && start < b.endsAt && end > b.startsAt,
            );
            if (!clash) slots.push({ start, end, resourceId: r.id });
          }
        }
      }
    }
    return slots;
  }
}
