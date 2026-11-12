import { BillingSchedulerService } from './billing-scheduler.service';

it('checks short-term invoice reminders hourly using the existing scheduler ID', async () => {
  const queue = { upsertJobScheduler: jest.fn() };
  await new BillingSchedulerService(queue as any).onModuleInit();
  expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
    'daily-invoice-checks',
    {
      pattern: '0 * * * *',
      tz: 'UTC',
    },
    expect.objectContaining({ name: 'daily-invoice-checks' }),
  );
});
