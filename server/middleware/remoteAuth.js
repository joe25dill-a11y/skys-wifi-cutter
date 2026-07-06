import { getSettings } from '../storage/appSettingsStore.js';
import { verifyPin } from '../utils/pinHash.js';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map();

function clientKey(req) {
  return String(req.socket?.remoteAddress || req.ip || 'unknown');
}

function isRateLimited(key) {
  const record = failedAttempts.get(key);
  if (!record) return false;
  if (Date.now() >= record.resetAt) {
    failedAttempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const now = Date.now();
  const existing = failedAttempts.get(key);
  if (existing && now < existing.resetAt) {
    existing.count += 1;
    failedAttempts.set(key, existing);
    return;
  }
  failedAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

function storedPinHash(settings) {
  return settings.remotePinHash || settings.remotePin || '';
}

export async function requireRemotePin(req, res, next) {
  try {
    const settings = await getSettings();
    if (!settings.remoteControlEnabled) {
      return res.status(403).json({ error: 'Remote control is disabled in settings' });
    }
    const hash = storedPinHash(settings);
    if (!hash) {
      return res.status(403).json({ error: 'Set a remote PIN (4+ digits) in Tools → Remote' });
    }

    const key = clientKey(req);
    if (isRateLimited(key)) {
      return res.status(429).json({ error: 'Too many failed PIN attempts. Try again in 15 minutes.' });
    }

    const pin = req.headers['x-remote-pin'] || req.body?.pin || req.query?.pin;
    if (!verifyPin(pin, hash)) {
      recordFailure(key);
      return res.status(401).json({ error: 'Invalid remote PIN' });
    }

    failedAttempts.delete(key);
    next();
  } catch (error) {
    next(error);
  }
}

export function resetRemoteAuthForTests() {
  failedAttempts.clear();
}
