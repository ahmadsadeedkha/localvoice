import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type CallOutcome =
  'booked' | 'transferred' | 'voicemail' | 'abandoned' | 'info';

/** A finished call shorter than this counts as abandoned (caller hung up early). */
export const ABANDONED_MAX_MS = 10_000;

/**
 * Outcome is derived, not stored: what the agent actually did during the call.
 * Order matters: a call that booked AND took a message counts as booked.
 * Expects the calls table aliased as `c`.
 */
export const OUTCOME_SQL = `
  CASE
    WHEN EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.call_id = c.id AND b.status IN ('confirmed', 'completed')
    ) THEN 'booked'
    WHEN EXISTS (
      SELECT 1 FROM messages m
      WHERE m.call_id = c.id AND m.kind = 'transfer_request'
    ) THEN 'transferred'
    WHEN EXISTS (
      SELECT 1 FROM messages m
      WHERE m.call_id = c.id AND m.kind = 'message'
    ) THEN 'voicemail'
    WHEN c.status = 'ended' AND coalesce(c.duration_ms, 0) < ${ABANDONED_MAX_MS}
      THEN 'abandoned'
    ELSE 'info'
  END`;

export interface CallListItem {
  id: string;
  source: 'web_test' | 'phone';
  fromNumber: string | null;
  toNumber: string | null;
  status: 'in_progress' | 'ended';
  outcome: CallOutcome;
  startedAt: Date;
  durationMs: number | null;
  sentiment: string | null;
  summary: string | null;
}

export interface CallDetail extends CallListItem {
  endedAt: Date | null;
  disconnectionReason: string | null;
  callSuccessful: boolean | null;
  transcript: string | null;
  bookings: {
    id: string;
    serviceName: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    customerName: string | null;
    customerPhone: string | null;
  }[];
  messages: {
    id: string;
    kind: 'message' | 'transfer_request';
    callerName: string | null;
    callerPhone: string | null;
    body: string;
    status: string;
    createdAt: Date;
  }[];
}

const LIST_COLUMNS = `
  c.id, c.source, c.from_number, c.to_number, c.status, c.started_at,
  c.duration_ms, c.sentiment, c.summary,
  ${OUTCOME_SQL} AS outcome`;

const toListItem = (r: any): CallListItem => ({
  id: r.id,
  source: r.source,
  fromNumber: r.from_number,
  toNumber: r.to_number,
  status: r.status,
  outcome: r.outcome,
  startedAt: r.started_at,
  durationMs: r.duration_ms,
  sentiment: r.sentiment,
  summary: r.summary,
});

@Injectable()
export class CallsQueryService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async timezoneOf(tenantId: string): Promise<string> {
    const rows = await this.ds.query(
      `SELECT timezone FROM tenants WHERE id = $1::uuid`,
      [tenantId],
    );
    return rows[0]?.timezone ?? 'UTC';
  }

  async list(tenantId: string, limit: number, offset: number) {
    const [rows, countRows, timezone] = await Promise.all([
      this.ds.query(
        `SELECT ${LIST_COLUMNS}
         FROM calls c
         WHERE c.tenant_id = $1::uuid
         ORDER BY c.started_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      this.ds.query(
        `SELECT count(*)::int AS total FROM calls WHERE tenant_id = $1::uuid`,
        [tenantId],
      ),
      this.timezoneOf(tenantId),
    ]);
    return {
      items: rows.map(toListItem),
      total: countRows[0].total as number,
      timezone,
    };
  }

  /** Tenant-scoped: another tenant's call id simply comes back as null. */
  async findOne(
    tenantId: string,
    callId: string,
  ): Promise<{ call: CallDetail; timezone: string } | null> {
    const rows = await this.ds.query(
      `SELECT ${LIST_COLUMNS},
              c.ended_at, c.disconnection_reason, c.call_successful, c.transcript
       FROM calls c
       WHERE c.id = $1::uuid AND c.tenant_id = $2::uuid`,
      [callId, tenantId],
    );
    if (!rows.length) return null;

    const [bookings, messages, timezone] = await Promise.all([
      this.ds.query(
        `SELECT b.id, s.name AS service_name, b.starts_at, b.ends_at, b.status,
                b.customer_name, b.customer_phone
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         WHERE b.call_id = $1::uuid AND b.tenant_id = $2::uuid
         ORDER BY b.starts_at`,
        [callId, tenantId],
      ),
      this.ds.query(
        `SELECT id, kind, caller_name, caller_phone, body, status, created_at
         FROM messages
         WHERE call_id = $1::uuid AND tenant_id = $2::uuid
         ORDER BY created_at`,
        [callId, tenantId],
      ),
      this.timezoneOf(tenantId),
    ]);

    const r = rows[0];
    return {
      timezone,
      call: {
        ...toListItem(r),
        endedAt: r.ended_at,
        disconnectionReason: r.disconnection_reason,
        callSuccessful: r.call_successful,
        transcript: r.transcript,
        bookings: bookings.map((b: any) => ({
          id: b.id,
          serviceName: b.service_name,
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          status: b.status,
          customerName: b.customer_name,
          customerPhone: b.customer_phone,
        })),
        messages: messages.map((m: any) => ({
          id: m.id,
          kind: m.kind,
          callerName: m.caller_name,
          callerPhone: m.caller_phone,
          body: m.body,
          status: m.status,
          createdAt: m.created_at,
        })),
      },
    };
  }
}
