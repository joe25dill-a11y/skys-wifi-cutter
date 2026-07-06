import logger from '../utils/logger.js';
import { ValidationError } from '../utils/validation.js';

const FRIENDLY_ERRORS = [
  [/Device is cut — restore before/i, 'Device is cut — restore it before applying this action.'],
  [/Speed limit active — remove/i, 'Speed limit is active — remove it before applying this action.'],
  [/Lag active — stop lag/i, 'Lag switch is active — stop lag before applying this action.'],
  [/Port block active — remove/i, 'Port block is active — remove it before applying this action.'],
  [/DNS lock active — remove/i, 'DNS block is active — remove it before applying this action.'],
  [/One-way kill active/i, 'One-way kill is active — stop it before applying this action.'],
  [/Native engine required/i, 'Native engine unavailable — run as Administrator and ensure Npcap is installed.'],
  [/Device not found/i, 'Device not found — rescan the network and try again.']
];

function friendlyMessage(message) {
  if (!message) return message;
  for (const [pattern, text] of FRIENDLY_ERRORS) {
    if (pattern.test(message)) return text;
  }
  return message;
}

export const errorHandler = (err, req, res, next) => {
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  if (err instanceof ValidationError) {
    return res.status(err.statusCode || 400).json({
      error: err.message,
      field: err.field
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Invalid authentication token'
    });
  }

  if (err.code === 'EACCES' || err.message.includes('permission')) {
    return res.status(403).json({
      error: 'Insufficient permissions. Run server with administrator/sudo privileges.'
    });
  }

  const statusCode = err.statusCode || 500;
  const isLocalApp = Boolean(process.env.ELECTRON_APP);
  const rawMessage = err.message || 'An unexpected error occurred';
  const message =
    isLocalApp || process.env.NODE_ENV !== 'production'
      ? friendlyMessage(rawMessage)
      : 'An unexpected error occurred';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

export const notFoundHandler = (req, res) => {
  logger.warn('404 Not Found:', {
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
};
