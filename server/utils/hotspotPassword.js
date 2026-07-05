import crypto from 'crypto';

const WEAK_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password12',
  'qwerty12',
  'qwerty123',
  'letmein1',
  'welcome1',
  'xbox3600',
  'hotspot1',
  'wifi1234',
  'admin123',
  'changeme'
]);

/** Windows Mobile Hotspot-friendly charset (no ambiguous lookalikes). */
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function isWeakPassword(password) {
  if (!password || typeof password !== 'string') return true;
  if (password.length < 8) return true;
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return true;
  if (/^(.)\1+$/.test(password)) return true;
  if (/^\d+$/.test(password) && password.length < 12) return true;
  return false;
}

export function generateHotspotPassword(length = 12) {
  const size = Math.max(8, Math.min(32, length));
  const bytes = crypto.randomBytes(size);
  let out = '';
  for (let i = 0; i < size; i += 1) {
    out += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  }
  return out;
}
