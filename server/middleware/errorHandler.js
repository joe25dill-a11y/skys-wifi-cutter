import logger from '../utils/logger.js';
import { ValidationError } from '../utils/validation.js';

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
  const message =
    isLocalApp || process.env.NODE_ENV !== 'production'
      ? err.message || 'An unexpected error occurred'
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
