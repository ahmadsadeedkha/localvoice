import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';
import {
  EXPIRE_HOLDS_EVERY_MS,
  EXPIRE_HOLDS_JOB,
  MAINTENANCE_QUEUE,
} from './maintenance.constants';

/**
 * Registers the recurring jobs. upsertJobScheduler is idempotent, so every
 * deploy and every API instance can call it: there is still one job per tick.
 */
@Injectable()
export class MaintenanceScheduler implements OnModuleInit {
  private readonly log = new Logger(MaintenanceScheduler.name);

  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    // Deliberately not awaited: if Redis is slow or down at boot, the API must
    // still start (and keep taking calls). Scheduling is logged, not fatal.
    void this.queue
      .upsertJobScheduler(
        EXPIRE_HOLDS_JOB,
        { every: EXPIRE_HOLDS_EVERY_MS },
        {
          name: EXPIRE_HOLDS_JOB,
          opts: { removeOnComplete: 20, removeOnFail: 100 },
        },
      )
      .catch((e: unknown) =>
        this.log.error(`Could not schedule ${EXPIRE_HOLDS_JOB}: ${String(e)}`),
      );
  }
}
