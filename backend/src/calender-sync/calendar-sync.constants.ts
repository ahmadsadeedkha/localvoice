export const CALENDAR_SYNC_QUEUE = 'calendar-sync';
export const CREATE_EVENT_JOB = 'create-event';
export const SWEEP_PENDING_JOB = 'sweep-pending';
export const SWEEP_EVERY_MS = 5 * 60_000;

export interface CreateEventJobData {
  tenantId: string;
  bookingId: string;
}

/** One job per booking: BullMQ ignores a second add with the same jobId. (Ids can't contain ':'.) */
export const createEventJobId = (bookingId: string) =>
  `create-event-${bookingId}`;

export const CREATE_EVENT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 30_000 }, // 30s, 1m, 2m, 4m
  removeOnComplete: 100,
  removeOnFail: 500,
};
