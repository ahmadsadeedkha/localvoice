import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const jobOpts = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 60_000 },
  removeOnComplete: true,
  removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
};

@Injectable()
export class BillingSchedulerService implements OnModuleInit {
  constructor(@InjectQueue('billing-jobs') private readonly queue: Queue) {}

  // upsert = safe to run on every boot, schedules are never duplicated
  async onModuleInit() {
    await this.queue.removeJobScheduler('daily-invoice-checks');
    await this.queue.upsertJobScheduler(
      'monthly-invoices',
      { pattern: '0 2 1 * *', tz: 'UTC' },
      { name: 'generate-monthly-invoices', opts: jobOpts },
    );
    await this.queue.upsertJobScheduler(
      'invoice-checks',
      // Hourly checks give one-day terms time to receive a reminder before due.
      { pattern: '0 * * * *', tz: 'UTC' },
      { name: 'invoice-checks', opts: jobOpts },
    );
  }
}
