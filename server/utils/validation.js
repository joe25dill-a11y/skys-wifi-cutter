import validator from 'validator';
import { isWeakPassword } from './hotspotPassword.js';

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

export const validateMAC = (mac) => {
  if (!mac || typeof mac !== 'string') {
    throw new ValidationError('MAC address is required', 'mac');
  }

  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  if (!macRegex.test(mac)) {
    throw new ValidationError('Invalid MAC address format', 'mac');
  }

  return mac.toUpperCase().replace(/-/g, ':');
};

export const validateIP = (ip) => {
  if (!ip || typeof ip !== 'string') {
    throw new ValidationError('IP address is required', 'ip');
  }

  if (!validator.isIP(ip, 4)) {
    throw new ValidationError('Invalid IPv4 address format', 'ip');
  }

  const parts = ip.split('.');
  if (parts.some(part => parseInt(part) > 255 || parseInt(part) < 0)) {
    throw new ValidationError('IP address octets must be between 0-255', 'ip');
  }

  return ip;
};

export const validateSSID = (ssid) => {
  if (!ssid || typeof ssid !== 'string') {
    throw new ValidationError('SSID is required', 'ssid');
  }

  if (ssid.length < 1 || ssid.length > 32) {
    throw new ValidationError('SSID must be between 1-32 characters', 'ssid');
  }

  if (!/^[a-zA-Z0-9 _-]+$/.test(ssid)) {
    throw new ValidationError('SSID contains invalid characters. Only alphanumeric, spaces, hyphens, and underscores allowed', 'ssid');
  }

  return ssid.trim();
};

export const validatePassword = (password, minLength = 8) => {
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required', 'password');
  }

  if (password.length < minLength || password.length > 63) {
    throw new ValidationError(`Password must be between ${minLength}-63 characters`, 'password');
  }

  if (isWeakPassword(password)) {
    throw new ValidationError(
      'Password is too weak. Use a random 8+ character password (not 12345678 or common words).',
      'password'
    );
  }

  return password;
};

export const validateLagValue = (value, fieldName = 'lag') => {
  const numValue = parseInt(value);

  if (isNaN(numValue)) {
    throw new ValidationError(`${fieldName} must be a number`, fieldName);
  }

  if (numValue < 0 || numValue > 5000) {
    throw new ValidationError(`${fieldName} must be between 0-5000ms`, fieldName);
  }

  return numValue;
};

export const validateBandwidth = (value, fieldName = 'bandwidth') => {
  const numValue = parseInt(value);

  if (isNaN(numValue)) {
    throw new ValidationError(`${fieldName} must be a number`, fieldName);
  }

  if (numValue < 0 || numValue > 1000000) {
    throw new ValidationError(`${fieldName} must be between 0-1000000 kbps`, fieldName);
  }

  return numValue;
};

export const sanitizeCommand = (input, allowedChars = /^[a-zA-Z0-9._:-]+$/) => {
  if (!allowedChars.test(input)) {
    throw new ValidationError('Input contains invalid characters for command execution');
  }
  return input;
};

export const validateUsername = (username) => {
  if (!username || typeof username !== 'string') {
    throw new ValidationError('Username is required', 'username');
  }

  if (username.length < 3 || username.length > 50) {
    throw new ValidationError('Username must be between 3-50 characters', 'username');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    throw new ValidationError('Username can only contain letters, numbers, hyphens, and underscores', 'username');
  }

  return username;
};

export const validateDeviceStatus = (status) => {
  const validStatuses = ['allowed', 'blocked'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Status must be one of: ${validStatuses.join(', ')}`, 'status');
  }
  return status;
};
