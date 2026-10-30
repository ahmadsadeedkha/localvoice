import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';
import {
  CALENDAR_SYNC_QUEUE,
  SWEEP_EVERY_MS,
  SWEEP_PENDING_JOB,
} from './calendar-sync.constants';

/** Same pattern as MaintenanceScheduler: idempotent, and never blocks boot. */
@Injectable()
export class CalendarSyncScheduler implements OnModuleInit {
  private readonly log = new Logger(CalendarSyncScheduler.name);

  constructor(
    @InjectQueue(CALENDAR_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    void this.queue
      .upsertJobScheduler(
        SWEEP_PENDING_JOB,
        { every: SWEEP_EVERY_MS },
        {
          name: SWEEP_PENDING_JOB,
          opts: { removeOnComplete: 20, removeOnFail: 100 },
        },
      )
      .catch((e: unknown) =>
        this.log.error(`Could not schedule ${SWEEP_PENDING_JOB}: ${String(e)}`),
      );
  }
}
