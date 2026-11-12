import { GoogleAvailabilityProvider } from './google-availability.provider';
import { GoogleCalendarService } from '../integrations/google/google-calendar.service';
import {
  CalendarUnavailableError,
  FreeSlotQuery,
  TimeSlot,
} from './availability.provider';

const at = (time: string) => new Date(`2030-01-01T${time}:00Z`);
const slot = (start: string, end: string): TimeSlot => ({
  start: at(start),
  end: at(end),
  resourceId: 'resource-1',
});
const query: FreeSlotQuery = {
  tenantId: 'tenant-1',
  timezone: 'UTC',
  durationMinutes: 30,
  from: at('00:00'),
  to: at('23:59'),
  excludeBookingId: 'booking-1',
};
const event = (id: string, start: string, end: string) => ({
  id,
  start: { dateTime: at(start).toISOString() },
  end: { dateTime: at(end).toISOString() },
});

function setup() {
  const state: { connection: { status: string; calendarId: string } | null } = {
    connection: { status: 'active', calendarId: 'calendar-1' },
  };
  const connections = {
    findOne: jest.fn().mockImplementation(async () => state.connection),
    update: jest
      .fn()
      .mockImplementation(async (_where, patch) =>
        Object.assign(state.connection!, patch),
      ),
  };
  const google = new GoogleCalendarService({} as any, connections as any);
  const list = jest
    .fn()
    .mockResolvedValue({ data: { items: [], timeZone: 'UTC' } });
  const freebusy = jest
    .fn()
    .mockResolvedValue({ data: { calendars: { 'calendar-1': { busy: [] } } } });
  const calendarApi = jest.spyOn(google, 'calendarApi').mockResolvedValue({
    events: { list },
    freebusy: { query: freebusy },
  } as any);
  const db = {
    getFreeSlots: jest
      .fn()
      .mockResolvedValue([slot('10:00', '10:30'), slot('10:30', '11:00')]),
  };
  const bookings = {
    findOne: jest.fn().mockResolvedValue({ calendarEventId: 'own-event' }),
  };
  const provider = new GoogleAvailabilityProvider(
    db as any,
    google,
    bookings as any,
  );
  return {
    state,
    connections,
    google,
    calendarApi,
    list,
    freebusy,
    db,
    bookings,
    provider,
  };
}

describe('Google availability connection state', () => {
  it('uses database availability for tenants without a connection (including explicit disconnect)', async () => {
    const s = setup();
    s.state.connection = null;
    await expect(s.provider.getFreeSlots(query)).resolves.toEqual(
      await s.db.getFreeSlots(),
    );
    expect(s.calendarApi).not.toHaveBeenCalled();
  });

  it('fails closed on every request after an invalid refresh token revokes access', async () => {
    const s = setup();
    s.list.mockRejectedValueOnce({
      response: { data: { error: 'invalid_grant' } },
    });
    await expect(s.provider.getFreeSlots(query)).rejects.toBeInstanceOf(
      CalendarUnavailableError,
    );
    expect(s.state.connection?.status).toBe('revoked');
    await expect(s.provider.getFreeSlots(query)).rejects.toBeInstanceOf(
      CalendarUnavailableError,
    );
    expect(s.list).toHaveBeenCalledTimes(1);
    // Reconnection makes the existing calendar usable again.
    s.state.connection!.status = 'active';
    await expect(s.provider.getFreeSlots(query)).resolves.toHaveLength(2);
  });

  it('blocks revoked connections even when the database has no available slots', async () => {
    const s = setup();
    s.state.connection!.status = 'revoked';
    s.db.getFreeSlots.mockResolvedValue([]);
    await expect(s.provider.getFreeSlots(query)).rejects.toBeInstanceOf(
      CalendarUnavailableError,
    );
  });
});

describe('Google availability when rescheduling', () => {
  it('excludes only our event while preserving an overlapping event on a later page', async () => {
    const s = setup();
    s.list.mockResolvedValueOnce({
      data: {
        items: [event('own-event', '10:00', '11:00')],
        nextPageToken: 'page-2',
      },
    });
    s.list.mockResolvedValueOnce({
      data: { items: [event('another-event', '10:30', '11:00')] },
    });
    await expect(s.provider.getFreeSlots(query)).resolves.toEqual([
      slot('10:00', '10:30'),
    ]);
    expect(s.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageToken: 'page-2', singleEvents: true }),
      expect.anything(),
    );
    expect(s.freebusy).not.toHaveBeenCalled();
    expect(s.bookings.findOne).toHaveBeenCalledWith({
      where: { id: 'booking-1', tenantId: 'tenant-1' },
    });
  });

  it('excludes our event by ID even when it was moved directly in Google', async () => {
    const s = setup();
    s.list.mockResolvedValue({
      data: { items: [event('own-event', '10:30', '11:00')] },
    });
    await expect(s.provider.getFreeSlots(query)).resolves.toHaveLength(2);
  });

  it('preserves busy recurring instances and ignores transparent/cancelled events', async () => {
    const s = setup();
    s.list.mockResolvedValue({
      data: {
        items: [
          {
            ...event('recurring-instance', '10:00', '10:30'),
            recurringEventId: 'series-id',
          },
          {
            ...event('free-event', '10:30', '11:00'),
            transparency: 'transparent',
          },
          { ...event('deleted-event', '10:30', '11:00'), status: 'cancelled' },
        ],
      },
    });
    await expect(s.provider.getFreeSlots(query)).resolves.toEqual([
      slot('10:30', '11:00'),
    ]);
    expect(s.list).toHaveBeenCalledWith(
      expect.objectContaining({ singleEvents: true, showDeleted: false }),
      expect.anything(),
    );
  });

  it('interprets all-day boundaries in the calendar timezone with an exclusive end date', async () => {
    const s = setup();
    s.db.getFreeSlots.mockResolvedValue([
      slot('04:30', '05:00'),
      slot('05:00', '05:30'),
      slot('10:00', '10:30'),
    ]);
    s.list.mockResolvedValue({
      data: {
        timeZone: 'America/New_York',
        items: [
          {
            id: 'all-day',
            start: { date: '2030-01-01' },
            end: { date: '2030-01-02' },
          },
        ],
      },
    });
    await expect(s.provider.getFreeSlots(query)).resolves.toEqual([
      slot('04:30', '05:00'),
    ]);
  });

  it('fails closed if fetching a later page fails', async () => {
    const s = setup();
    s.list.mockResolvedValueOnce({
      data: { items: [], nextPageToken: 'page-2' },
    });
    s.list.mockRejectedValueOnce(new Error('Google unavailable'));
    await expect(s.provider.getFreeSlots(query)).rejects.toBeInstanceOf(
      CalendarUnavailableError,
    );
  });

  it('fails closed rather than ignoring malformed busy events', async () => {
    const s = setup();
    s.list.mockResolvedValue({ data: { items: [{ id: 'bad-event' }] } });
    await expect(s.provider.getFreeSlots(query)).rejects.toBeInstanceOf(
      CalendarUnavailableError,
    );
  });

  it('keeps ordinary availability on free/busy without excluding any intervals', async () => {
    const s = setup();
    s.freebusy.mockResolvedValue({
      data: {
        calendars: {
          'calendar-1': {
            busy: [
              {
                start: at('10:30').toISOString(),
                end: at('11:00').toISOString(),
              },
            ],
          },
        },
      },
    });
    await expect(
      s.provider.getFreeSlots({ ...query, excludeBookingId: undefined }),
    ).resolves.toEqual([slot('10:00', '10:30')]);
    expect(s.list).not.toHaveBeenCalled();
  });
});
