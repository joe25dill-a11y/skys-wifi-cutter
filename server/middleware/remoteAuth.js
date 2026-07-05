import { getSettings } from '../storage/appSettingsStore.js';

export async function requireRemotePin(req, res, next) {
  try {
    const settings = await getSettings();
    if (!settings.remoteControlEnabled) {
      return res.status(403).json({ error: 'Remote control is disabled in settings' });
    }
    if (!settings.remotePin || settings.remotePin.length < 4) {
      return res.status(403).json({ error: 'Set a remote PIN (4+ digits) in Tools → Remote' });
    }
    const pin = req.headers['x-remote-pin'] || req.body?.pin || req.query?.pin;
    if (String(pin) !== String(settings.remotePin)) {
      return res.status(401).json({ error: 'Invalid remote PIN' });
    }
    next();
  } catch (error) {
    next(error);
  }
}
