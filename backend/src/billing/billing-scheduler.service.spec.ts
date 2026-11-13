import { BillingSchedulerService } from './billing-scheduler.service';

it('replaces the old scheduler with bounded hourly invoice checks', async () => {
  const queue = {
    upsertJobScheduler: jest.fn(),
    removeJobScheduler: jest.fn(),
  };
  await new BillingSchedulerService(queue as any).onModuleInit();
  expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
    'invoice-checks',
    {
      pattern: '0 * * * *',
      tz: 'UTC',
    },
    expect.objectContaining({
      name: 'invoice-checks',
      opts: expect.objectContaining({
        removeOnFail: { age: 604800, count: 1000 },
      }),
    }),
  );
  expect(queue.removeJobScheduler).toHaveBeenCalledWith('daily-invoice-checks');
});
