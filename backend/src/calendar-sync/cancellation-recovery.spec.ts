import { AppointmentChangesService } from '../booking/appointment-changes.service';
import { BookingService } from '../booking/booking.service';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarSyncProcessor } from './calendar-sync.processor';
import { CANCEL_EVENT_JOB, SWEEP_PENDING_JOB } from './calendar-sync.constants';

describe('calendar cancellation recovery', () => {
  function setup() {
    const booking = {
      id: 'booking-1',
      tenantId: 'tenant-1',
      status: 'confirmed',
      calendarEventId: 'event-1',
      calendarId: 'primary',
      calendarSyncStatus: 'synced',
      endsAt: new Date(Date.now() + 86_400_000),
    };
    const repo = {
      findOne: jest.fn().mockImplementation(async () => ({ ...booking })),
      update: jest
        .fn()
        .mockImplementation(async (_where, patch) =>
          Object.assign(booking, patch),
        ),
    };
    const manager = {
      getRepository: () => repo,
      findOne: repo.findOne,
      save: jest
        .fn()
        .mockImplementation(async (row) => Object.assign(booking, row)),
    };
    const ds = {
      getRepository: () => repo,
      transaction: async (fn: any) => fn(manager),
      query: jest
        .fn()
        .mockResolvedValue([
          { tenant_id: booking.tenantId, id: booking.id, status: 'cancelled' },
        ]),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const bookings = new BookingService(ds as any, {} as any, queue as any);
    const changes = new AppointmentChangesService(
      ds as any,
      {} as any,
      bookings,
      queue as any,
    );
    const remove = jest.fn().mockResolvedValue(undefined);
    const google = {
      activeConnection: jest.fn().mockResolvedValue({ calendarId: 'primary' }),
      calendarApi: jest.fn().mockResolvedValue({ events: { delete: remove } }),
      call: async (_tenantId: string, fn: any) => fn(),
    };
    const sync = new CalendarSyncService(ds as any, google as any);
    return { booking, repo, ds, queue, changes, sync, remove };
  }

  it('persists deletion intent when enqueue fails, then sweeps and completes it', async () => {
    const s = setup();
    s.queue.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(s.changes.cancel('tenant-1', 'booking-1')).resolves.toEqual({
      cancelled: true,
    });
    expect(s.booking).toMatchObject({
      status: 'cancelled',
      calendarSyncStatus: 'pending',
      calendarEventId: 'event-1',
    });
    const processor = new CalendarSyncProcessor(s.sync, s.queue as any);
    await processor.process({ name: SWEEP_PENDING_JOB, data: {} } as any);
    const [name, data] = s.queue.add.mock.calls[1];
    expect(name).toBe(CANCEL_EVENT_JOB);
    await processor.process({ name, data } as any);
    expect(s.remove).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event-1' }),
      expect.anything(),
    );
    expect(s.booking).toMatchObject({
      status: 'cancelled',
      calendarSyncStatus: 'synced',
      calendarEventId: null,
    });
  });

  it('keeps failed Google deletions pending for recovery after worker retries are exhausted', async () => {
    const s = setup();
    await s.changes.cancel('tenant-1', 'booking-1');
    s.remove.mockRejectedValue(new Error('Google unavailable'));
    await expect(s.sync.cancelEvent('tenant-1', 'booking-1')).rejects.toThrow(
      'Google unavailable',
    );
    await new CalendarSyncProcessor(s.sync, s.queue as any).onFailed(
      {
        name: CANCEL_EVENT_JOB,
        data: { tenantId: 'tenant-1', bookingId: 'booking-1' },
        attemptsMade: 5,
        opts: { attempts: 5 },
      } as any,
      new Error('Google unavailable'),
    );
    expect(s.booking.calendarSyncStatus).toBe('pending');
    expect(s.booking.calendarEventId).toBe('event-1');
  });

  it('treats an already removed Google event as a completed cancellation', async () => {
    const s = setup();
    await s.changes.cancel('tenant-1', 'booking-1');
    s.remove.mockRejectedValue({ code: 404 });
    await expect(s.sync.cancelEvent('tenant-1', 'booking-1')).resolves.toBe(
      'deleted',
    );
    expect(s.booking.calendarSyncStatus).toBe('synced');
  });
});
