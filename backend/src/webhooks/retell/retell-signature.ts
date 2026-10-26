import { createHmac, timingSafeEqual } from 'crypto';

export function verifyRetellSignature(
  rawBody: string,
  apiKey: string,
  header: string | undefined,
  toleranceMs = 5 * 60 * 1000,
): boolean {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const p of header.split(',')) {
    const i = p.indexOf('=');
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  const ts = parts.v;
  const digest = parts.d;
  if (!ts || !digest) return false;
  if (Math.abs(Date.now() - Number(ts)) > toleranceMs) return false; // replay guard

  const expected = createHmac('sha256', apiKey)
    .update(rawBody + ts)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(digest);
  return a.length === b.length && timingSafeEqual(a, b);
}
