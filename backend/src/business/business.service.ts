import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  type CreateServiceInput,
  type HoursInput,
  type UpdateServiceInput,
} from './business.schemas';

export type AppointmentView = 'upcoming' | 'past';

/** held / expired bookings are tentative holds, never shown to the business. */
const VISIBLE = `('confirmed', 'completed', 'cancelled', 'no_show')`;
const IS_UPCOMING = `(b.status = 'confirmed' AND b.ends_at >= now())`;

const APPOINTMENT_LIMIT = 100;

@Injectable()
export class BusinessService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async timezoneOf(tenantId: string): Promise<string> {
    const rows = await this.ds.query(
      `SELECT timezone FROM tenants WHERE id = $1::uuid`,
      [tenantId],
    );
    return rows[0]?.timezone ?? 'UTC';
  }

  async appointments(tenantId: string, view: AppointmentView) {
    const [rows, counts, timezone] = await Promise.all([
      this.ds.query(
        `SELECT b.id, b.call_id, b.starts_at, b.ends_at, b.status,
                b.customer_name, b.customer_phone, b.notes,
                s.name AS service_name, r.name AS resource_name
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN resources r ON r.id = b.resource_id
         WHERE b.tenant_id = $1::uuid
           AND b.status IN ${VISIBLE}
           AND ${view === 'upcoming' ? '' : 'NOT'} ${IS_UPCOMING}
         ORDER BY b.starts_at ${view === 'upcoming' ? 'ASC' : 'DESC'}
         LIMIT ${APPOINTMENT_LIMIT}`,
        [tenantId],
      ),
      this.ds.query(
        `SELECT
           count(*) FILTER (WHERE ${IS_UPCOMING})::int AS upcoming,
           count(*) FILTER (WHERE NOT ${IS_UPCOMING})::int AS past
         FROM bookings b
         WHERE b.tenant_id = $1::uuid AND b.status IN ${VISIBLE}`,
        [tenantId],
      ),
      this.timezoneOf(tenantId),
    ]);

    return {
      timezone,
      counts: {
        upcoming: counts[0].upcoming as number,
        past: counts[0].past as number,
      },
      items: rows.map((r: any) => ({
        id: r.id,
        callId: r.call_id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        status: r.status,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        notes: r.notes,
        serviceName: r.service_name,
        resourceName: r.resource_name,
      })),
    };
  }

  async services(tenantId: string) {
    const [services, hours, timezone] = await Promise.all([
      this.ds.query(
        `SELECT id, name, description, duration_minutes, active
         FROM services WHERE tenant_id = $1::uuid
         ORDER BY active DESC, name`,
        [tenantId],
      ),
      this.ds.query(
        `SELECT day_of_week, open_time, close_time
         FROM business_hours WHERE tenant_id = $1::uuid
         ORDER BY day_of_week, open_time`,
        [tenantId],
      ),
      this.timezoneOf(tenantId),
    ]);

    return {
      timezone,
      services: services.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMinutes: s.duration_minutes,
        active: s.active,
      })),
      hours: hours.map((h: any) => ({
        dayOfWeek: h.day_of_week as number,
        openTime: h.open_time as string,
        closeTime: h.close_time as string,
      })),
    };
  }

  private toService(s: any) {
    return {
      id: s.id as string,
      name: s.name as string,
      description: s.description as string | null,
      durationMinutes: s.duration_minutes as number,
      active: s.active as boolean,
    };
  }

  /**
   * The voice agent offers services by name, so two services that differ only
   * by case would be ambiguous on a call. Names are unique per business.
   */
  private async assertNameFree(
    tenantId: string,
    name: string,
    exceptId: string | null,
  ) {
    const rows = await this.ds.query(
      `SELECT 1 FROM services
       WHERE tenant_id = $1::uuid AND lower(name) = lower($2)
         AND ($3::uuid IS NULL OR id <> $3::uuid)
       LIMIT 1`,
      [tenantId, name, exceptId],
    );
    if (rows.length) {
      throw new ConflictException('A service with this name already exists');
    }
  }

  async createService(tenantId: string, input: CreateServiceInput) {
    await this.assertNameFree(tenantId, input.name, null);
    const rows = await this.ds.query(
      `INSERT INTO services (tenant_id, name, description, duration_minutes)
       VALUES ($1::uuid, $2, $3, $4)
       RETURNING id, name, description, duration_minutes, active`,
      [tenantId, input.name, input.description || null, input.durationMinutes],
    );
    return this.toService(rows[0]);
  }

  async updateService(
    tenantId: string,
    serviceId: string,
    input: UpdateServiceInput,
  ) {
    const existing = await this.ds.query(
      `SELECT id, name, description, duration_minutes, active
       FROM services WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [serviceId, tenantId],
    );
    if (!existing.length) throw new NotFoundException();
    const cur = this.toService(existing[0]);

    const next = {
      name: input.name ?? cur.name,
      description:
        input.description === undefined
          ? cur.description
          : input.description || null,
      durationMinutes: input.durationMinutes ?? cur.durationMinutes,
      active: input.active ?? cur.active,
    };
    if (next.name.toLowerCase() !== cur.name.toLowerCase()) {
      await this.assertNameFree(tenantId, next.name, serviceId);
    }

    const rows = await this.ds.query(
      `UPDATE services
       SET name = $3, description = $4, duration_minutes = $5, active = $6,
           updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING id, name, description, duration_minutes, active`,
      [
        serviceId,
        tenantId,
        next.name,
        next.description,
        next.durationMinutes,
        next.active,
      ],
    );
    return this.toService(rows[0]);
  }

  /**
   * Replaces the whole weekly schedule atomically: either every row is
   * written or the previous hours stay exactly as they were.
   */
  async setHours(tenantId: string, input: HoursInput) {
    await this.ds.transaction(async (tx) => {
      await tx.query(`DELETE FROM business_hours WHERE tenant_id = $1::uuid`, [
        tenantId,
      ]);
      for (const h of input.hours) {
        await tx.query(
          `INSERT INTO business_hours (tenant_id, day_of_week, open_time, close_time)
           VALUES ($1::uuid, $2, $3::time, $4::time)`,
          [tenantId, h.dayOfWeek, h.openTime, h.closeTime],
        );
      }
    });
    return { hours: input.hours };
  }
}
