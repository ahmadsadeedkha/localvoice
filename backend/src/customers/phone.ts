/**
 * Customers are identified by phone number. Strip spacing/punctuation so
 * "+92 300-1234567" and "+923001234567" are the same person; keep a leading +.
 * Returns null for anything that isn't plausibly a phone number.
 */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9+]/g, '');
  return /^\+?\d{5,15}$/.test(cleaned) ? cleaned : null;
}

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
export function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
