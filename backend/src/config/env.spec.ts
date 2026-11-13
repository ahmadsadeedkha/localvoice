import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://localhost/localvoice',
  REDIS_URL: 'redis://localhost:6379',
  PUBLIC_BASE_URL: 'https://example.com',
  RETELL_API_KEY: 'test',
  RETELL_AGENT_ID: 'agent',
  CLERK_PUBLISHABLE_KEY: 'test',
  CLERK_SECRET_KEY: 'test',
};

it('validates optional call controls before they can enable production routes', () => {
  expect(validateEnv(base).ENABLE_DEV_CALLS).toBe('false');
  expect(
    validateEnv({
      ...base,
      ENABLE_DEV_CALLS: 'true',
      BLOCKED_FALLBACK_AGENT_ID: 'agent-1',
    }),
  ).toMatchObject({
    ENABLE_DEV_CALLS: 'true',
    BLOCKED_FALLBACK_AGENT_ID: 'agent-1',
  });
  expect(() => validateEnv({ ...base, ENABLE_DEV_CALLS: 'yes' })).toThrow();
  expect(() =>
    validateEnv({ ...base, BLOCKED_FALLBACK_AGENT_ID: '' }),
  ).toThrow();
});

it('supplies numeric billing defaults and parses configured rates', () => {
  expect(validateEnv(base)).toMatchObject({
    CREDITS_PER_MINUTE: 1,
    MIN_CALL_MINUTES: 2,
    MAX_CALL_MINUTES: 30,
  });
  expect(
    validateEnv({
      ...base,
      CREDITS_PER_MINUTE: '2.50',
      MIN_CALL_MINUTES: '1',
      MAX_CALL_MINUTES: '15',
    }),
  ).toMatchObject({
    CREDITS_PER_MINUTE: 2.5,
    MIN_CALL_MINUTES: 1,
    MAX_CALL_MINUTES: 15,
  });
});

it.each([
  { CREDITS_PER_MINUTE: '0' },
  { CREDITS_PER_MINUTE: '-1' },
  { CREDITS_PER_MINUTE: 'NaN' },
  { CREDITS_PER_MINUTE: 'Infinity' },
  { CREDITS_PER_MINUTE: '0.001' },
  { MIN_CALL_MINUTES: '0' },
  { MIN_CALL_MINUTES: '1.5' },
  { MAX_CALL_MINUTES: '121' },
  { MIN_CALL_MINUTES: '10', MAX_CALL_MINUTES: '5' },
])('rejects invalid billing configuration at startup: %j', (patch) => {
  expect(() => validateEnv({ ...base, ...patch })).toThrow();
});
