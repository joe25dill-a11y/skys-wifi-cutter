import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LEN = 32;

export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pin), salt, KEY_LEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPin(pin, stored) {
  if (!stored) return false;
  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (expected.length !== KEY_LEN) return false;
    const actual = scryptSync(String(pin), salt, KEY_LEN);
    return timingSafeEqual(actual, expected);
  }
  return String(pin) === String(stored);
}

export function isHashedPin(stored) {
  return Boolean(stored && String(stored).startsWith('scrypt:'));
}
