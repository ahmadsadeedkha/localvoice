import {
  DEFAULT_TRANSFER_REASON,
  MAX_MESSAGE_LENGTH,
  validateTakeMessage,
  validateTransfer,
} from './messages.validation';

describe('validateTakeMessage', () => {
  it('accepts a message, trims it, and cleans the phone number', () => {
    const r = validateTakeMessage(
      {
        message: '  Please call me back ',
        caller_name: ' Ali ',
        caller_phone: '+92 300-1234567',
      },
      null,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        callerName: 'Ali',
        callerPhone: '+923001234567',
        body: 'Please call me back',
      },
    });
  });

  it('falls back to the caller ID when no number is given', () => {
    const r = validateTakeMessage({ message: 'Hi' }, '+14155550123');
    expect(r).toMatchObject({
      ok: true,
      value: { callerPhone: '+14155550123', callerName: null },
    });
  });

  it('prefers a spoken number over the caller ID', () => {
    const r = validateTakeMessage(
      { message: 'Hi', caller_phone: '0321 1111111' },
      '+14155550123',
    );
    expect(r).toMatchObject({
      ok: true,
      value: { callerPhone: '03211111111' },
    });
  });

  it.each([undefined, null, '', '   ', 42, {}])(
    'rejects a missing message: %j',
    (message) => {
      expect(
        validateTakeMessage({ message, caller_phone: '+14155550123' }, null),
      ).toMatchObject({
        ok: false,
        error: { error: 'missing_message' },
      });
    },
  );

  it('rejects an over-long message', () => {
    const r = validateTakeMessage(
      { message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) },
      '+14155550123',
    );
    expect(r).toMatchObject({
      ok: false,
      error: { error: 'message_too_long' },
    });
  });

  it.each([
    [undefined, null],
    ['abc', null],
    ['123', null],
    ['+', '+'],
  ])(
    'asks for a phone when none is usable (%j, caller id %j)',
    (given, callerId) => {
      expect(
        validateTakeMessage({ message: 'Hi', caller_phone: given }, callerId),
      ).toMatchObject({
        ok: false,
        error: { error: 'missing_phone' },
      });
    },
  );

  it('asks again when a spoken number is unusable, instead of silently using the caller ID', () => {
    // Same rule as book_appointment: the caller tried to give a callback number,
    // so guessing (and possibly calling back the wrong line) is worse than re-asking.
    expect(
      validateTakeMessage(
        { message: 'Hi', caller_phone: 'abc' },
        '+14155550123',
      ),
    ).toMatchObject({ ok: false, error: { error: 'missing_phone' } });
  });
});

describe('validateTransfer', () => {
  it('uses the default reason and caller ID when nothing is given', () => {
    expect(validateTransfer({}, '+14155550123')).toEqual({
      callerName: null,
      callerPhone: '+14155550123',
      reason: DEFAULT_TRANSFER_REASON,
    });
  });

  it('never fails when there is no number at all', () => {
    expect(validateTransfer({ reason: 'Urgent leak' }, null)).toEqual({
      callerName: null,
      callerPhone: null,
      reason: 'Urgent leak',
    });
  });

  it('falls back to the caller ID when the spoken number is invalid', () => {
    expect(
      validateTransfer({ caller_phone: 'nope' }, '+14155550123').callerPhone,
    ).toBe('+14155550123');
  });

  it('truncates a very long reason', () => {
    expect(
      validateTransfer({ reason: 'x'.repeat(900) }, null).reason,
    ).toHaveLength(500);
  });
});
