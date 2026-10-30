import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  tenantId: string;
  userId: string;
  exp: number;
}

const sign = (payload: string, key: Buffer) =>
  createHmac('sha256', key)
    .update(`google-oauth-state:${payload}`)
    .digest('base64url');

/**
 * The OAuth `state` param. It round-trips through Google, so it must be
 * tamper-proof: we sign it with HMAC. That lets the public callback trust
 * which tenant started the flow without a session or a DB row, and blocks
 * CSRF (an attacker can't forge a state for someone else's tenant).
 */
export function createState(
  tenantId: string,
  userId: string,
  key: Buffer,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      tenantId,
      userId,
      exp: Date.now() + STATE_TTL_MS,
      n: randomBytes(8).toString('hex'),
    }),
  ).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

/** Returns null for anything forged, malformed or expired. */
export function verifyState(state: string, key: Buffer): OAuthState | null {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;

  const expected = Buffer.from(sign(payload, key));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.tenantId !== 'string' || typeof data.userId !== 'string')
      return null;
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { tenantId: data.tenantId, userId: data.userId, exp: data.exp };
  } catch {
    return null;
  }
}
