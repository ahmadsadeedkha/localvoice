import { CalendarSyncService } from './calendar-sync.service';
import { Booking } from '../database/entities/booking.entity';

function setup() {
  const row: any = {
    id: '12345678-1234-1234-1234-123456789abc',
    tenantId: 'tenant-1',
    status: 'confirmed',
    calendarSyncStatus: 'pending',
    calendarEventId: null,
    calendarId: null,
    serviceId: 'service-1',
    startsAt: new Date('2030-01-01T10:00:00Z'),
    endsAt: new Date('2030-01-01T11:00:00Z'),
  };
  const repo = {
    findOne: jest.fn().mockImplementation(async () => ({ ...row })),
    update: jest
      .fn()
      .mockImplementation(async (_where, patch) => Object.assign(row, patch)),
  };
  const manager = { getRepository: () => repo };
  let tail = Promise.resolve();
  const ds = {
    getRepository: (entity: unknown) =>
      entity === Booking
        ? repo
        : { findOne: async () => ({ name: 'Service' }) },
    query: async () => [{ timezone: 'UTC' }],
    transaction: (fn: any) => {
      const result = tail.then(() => fn(manager));
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  const insert = jest.fn().mockResolvedValue({});
  const patch = jest.fn().mockResolvedValue({});
  const remove = jest.fn().mockResolvedValue({});
  const google = {
    activeConnection: jest.fn().mockResolvedValue({ calendarId: 'calendar-A' }),
    calendarApi: jest
      .fn()
      .mockResolvedValue({ events: { insert, patch, delete: remove } }),
    call: async (_tenantId: string, fn: any) => fn(),
  };
  const sync = new CalendarSyncService(ds as any, google as any);
  return { row, repo, ds, manager, google, insert, patch, remove, sync };
}

describe('calendar synchronization serialization', () => {
  it('serializes creation and cancellation on the same row lock', async () => {
    const s = setup();
    let inserted!: () => void;
    const started = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    s.insert.mockImplementation(async () => {
      inserted();
      await pending;
    });
    const creation = s.sync.createEvent('tenant-1', s.row.id);
    await started;
    const cancellation = s.ds.transaction(async () => {
      s.row.status = 'cancelled';
      s.row.calendarSyncStatus = 'pending';
    });
    const deletion = s.sync.cancelEvent('tenant-1', s.row.id);
    expect(s.row.status).toBe('confirmed');
    finish();
    await Promise.all([creation, cancellation, deletion]);
    expect(s.remove).toHaveBeenCalledTimes(1);
    expect(s.row).toMatchObject({
      status: 'cancelled',
      calendarSyncStatus: 'synced',
      calendarEventId: null,
    });
    expect(s.repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', id: s.row.id },
        lock: { mode: 'pessimistic_write' },
      }),
    );
  });

  it('writes a later reschedule after the older sync completes', async () => {
    const s = setup();
    await s.sync.createEvent('tenant-1', s.row.id);
    await s.ds.transaction(async () => {
      s.row.startsAt = new Date('2030-01-02T10:00:00Z');
      s.row.endsAt = new Date('2030-01-02T11:00:00Z');
      s.row.calendarSyncStatus = 'pending';
    });
    await s.sync.updateEvent('tenant-1', s.row.id);
    expect(s.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          start: expect.objectContaining({
            dateTime: '2030-01-02T10:00:00.000Z',
          }),
        }),
      }),
      expect.anything(),
    );
  });

  it('uses the original calendar for updates and cancellation after selection changes', async () => {
    const s = setup();
    await s.sync.createEvent('tenant-1', s.row.id);
    s.google.activeConnection.mockResolvedValue({ calendarId: 'calendar-B' });
    await s.sync.updateEvent('tenant-1', s.row.id);
    expect(s.patch).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'calendar-A' }),
      expect.anything(),
    );
    s.row.status = 'cancelled';
    await s.sync.cancelEvent('tenant-1', s.row.id);
    expect(s.remove).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'calendar-A' }),
      expect.anything(),
    );
  });

  it('retains the original destination across an ambiguous insert timeout', async () => {
    const s = setup();
    s.insert.mockRejectedValueOnce(new Error('timeout'));
    await expect(s.sync.createEvent('tenant-1', s.row.id)).rejects.toThrow(
      'timeout',
    );
    expect(s.row.calendarId).toBe('calendar-A');
    s.google.activeConnection.mockResolvedValue({ calendarId: 'calendar-B' });
    await s.sync.createEvent('tenant-1', s.row.id);
    expect(s.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({ calendarId: 'calendar-A' }),
      expect.anything(),
    );
  });

  it('deletes a possibly inserted event even if its event ID was not saved after timeout', async () => {
    const s = setup();
    s.insert.mockRejectedValueOnce(new Error('timeout'));
    await expect(s.sync.createEvent('tenant-1', s.row.id)).rejects.toThrow(
      'timeout',
    );
    s.row.status = 'cancelled';
    await s.sync.cancelEvent('tenant-1', s.row.id);
    expect(s.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'calendar-A',
        eventId: s.row.id.replace(/-/g, ''),
      }),
      expect.anything(),
    );
  });
});
