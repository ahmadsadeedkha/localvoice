import { RetellWebhookService } from './retell-webhook.service';
import { WebhookEventStatus } from '../webhook-event.entity';
import { RetellEventsProcessor } from '../../billing/retell-events.processor';
import { ConfigService } from '@nestjs/config';

describe('Retell billing integration', () => {
  const tenantId = '12345678-1234-1234-1234-123456789abc';

  function setup() {
    const row = { id: 'event-1', status: WebhookEventStatus.Received };
    const builder: any = {};
    for (const method of ['insert', 'values', 'orIgnore', 'returning']) {
      builder[method] = jest.fn().mockReturnValue(builder);
    }
    builder.execute = jest.fn().mockResolvedValue({ raw: [{ id: row.id }] });
    const events = {
      createQueryBuilder: () => builder,
      findOneByOrFail: jest.fn().mockResolvedValue(row),
      update: jest
        .fn()
        .mockImplementation(async (_key, patch) => Object.assign(row, patch)),
    };
    const calls = { upsert: jest.fn().mockResolvedValue(undefined) };
    const tenants = { findOne: jest.fn().mockResolvedValue({ id: tenantId }) };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new RetellWebhookService(
      events as any,
      calls as any,
      tenants as any,
      queue as any,
    );
    return { row, builder, events, calls, tenants, queue, service };
  }

  it('routes completed calls through the registered ingest path to wallet charging', async () => {
    const s = setup();
    const call = {
      call_id: 'call-1',
      metadata: { tenant_id: tenantId },
      duration_ms: 1000,
      call_cost: { combined_cost: 12.4 },
    };
    await s.service.ingest('call_ended', call);
    expect(s.calls.upsert).toHaveBeenCalled();
    const [name, data, opts] = s.queue.add.mock.calls[0];
    expect(opts.jobId).toBe('retell-event-1');
    const wallets = {
      chargeForCall: jest.fn().mockResolvedValue({ charged: false }),
    };
    const pricing = { getMarginPerMinute: jest.fn().mockResolvedValue(0.1) };
    const processor = new RetellEventsProcessor(
      wallets as any,
      s.tenants as any,
      s.events as any,
      {} as any,
      new ConfigService({ ESTIMATED_COST_PER_MINUTE: 0.15 }),
      pricing as any,
    );
    await processor.process({ name, data } as any);
    expect(wallets.chargeForCall).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        callId: 'call-1',
        credits: 0.13,
        providerCostCents: 12.4,
        marginPerMinute: 0.1,
        durationSeconds: 1,
      }),
    );
    expect(s.events.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ externalEventId: 'call_ended:call-1' }),
      expect.objectContaining({ status: WebhookEventStatus.Processed }),
    );
  });

  it('retries billing enqueue after Redis fails, even though the webhook row already exists', async () => {
    const s = setup();
    const call = { call_id: 'call-1', metadata: { tenant_id: tenantId } };
    s.queue.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(s.service.ingest('call_ended', call)).rejects.toThrow(
      'Redis unavailable',
    );
    expect(s.row.status).toBe(WebhookEventStatus.Failed);
    s.builder.execute.mockResolvedValue({ raw: [] });
    await s.service.ingest('call_ended', call);
    expect(s.queue.add).toHaveBeenCalledTimes(2);
    expect(s.row.status).toBe(WebhookEventStatus.Processed);
    await s.service.ingest('call_ended', call);
    expect(s.queue.add).toHaveBeenCalledTimes(2);
  });

  it('queues analysis for cost backfill without charging again', async () => {
    const s = setup();
    await s.service.ingest('call_analyzed', {
      call_id: 'call-1',
      metadata: { tenant_id: tenantId },
      call_cost: { combined_cost: 12 },
      call_analysis: {
        call_summary: 'Customer booked a visit',
        user_sentiment: 'Positive',
      },
    });
    const [name, data] = s.queue.add.mock.calls[0];
    expect(s.calls.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Customer booked a visit',
        sentiment: 'Positive',
      }),
      ['retellCallId'],
    );
    const wallets = {
      chargeForCall: jest.fn(),
      backfillProviderCost: jest.fn(),
    };
    const processor = new RetellEventsProcessor(
      wallets as any,
      s.tenants as any,
      s.events as any,
      {} as any,
      new ConfigService({ ESTIMATED_COST_PER_MINUTE: 0.15 }),
      { getMarginPerMinute: jest.fn() } as any,
    );
    await processor.process({ name, data } as any);
    expect(wallets.backfillProviderCost).toHaveBeenCalledWith('call-1', 12);
    expect(wallets.chargeForCall).not.toHaveBeenCalled();
  });

    it('estimates and flags the charge when Retell sent no cost', async () => {
      const s = setup();
      await s.service.ingest('call_ended', {
        call_id: 'call-2',
        metadata: { tenant_id: tenantId },
        duration_ms: 60000,
      });
      const [name, data] = s.queue.add.mock.calls[0];
      const wallets = {
        chargeForCall: jest.fn().mockResolvedValue({ charged: false }),
      };
      const processor = new RetellEventsProcessor(
        wallets as any,
        s.tenants as any,
        s.events as any,
        {} as any,
        new ConfigService({ ESTIMATED_COST_PER_MINUTE: 0.15 }),
        { getMarginPerMinute: jest.fn().mockResolvedValue(0.1) } as any,
      );
      await processor.process({ name, data } as any);
      // 15 cents estimated cost + 10 cents margin
      expect(wallets.chargeForCall).toHaveBeenCalledWith(
        expect.objectContaining({
          credits: 0.25,
          providerCostCents: null,
          note: expect.stringContaining('estimated'),
        }),
      );
    });
});
