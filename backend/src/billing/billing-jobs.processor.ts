import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InvoicesService } from './invoices.service';

@Processor('billing-jobs')
export class BillingJobsProcessor extends WorkerHost {
  private readonly log = new Logger(BillingJobsProcessor.name);

  constructor(private readonly invoices: InvoicesService) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case 'generate-monthly-invoices': {
        // runs on the 1st: bill the month that just ended
        const now = new Date();
        const periodStart = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
        );
        const result = await this.invoices.generateForPeriod(periodStart);
        this.log.log(
          `Monthly invoices for ${periodStart.toISOString().slice(0, 7)}: ${JSON.stringify(result)}`,
        );
        return result;
      }
      case 'daily-invoice-checks': {
        const result = await this.invoices.runDailyChecks();
        this.log.log(`Daily invoice checks: ${JSON.stringify(result)}`);
        return result;
      }
      default:
        this.log.warn(`Unknown billing job ${job.name}`);
    }
  }
}
