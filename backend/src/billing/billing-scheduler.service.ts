import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const jobOpts = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 60_000 },
  removeOnComplete: true,
};

@Injectable()
export class BillingSchedulerService implements OnModuleInit {
  constructor(@InjectQueue('billing-jobs') private readonly queue: Queue) {}

  // upsert = safe to run on every boot, schedules are never duplicated
  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'monthly-invoices',
      { pattern: '0 2 1 * *', tz: 'UTC' },
      { name: 'generate-monthly-invoices', opts: jobOpts },
    );
    await this.queue.upsertJobScheduler(
      'daily-invoice-checks',
      { pattern: '0 3 * * *', tz: 'UTC' },
      { name: 'daily-invoice-checks', opts: jobOpts },
    );
  }
}
