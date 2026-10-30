import { Logger } from '@nestjs/common';
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { type Job, type Queue, UnrecoverableError } from 'bullmq';
import {
  CALENDAR_SYNC_QUEUE,
  CREATE_EVENT_JOB,
  CREATE_EVENT_JOB_OPTS,
  type CreateEventJobData,
  SWEEP_PENDING_JOB,
  createEventJobId,
} from './calendar-sync.constants';
import { CalendarSyncService } from './calendar-sync.service';

@Processor(CALENDAR_SYNC_QUEUE, { concurrency: 5 })
export class CalendarSyncProcessor extends WorkerHost {
  private readonly log = new Logger(CalendarSyncProcessor.name);

  constructor(
    private readonly sync: CalendarSyncService,
    @InjectQueue(CALENDAR_SYNC_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case CREATE_EVENT_JOB: {
        const { tenantId, bookingId } = job.data as CreateEventJobData;
        return this.sync.createEvent(tenantId, bookingId);
      }
      case SWEEP_PENDING_JOB: {
        const unsynced = await this.sync.findUnsynced();
        for (const data of unsynced) {
          await this.queue.add(CREATE_EVENT_JOB, data, {
            ...CREATE_EVENT_JOB_OPTS,
            jobId: createEventJobId(data.bookingId),
          });
        }
        if (unsynced.length)
          this.log.log(`Re-queued ${unsynced.length} unsynced booking(s)`);
        return { requeued: unsynced.length };
      }
      default:
        throw new Error(`Unknown calendar-sync job: ${job.name}`);
    }
  }

  /** Mark the booking failed only when BullMQ has given up, not on every retry. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, err: Error) {
    if (!job || job.name !== CREATE_EVENT_JOB) return;
    const gaveUp =
      err instanceof UnrecoverableError ||
      job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!gaveUp) return;
    const { tenantId, bookingId } = job.data as CreateEventJobData;
    await this.sync
      .markFailed(tenantId, bookingId, err.message)
      .catch((e: unknown) =>
        this.log.error(
          `Could not mark booking ${bookingId} failed: ${String(e)}`,
        ),
      );
  }
}
