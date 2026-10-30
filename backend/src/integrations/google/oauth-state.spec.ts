import { randomBytes } from 'crypto';
import { createState, verifyState } from './oauth-state';

const key = randomBytes(32);

describe('oauth-state', () => {
  it('round-trips tenant and user', () => {
    const s = verifyState(createState('tenant-1', 'user_1', key), key);
    expect(s).toMatchObject({ tenantId: 'tenant-1', userId: 'user_1' });
  });

  it('rejects a state signed with another key', () => {
    expect(verifyState(createState('t', 'u', randomBytes(32)), key)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const [, sig] = createState('t', 'u', key).split('.');
    const forged = Buffer.from(
      JSON.stringify({
        tenantId: 'other',
        userId: 'u',
        exp: Date.now() + 60_000,
      }),
    ).toString('base64url');
    expect(verifyState(`${forged}.${sig}`, key)).toBeNull();
  });

  it('rejects an expired state', () => {
    jest.useFakeTimers();
    const s = createState('t', 'u', key);
    jest.advanceTimersByTime(11 * 60 * 1000);
    expect(verifyState(s, key)).toBeNull();
    jest.useRealTimers();
  });

  it('rejects garbage', () => {
    expect(verifyState('nope', key)).toBeNull();
    expect(verifyState('', key)).toBeNull();
  });
});
