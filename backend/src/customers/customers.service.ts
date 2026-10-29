import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LIST_COLUMNS, toListItem } from '../calls/calls-query.service';
import { likeContains } from './phone';

const NORM = (col: string) => `regexp_replace(${col}, '[^0-9+]', '', 'g')`;
const VISIBLE = `('confirmed', 'completed', 'cancelled', 'no_show')`;
const DETAIL_LIMIT = 50;

/**
 * There is no customers table: a customer is anyone who has called, booked or
 * left a message, identified by (cleaned) phone number. Web test calls have no
 * number, so they never create a customer.
 */
const PEOPLE_CTE = `
  contacts AS (
    SELECT ${NORM('from_number')} AS phone, started_at AS at,
           'call' AS kind, NULL::text AS name
      FROM calls
      WHERE tenant_id = $1::uuid AND from_number IS NOT NULL
    UNION ALL
    SELECT ${NORM('customer_phone')}, created_at, 'booking', customer_name
      FROM bookings
      WHERE tenant_id = $1::uuid AND customer_phone IS NOT NULL
        AND status IN ${VISIBLE}
    UNION ALL
    SELECT ${NORM('caller_phone')}, created_at, 'message', caller_name
      FROM messages
      WHERE tenant_id = $1::uuid AND caller_phone IS NOT NULL
  ),
  people AS (
    SELECT phone,
           count(*) FILTER (WHERE kind = 'call')::int AS call_count,
           count(*) FILTER (WHERE kind = 'booking')::int AS booking_count,
           max(at) AS last_contact_at,
           (array_agg(name ORDER BY at DESC)
              FILTER (WHERE coalesce(name, '') <> ''))[1] AS name
    FROM contacts
    WHERE phone <> ''
    GROUP BY phone
  )`;

const SEARCH = `($2::text IS NULL
  OR p.name ILIKE $2
  OR ($3::text IS NOT NULL AND p.phone LIKE $3))`;

@Injectable()
export class CustomersService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async timezoneOf(tenantId: string): Promise<string> {
    const rows = await this.ds.query(
      `SELECT timezone FROM tenants WHERE id = $1::uuid`,
      [tenantId],
    );
    return rows[0]?.timezone ?? 'UTC';
  }

  async list(tenantId: string, q: string, limit: number, offset: number) {
    const term = q.trim().slice(0, 100);
    const digits = term.replace(/\D/g, '');
    const namePattern = term ? likeContains(term) : null;
    // Digits-only fragments (3+) also match inside the stored phone number.
    const phonePattern = digits.length >= 3 ? `%${digits}%` : null;

    const [rows, count, timezone] = await Promise.all([
      this.ds.query(
        `WITH ${PEOPLE_CTE}
         SELECT p.phone, p.name, p.call_count, p.booking_count, p.last_contact_at,
                (SELECT min(b.starts_at) FROM bookings b
                  WHERE b.tenant_id = $1::uuid
                    AND ${NORM('b.customer_phone')} = p.phone
                    AND b.status = 'confirmed' AND b.ends_at >= now()
                ) AS next_appointment_at
         FROM people p
         WHERE ${SEARCH}
         ORDER BY p.last_contact_at DESC, p.phone
         LIMIT $4 OFFSET $5`,
        [tenantId, namePattern, phonePattern, limit, offset],
      ),
      this.ds.query(
        `WITH ${PEOPLE_CTE}
         SELECT count(*)::int AS total FROM people p WHERE ${SEARCH}`,
        [tenantId, namePattern, phonePattern],
      ),
      this.timezoneOf(tenantId),
    ]);

    return {
      timezone,
      total: count[0].total as number,
      items: rows.map((r: any) => ({
        phone: r.phone as string,
        name: r.name as string | null,
        callCount: r.call_count as number,
        bookingCount: r.booking_count as number,
        lastContactAt: r.last_contact_at as Date,
        nextAppointmentAt: r.next_appointment_at as Date | null,
      })),
    };
  }

  /** `phone` must already be normalized. Null when this person never contacted the business. */
  async findOne(tenantId: string, phone: string) {
    const [calls, callTotal, bookings, messages, names, next, timezone] =
      await Promise.all([
        this.ds.query(
          `SELECT ${LIST_COLUMNS}
           FROM calls c
           WHERE c.tenant_id = $1::uuid AND ${NORM('c.from_number')} = $2
           ORDER BY c.started_at DESC
           LIMIT ${DETAIL_LIMIT}`,
          [tenantId, phone],
        ),
        this.ds.query(
          `SELECT count(*)::int AS total FROM calls c
           WHERE c.tenant_id = $1::uuid AND ${NORM('c.from_number')} = $2`,
          [tenantId, phone],
        ),
        this.ds.query(
          `SELECT b.id, b.call_id, b.starts_at, b.ends_at, b.status,
                  b.customer_name, b.customer_phone, b.notes,
                  s.name AS service_name, r.name AS resource_name
           FROM bookings b
           JOIN services s ON s.id = b.service_id
           JOIN resources r ON r.id = b.resource_id
           WHERE b.tenant_id = $1::uuid AND ${NORM('b.customer_phone')} = $2
             AND b.status IN ${VISIBLE}
           ORDER BY b.starts_at DESC
           LIMIT ${DETAIL_LIMIT}`,
          [tenantId, phone],
        ),
        this.ds.query(
          `SELECT id, call_id, kind, caller_name, caller_phone, body, status, created_at
           FROM messages
           WHERE tenant_id = $1::uuid AND ${NORM('caller_phone')} = $2
           ORDER BY created_at DESC
           LIMIT ${DETAIL_LIMIT}`,
          [tenantId, phone],
        ),
        this.ds.query(
          `SELECT name FROM (
             SELECT customer_name AS name, created_at AS at FROM bookings
              WHERE tenant_id = $1::uuid AND ${NORM('customer_phone')} = $2
                AND status IN ${VISIBLE}
             UNION ALL
             SELECT caller_name, created_at FROM messages
              WHERE tenant_id = $1::uuid AND ${NORM('caller_phone')} = $2
           ) x
           WHERE coalesce(name, '') <> ''
           ORDER BY at DESC LIMIT 1`,
          [tenantId, phone],
        ),
        this.ds.query(
          `SELECT min(starts_at) AS at FROM bookings
           WHERE tenant_id = $1::uuid AND ${NORM('customer_phone')} = $2
             AND status = 'confirmed' AND ends_at >= now()`,
          [tenantId, phone],
        ),
        this.timezoneOf(tenantId),
      ]);

    if (!calls.length && !bookings.length && !messages.length) return null;

    return {
      timezone,
      phone,
      name: (names[0]?.name as string | undefined) ?? null,
      callCount: callTotal[0].total as number,
      nextAppointmentAt: (next[0]?.at as Date | null) ?? null,
      calls: calls.map(toListItem),
      bookings: bookings.map((r: any) => ({
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
      messages: messages.map((m: any) => ({
        id: m.id,
        callId: m.call_id,
        kind: m.kind,
        callerName: m.caller_name,
        callerPhone: m.caller_phone,
        body: m.body,
        status: m.status,
        createdAt: m.created_at,
      })),
    };
  }
}
