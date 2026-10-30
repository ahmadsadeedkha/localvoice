import {
  buildEvent,
  googleEventId,
  isAlreadyExists,
  isPermanentGoogleError,
} from './calendar-event';

const bookingId = '3F2504E0-4F89-11D3-9A0C-0305E82C3301';

describe('googleEventId', () => {
  it('is the booking uuid without dashes, lowercase, and valid for Google', () => {
    const id = googleEventId(bookingId);
    expect(id).toBe('3f2504e04f8911d39a0c0305e82c3301');
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});

describe('buildEvent', () => {
  const base = {
    bookingId,
    serviceName: 'AC Repair',
    customerName: 'Ali Khan',
    customerPhone: '+923001234567',
    notes: null,
    startsAt: new Date('2026-11-02T09:00:00Z'),
    endsAt: new Date('2026-11-02T10:00:00Z'),
    timezone: 'Asia/Karachi',
  };

  it('builds a busy event with the booking id', () => {
    const e = buildEvent(base);
    expect(e.id).toBe(googleEventId(bookingId));
    expect(e.summary).toBe('AC Repair - Ali Khan');
    expect(e.transparency).toBe('opaque');
    expect(e.start).toEqual({
      dateTime: '2026-11-02T09:00:00.000Z',
      timeZone: 'Asia/Karachi',
    });
    expect(e.extendedProperties?.private?.localvoiceBookingId).toBe(bookingId);
    expect(e.description).toContain('Phone: +923001234567');
    expect(e.description).not.toContain('Notes:');
  });

  it('falls back when the name is missing', () => {
    expect(buildEvent({ ...base, customerName: null }).summary).toBe(
      'AC Repair - Caller',
    );
  });
});

describe('error classification', () => {
  it('detects 409 already-exists in the shapes gaxios uses', () => {
    expect(isAlreadyExists({ status: 409 })).toBe(true);
    expect(isAlreadyExists({ response: { status: 409 } })).toBe(true);
    expect(isAlreadyExists({ code: 409 })).toBe(true);
    expect(isAlreadyExists({ status: 500 })).toBe(false);
  });

  it('treats 400/403/404 as permanent, 429/5xx as retryable', () => {
    expect(isPermanentGoogleError({ status: 404 })).toBe(true);
    expect(isPermanentGoogleError({ status: 429 })).toBe(false);
    expect(isPermanentGoogleError({ status: 503 })).toBe(false);
    expect(isPermanentGoogleError(new Error('ECONNRESET'))).toBe(false);
  });
});
