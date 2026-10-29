import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { type Job } from 'bullmq';
import { HoldExpiryService } from '../booking/hold-expiry.service';
import { EXPIRE_HOLDS_JOB, MAINTENANCE_QUEUE } from './maintenance.constants';

/** Runs in-process with the API for now; can move to its own process unchanged. */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly log = new Logger(MaintenanceProcessor.name);

  constructor(private readonly holds: HoldExpiryService) {
    super();
  }

  async process(job: Job): Promise<{ expired: number }> {
    switch (job.name) {
      case EXPIRE_HOLDS_JOB: {
        const expired = await this.holds.expireStaleHolds();
        if (expired > 0)
          this.log.log(`Expired ${expired} stale booking hold(s)`);
        return { expired };
      }
      default:
        // Throwing marks the job failed, so a typo'd job name is visible, not silent.
        throw new Error(`Unknown maintenance job: ${job.name}`);
    }
  }
}
