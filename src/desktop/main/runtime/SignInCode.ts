import { createHash } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Derive the short code shown both here and on the server's approval page for one sign-in.
 *
 * The person approves in the browser only when the two codes match, so a sign-in link someone
 * else sent them cannot complete. Mirrors `sign_in_code` in the API's `auth.py`.
 *
 * Args:
 *   deviceCode: Desktop-generated transaction id sent to `/login`.
 * Returns:
 *   Eight RFC 4648 base32 characters from SHA-256(deviceCode), formatted as `XXXX-XXXX`.
 */
export function signInCode(deviceCode: string): string {
  const digest = createHash('sha256').update(deviceCode, 'utf8').digest().subarray(0, 5);
  let bits = 0;
  let value = 0;
  let letters = '';
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      letters += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `${letters.slice(0, 4)}-${letters.slice(4, 8)}`;
}
