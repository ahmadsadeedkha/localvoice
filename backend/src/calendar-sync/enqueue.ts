import { Logger } from '@nestjs/common';
import { type JobsOptions, type Queue } from 'bullmq';

const ENQUEUE_TIMEOUT_MS = 2000;
const log = new Logger('CalendarSyncEnqueue');

/**
 * Queues a sync job without ever failing or stalling the request that made
 * the change. If Redis is down, the 5-minute sweep picks the booking up later.
 */
export async function enqueueSync(
  queue: Queue,
  name: string,
  data: { tenantId: string; bookingId: string },
  opts: JobsOptions,
): Promise<void> {
  try {
    await Promise.race([
      queue.add(name, data, opts),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('queue add timed out')),
          ENQUEUE_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (e) {
    log.error(
      `Could not queue ${name} for booking ${data.bookingId}: ${String(e)}`,
    );
  }
}
