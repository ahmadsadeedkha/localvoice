import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce size
const VERSION = 'v1';

/** Decode GOOGLE_TOKEN_ENC_KEY (base64) and insist on exactly 32 bytes. */
export function parseKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENC_KEY must be 32 bytes, base64-encoded');
  }
  return key;
}

/**
 * Encrypts a secret (a Google refresh token) for storage at rest.
 * Output: "v1.<iv>.<authTag>.<ciphertext>", each part base64. The version
 * prefix lets us rotate keys or algorithms later without guessing the format.
 */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join('.');
}

/** Throws if the value was tampered with or encrypted with a different key. */
export function decryptSecret(stored: string, key: Buffer): string {
  const [version, iv, tag, enc] = stored.split('.');
  if (version !== VERSION || !iv || !tag || !enc) {
    throw new Error('Unrecognised encrypted secret format');
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(enc, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
