export type BookingStatus =
  | 'held'
  | 'confirmed'
  | 'expired'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type CalendarSyncStatus = 'pending' | 'synced' | 'failed';

// Legal transitions only. BookingService.transition() should be the single place that reads this.
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  held: ['confirmed', 'expired', 'cancelled'],
  confirmed: ['cancelled', 'completed', 'no_show'],
  expired: [],
  cancelled: [],
  completed: [],
  no_show: [],
};

export const ACTIVE_STATUSES: BookingStatus[] = ['held', 'confirmed'];
