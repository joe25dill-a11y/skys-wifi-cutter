import path from 'path';
import { getDataDir } from '../utils/paths.js';
import { openSqliteDatabase } from './sqliteOpen.js';
import { normalizeMac } from '../services/arpTable.js';

const DB_PATH = path.join(getDataDir(), 'audit.db');
let db = null;
let disabled = false;

function getDb() {
  if (disabled) return null;
  if (db) return db;

  const opened = openSqliteDatabase(DB_PATH, {
    onCreate: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          mac TEXT,
          ip TEXT,
          detail TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_mac ON audit_log(mac);
      `);
    }
  });

  if (!opened) {
    disabled = true;
    return null;
  }

  db = opened;
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_mac ON audit_log(mac)');
  } catch {
    // ignore if table missing
  }
  return db;
}

export function logAudit(action, { mac = null, ip = null, detail = null } = {}) {
  const database = getDb();
  if (!database) return;

  const normalizedMac = mac ? normalizeMac(mac) : null;
  database
    .prepare(
      `INSERT INTO audit_log (action, mac, ip, detail, created_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(action, normalizedMac, ip, detail ? JSON.stringify(detail) : null, new Date().toISOString());
}

export function getAuditLog({ limit = 100, hours = 168 } = {}) {
  const database = getDb();
  if (!database) return [];

  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  return database
    .prepare(
      `SELECT id, action, mac, ip, detail, created_at as createdAt
       FROM audit_log WHERE created_at >= ? ORDER BY id DESC LIMIT ?`
    )
    .all(since, limit)
    .map((row) => ({
      ...row,
      detail: row.detail ? JSON.parse(row.detail) : null
    }));
}

export function getAuditLogByMac(macAddress, { limit = 100, hours = 720 } = {}) {
  const database = getDb();
  if (!database || !macAddress) return [];

  const mac = normalizeMac(macAddress);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  return database
    .prepare(
      `SELECT id, action, mac, ip, detail, created_at as createdAt
       FROM audit_log
       WHERE mac = ? AND created_at >= ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(mac, since, limit)
    .map((row) => ({
      ...row,
      detail: row.detail ? JSON.parse(row.detail) : null
    }));
}

export function exportAuditLogCsv(entries) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = 'Time,Action,MAC,IP,Detail\n';
  const rows = (entries || [])
    .map((e) =>
      [
        escape(e.createdAt),
        escape(e.action),
        escape(e.mac),
        escape(e.ip),
        escape(e.detail ? JSON.stringify(e.detail) : '')
      ].join(',')
    )
    .join('\n');
  return header + rows;
}

export function clearAuditLog() {
  const database = getDb();
  if (!database) return { success: true, disabled: true };
  database.exec('DELETE FROM audit_log');
  return { success: true };
}
