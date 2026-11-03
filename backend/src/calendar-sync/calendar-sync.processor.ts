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
  CANCEL_EVENT_JOB,
  CREATE_EVENT_JOB,
  CREATE_EVENT_JOB_OPTS,
  type CreateEventJobData,
  SWEEP_PENDING_JOB,
  UPDATE_EVENT_JOB,
  updateEventJobId,
} from './calendar-sync.constants';
import { CalendarSyncService } from './calendar-sync.service';

/** All sync jobs carry the same payload. */
type SyncJobData = CreateEventJobData;

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
    const { tenantId, bookingId } = (job.data ?? {}) as SyncJobData;
    switch (job.name) {
      case CREATE_EVENT_JOB:
        return this.sync.createEvent(tenantId, bookingId);
      case UPDATE_EVENT_JOB:
        return this.sync.updateEvent(tenantId, bookingId);
      case CANCEL_EVENT_JOB:
        return this.sync.cancelEvent(tenantId, bookingId);
      case SWEEP_PENDING_JOB: {
        const unsynced = await this.sync.findUnsynced();
        for (const data of unsynced) {
          // update-event handles both cases: no event yet (creates it) or an
          // event at an old time (moves it). Fresh id, so it's never deduped
          // against an older completed job for the same booking.
          await this.queue.add(UPDATE_EVENT_JOB, data, {
            ...CREATE_EVENT_JOB_OPTS,
            jobId: updateEventJobId(data.bookingId),
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

  /** Act only when BullMQ has given up, not on every retry. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, err: Error) {
    if (!job || job.name === SWEEP_PENDING_JOB) return;
    const gaveUp =
      err instanceof UnrecoverableError ||
      job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!gaveUp) return;

    const { tenantId, bookingId } = job.data as SyncJobData;
    if (job.name === CANCEL_EVENT_JOB) {
      // The booking is cancelled either way; only the Google event is left behind.
      this.log.error(
        `Could not remove Google event for cancelled booking ${bookingId}: ${err.message}`,
      );
      return;
    }
    await this.sync
      .markFailed(tenantId, bookingId, err.message)
      .catch((e: unknown) =>
        this.log.error(
          `Could not mark booking ${bookingId} failed: ${String(e)}`,
        ),
      );
  }
}
