import { randomBytes } from 'crypto';
import { decryptSecret, encryptSecret, parseKey } from './token-crypto';

const key = randomBytes(32);

describe('token-crypto', () => {
  it('round-trips a secret', () => {
    const stored = encryptSecret('1//refresh-token', key);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('refresh-token');
    expect(decryptSecret(stored, key)).toBe('1//refresh-token');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptSecret('same', key)).not.toBe(encryptSecret('same', key));
  });

  it('rejects a tampered ciphertext', () => {
    const parts = encryptSecret('secret', key).split('.');
    parts[3] = Buffer.from('tampered!').toString('base64');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
  });

  it('rejects the wrong key', () => {
    const stored = encryptSecret('secret', key);
    expect(() => decryptSecret(stored, randomBytes(32))).toThrow();
  });

  it('parseKey requires exactly 32 bytes', () => {
    expect(parseKey(key.toString('base64'))).toHaveLength(32);
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow();
  });
});
