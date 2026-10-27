import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ABANDONED_MAX_MS,
  CallsQueryService,
} from '../calls/calls-query.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly calls: CallsQueryService,
  ) {}

  /**
   * "Today" is the start of the day in the TENANT's timezone, not the server's.
   * date_trunc on the local wall-clock time, then converted back to timestamptz.
   */
  async summary(tenantId: string) {
    const [stats, recent] = await Promise.all([
      this.ds.query(
        `WITH b AS (
           SELECT
             (date_trunc('day', now() AT TIME ZONE t.timezone) AT TIME ZONE t.timezone)
               AS today_start,
             ((date_trunc('day', now() AT TIME ZONE t.timezone) - interval '1 day')
               AT TIME ZONE t.timezone) AS yesterday_start,
             t.timezone
           FROM tenants t WHERE t.id = $1::uuid
         )
         SELECT
           (SELECT timezone FROM b) AS timezone,
           (SELECT count(*) FROM calls c, b
             WHERE c.tenant_id = $1::uuid AND c.started_at >= b.today_start)::int
             AS calls_today,
           (SELECT count(*) FROM calls c, b
             WHERE c.tenant_id = $1::uuid
               AND c.started_at >= b.yesterday_start
               AND c.started_at < b.today_start)::int AS calls_yesterday,
           (SELECT count(*) FROM calls c, b
             WHERE c.tenant_id = $1::uuid AND c.started_at >= b.today_start
               AND c.status = 'ended'
               AND coalesce(c.duration_ms, 0) < ${ABANDONED_MAX_MS})::int
             AS missed_today,
           (SELECT round(avg(c.duration_ms))::int FROM calls c, b
             WHERE c.tenant_id = $1::uuid AND c.started_at >= b.today_start
               AND c.duration_ms IS NOT NULL) AS avg_duration_ms,
           (SELECT count(*) FROM bookings k, b
             WHERE k.tenant_id = $1::uuid AND k.created_at >= b.today_start
               AND k.status IN ('confirmed', 'completed'))::int AS bookings_today`,
        [tenantId],
      ),
      this.calls.list(tenantId, 5, 0),
    ]);

    const s = stats[0];
    return {
      timezone: (s.timezone as string | null) ?? 'UTC',
      callsToday: s.calls_today as number,
      callsYesterday: s.calls_yesterday as number,
      missedToday: s.missed_today as number,
      avgDurationMs: s.avg_duration_ms as number | null,
      bookingsToday: s.bookings_today as number,
      recentCalls: recent.items,
    };
  }
}
