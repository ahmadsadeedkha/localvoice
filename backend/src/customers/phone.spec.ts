import { likeContains, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['+923001234567', '+923001234567'],
    ['+92 300-1234567', '+923001234567'],
    ['+1 (555) 123-4567', '+15551234567'],
    ['03001234567', '03001234567'],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(['', 'abc', '123', '+', '1234567890123456', '+92+300'])(
    'rejects %j',
    (raw) => {
      expect(normalizePhone(raw)).toBeNull();
    },
  );
});

describe('likeContains', () => {
  it('wraps in wildcards and escapes LIKE metacharacters', () => {
    expect(likeContains('ali')).toBe('%ali%');
    expect(likeContains('50%_off\\')).toBe('%50\\%\\_off\\\\%');
  });
});
