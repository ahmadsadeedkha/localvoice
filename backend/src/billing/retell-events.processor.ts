import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { WalletService } from './wallet.service';
import { Tenant } from '../tenants/tenant.entity';
import {
  WebhookEvent,
  WebhookEventStatus,
  WebhookProvider,
} from '../webhooks/webhook-event.entity';

@Processor('retell-events')
export class RetellEventsProcessor extends WorkerHost {
  constructor(
    private wallets: WalletService,
    @InjectRepository(Tenant) private tenants: Repository<Tenant>,
    @InjectRepository(WebhookEvent) private events: Repository<WebhookEvent>,
    @InjectQueue('notifications') private notifications: Queue,
  ) {
    super();
  }

  async process(job: Job) {
    const { call, tenantId: resolvedTenantId } = job.data;
    const key = {
      provider: WebhookProvider.Retell,
      externalEventId: job.data.externalEventId ?? `${call.call_id}:${job.name}`,
    };
    try {
      let tenantId: string | null = null;
      if (job.name === 'call_ended') tenantId = await this.onCallEnded(call, resolvedTenantId);
      else if (job.name === 'call_analyzed')
        tenantId = await this.onCallAnalyzed(call, resolvedTenantId);

      await this.events.update(key, {
        status: WebhookEventStatus.Processed,
        processedAt: new Date(),
        tenantId,
        error: null,
      });
    } catch (e) {
      await this.events.update(key, {
        status: WebhookEventStatus.Failed,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e; // lets BullMQ retry
    }
  }

  private async resolveTenantId(call: any): Promise<string | null> {
    if (call.metadata?.tenant_id) return call.metadata.tenant_id;
    const byAgent = await this.tenants.findOne({
      where: { retellAgentId: call.agent_id },
      select: { id: true },
    });
    return byAgent?.id ?? null;
  }

  private async onCallEnded(call: any, resolvedTenantId?: string): Promise<string | null> {
    const tenantId = resolvedTenantId ?? await this.resolveTenantId(call);
    if (!tenantId) {
      console.warn('No tenant for call', call.call_id);
      return null;
    }

    const seconds = Math.ceil((call.duration_ms ?? 0) / 1000);
    const credits =
      Math.ceil(seconds / 60) * Number(process.env.CREDITS_PER_MINUTE ?? 1);
    if (credits <= 0) return tenantId; // never connected / zero duration

    const cents =
      call.call_cost?.combined_cost != null
        ? Math.round(call.call_cost.combined_cost)
        : null; // verify unit on a test call

    const r = await this.wallets.chargeForCall({
      tenantId,
      callId: call.call_id,
      credits,
      providerCostCents: cents,
    });
    if (!r.charged) return tenantId;

    if (r.crossedLow) {
      await this.notifications.add('low-balance', {
        tenantId,
        balance: r.after,
      });
    }
    if (r.nowBlocked) {
      await this.notifications.add('balance-exhausted', { tenantId });
    }
    return tenantId;
  }

  private async onCallAnalyzed(call: any, resolvedTenantId?: string): Promise<string | null> {
    const tenantId = resolvedTenantId ?? await this.resolveTenantId(call);
    
    // 1) save summary / sentiment on your calls table (your existing logic)
    // 2) backfill cost only; never charge here
    if (call.call_cost?.combined_cost != null) {
      await this.wallets.backfillProviderCost(
        call.call_id,
        Math.round(call.call_cost.combined_cost),
      );
    }
    return tenantId;
  }
}
