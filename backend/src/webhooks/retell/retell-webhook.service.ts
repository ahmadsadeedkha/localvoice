import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Call } from '../../database/entities/call.entity';
import { Tenant } from '../../tenants/tenant.entity';
import {
  WebhookEvent,
  WebhookEventStatus,
  WebhookProvider,
} from '../webhook-event.entity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RetellWebhookService {
  private readonly logger = new Logger(RetellWebhookService.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly events: Repository<WebhookEvent>,
    @InjectRepository(Call) private readonly calls: Repository<Call>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  async ingest(event: string, call: any): Promise<void> {
    const callId: string | undefined = call?.call_id;
    if (!callId) {
      this.logger.warn(`Retell ${event} without call_id, ignoring`);
      return;
    }

    // 1. Idempotency: the unique (provider, external_event_id) index makes a retry a no-op.
    const externalEventId = `${event}:${callId}`;
    const inserted = await this.events
      .createQueryBuilder()
      .insert()
      .values({
        provider: WebhookProvider.Retell,
        externalEventId,
        eventType: event,
        payload: { event, call },
      })
      .orIgnore()
      .returning('id')
      .execute();

    const row = await this.events.findOneByOrFail({
      provider: WebhookProvider.Retell,
      externalEventId,
    });

    if (
      inserted.raw.length === 0 &&
      row.status === WebhookEventStatus.Processed
    ) {
      this.logger.log(`Retell ${externalEventId} already processed, skipping`);
      return;
    }

    // 2. Process. Failures are recorded on the row, then rethrown so Retell retries.
    try {
      const tenantId = await this.resolveTenantId(call);
      if (!tenantId) {
        // Not transient, so don't make Retell retry; keep the row for inspection.
        await this.markFailed(row.id, 'tenant not resolved');
        this.logger.warn(`Retell ${externalEventId}: tenant not resolved`);
        return;
      }

      const values = this.buildCallValues(event, call, tenantId);
      if (!values) {
        await this.markProcessed(row.id, tenantId);
        this.logger.debug(`Retell ${event}: nothing to store`);
        return;
      }

      await this.calls.upsert(values, ['retellCallId']);
      await this.markProcessed(row.id, tenantId);
    } catch (err) {
      await this.markFailed(row.id, (err as Error).message);
      throw err;
    }
  }

  /** Each event sets only its own columns, so arrival order doesn't matter. */
  private buildCallValues(
    event: string,
    call: any,
    tenantId: string,
  ): QueryDeepPartialEntity<Call> | null {
    const base: QueryDeepPartialEntity<Call> = {
      retellCallId: call.call_id,
      tenantId,
      source: call.call_type === 'phone_call' ? 'phone' : 'web_test',
    };
    const ts = (ms?: number) =>
      typeof ms === 'number' ? new Date(ms) : undefined;

    switch (event) {
      case 'call_started':
        return {
          ...base,
          fromNumber: call.from_number ?? null,
          toNumber: call.to_number ?? null,
          startedAt: ts(call.start_timestamp),
        };

      case 'call_ended':
        return {
          ...base,
          status: 'ended',
          startedAt: ts(call.start_timestamp),
          endedAt: ts(call.end_timestamp) ?? new Date(),
          durationMs: call.duration_ms ?? null,
          disconnectionReason: call.disconnection_reason ?? null,
          transcript: call.transcript ?? null,
        };

      case 'call_analyzed': {
        const a = call.call_analysis ?? {};
        return {
          ...base,
          summary: a.call_summary ?? null,
          sentiment: a.user_sentiment ?? null,
          callSuccessful: a.call_successful ?? null,
          analysis: a,
        };
      }

      default:
        return null;
    }
  }

  /** metadata.tenant_id, then agent id, then dialed number. Null if none match. */
  private async resolveTenantId(call: any): Promise<string | null> {
    const metaId = call.metadata?.tenant_id;
    if (typeof metaId === 'string' && UUID_RE.test(metaId)) {
      const t = await this.tenants.findOne({
        where: { id: metaId },
        select: { id: true },
      });
      if (t) return t.id;
    }

    if (call.agent_id) {
      const byAgent = await this.tenants.find({
        where: { retellAgentId: call.agent_id },
        select: { id: true },
        take: 2,
      });
      if (byAgent.length === 1) return byAgent[0].id;
      if (byAgent.length > 1)
        this.logger.warn(`agent ${call.agent_id} maps to several tenants`);
    }

    if (call.to_number) {
      const byNumber = await this.tenants.findOne({
        where: { twilioNumber: call.to_number },
        select: { id: true },
      });
      if (byNumber) return byNumber.id;
    }
    return null;
  }

  private markProcessed(id: string, tenantId: string) {
    return this.events.update(id, {
      status: WebhookEventStatus.Processed,
      tenantId,
      processedAt: new Date(),
      error: null,
    });
  }

  private markFailed(id: string, error: string) {
    return this.events.update(id, { status: WebhookEventStatus.Failed, error });
  }
}
