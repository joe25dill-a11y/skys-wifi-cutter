import fs from 'fs';
import path from 'path';
import { getDataDir } from '../utils/paths.js';
import { openSqliteDatabase } from './sqliteOpen.js';

const DATA_DIR = getDataDir();
const DB_PATH = path.join(DATA_DIR, 'bandwidth.db');
const JSON_FILE = path.join(DATA_DIR, 'bandwidth-history.json');
const MAX_SAMPLES = 4032;

let dbInstance = null;
let memoryHistory = [];

function initBandwidthDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bandwidth_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      upload REAL NOT NULL DEFAULT 0,
      download REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS device_bandwidth_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      mac TEXT NOT NULL,
      ip TEXT,
      name TEXT,
      upload REAL NOT NULL DEFAULT 0,
      download REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_bw_samples_ts ON bandwidth_samples(timestamp);
    CREATE INDEX IF NOT EXISTS idx_device_bw_mac_ts ON device_bandwidth_samples(mac, timestamp);
  `);
  migrateFromJson(db);
}

function getDb() {
  if (dbInstance === false) return null;
  if (dbInstance) return dbInstance;

  const db = openSqliteDatabase(DB_PATH, { onCreate: initBandwidthDb });
  if (!db) {
    dbInstance = false;
    return null;
  }

  dbInstance = db;
  return dbInstance;
}

function migrateFromJson(db) {
  if (!fs.existsSync(JSON_FILE)) return;

  const existing = db.prepare('SELECT COUNT(*) AS count FROM bandwidth_samples').get();
  if (existing.count > 0) return;

  try {
    const history = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
    if (!Array.isArray(history) || history.length === 0) return;

    const insertTotal = db.prepare(
      'INSERT INTO bandwidth_samples (timestamp, upload, download) VALUES (?, ?, ?)'
    );
    const insertDevice = db.prepare(
      'INSERT INTO device_bandwidth_samples (timestamp, mac, ip, name, upload, download) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const tx = db.transaction((rows) => {
      for (const row of rows) {
        insertTotal.run(row.timestamp, row.upload ?? 0, row.download ?? 0);
        for (const device of row.perDevice ?? []) {
          if (!device?.mac) continue;
          insertDevice.run(
            row.timestamp,
            device.mac,
            device.ip ?? null,
            device.name ?? null,
            device.upload ?? 0,
            device.download ?? 0
          );
        }
      }
    });

    tx(history);
    fs.renameSync(JSON_FILE, `${JSON_FILE}.bak`);
  } catch (error) {
    console.warn('Bandwidth history JSON migration failed:', error.message);
  }
}

function trimOldSamples(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM bandwidth_samples').get().count;
  if (count <= MAX_SAMPLES) return;

  const excess = count - MAX_SAMPLES;
  db.prepare(
    `DELETE FROM bandwidth_samples WHERE id IN (
      SELECT id FROM bandwidth_samples ORDER BY timestamp ASC LIMIT ?
    )`
  ).run(excess);
}

export async function appendBandwidthSample(sample) {
  const db = getDb();
  const timestamp = new Date().toISOString();

  if (!db) {
    memoryHistory.push({
      timestamp,
      upload: sample.upload ?? 0,
      download: sample.download ?? 0
    });
    if (memoryHistory.length > MAX_SAMPLES) {
      memoryHistory = memoryHistory.slice(-MAX_SAMPLES);
    }
    return memoryHistory.length;
  }

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO bandwidth_samples (timestamp, upload, download) VALUES (?, ?, ?)').run(
      timestamp,
      sample.upload ?? 0,
      sample.download ?? 0
    );

    const insertDevice = db.prepare(
      'INSERT INTO device_bandwidth_samples (timestamp, mac, ip, name, upload, download) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const device of sample.perDevice ?? []) {
      if (!device?.mac) continue;
      if ((device.upload ?? 0) <= 0 && (device.download ?? 0) <= 0) continue;
      insertDevice.run(
        timestamp,
        device.mac,
        device.ip ?? null,
        device.name ?? null,
        device.upload ?? 0,
        device.download ?? 0
      );
    }

    trimOldSamples(db);
  });

  tx();
  return db.prepare('SELECT COUNT(*) AS count FROM bandwidth_samples').get().count;
}

export async function getBandwidthHistory(hours = 24) {
  const db = getDb();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  if (!db) {
    return memoryHistory.filter((row) => row.timestamp >= cutoff);
  }

  const totals = db
    .prepare(
      'SELECT timestamp, upload, download FROM bandwidth_samples WHERE timestamp >= ? ORDER BY timestamp ASC'
    )
    .all(cutoff);

  return totals.map((row) => ({
    timestamp: row.timestamp,
    upload: row.upload,
    download: row.download
  }));
}

export async function getDeviceUsageHistory(mac, hours = 24) {
  const db = getDb();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  if (!db) {
    return {
      mac,
      hours,
      samples: [],
      summary: {
        count: 0,
        peakUpload: 0,
        peakDownload: 0,
        avgUpload: 0,
        avgDownload: 0
      }
    };
  }

  const rows = db
    .prepare(
      `SELECT timestamp, upload, download, ip, name
       FROM device_bandwidth_samples
       WHERE mac = ? AND timestamp >= ?
       ORDER BY timestamp ASC`
    )
    .all(mac, cutoff);

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS samples,
         MAX(upload) AS peak_upload,
         MAX(download) AS peak_download,
         AVG(upload) AS avg_upload,
         AVG(download) AS avg_download
       FROM device_bandwidth_samples
       WHERE mac = ? AND timestamp >= ?`
    )
    .get(mac, cutoff);

  return {
    mac,
    hours,
    samples: rows,
    summary: {
      count: summary?.samples ?? 0,
      peakUpload: Number((summary?.peak_upload ?? 0).toFixed(3)),
      peakDownload: Number((summary?.peak_download ?? 0).toFixed(3)),
      avgUpload: Number((summary?.avg_upload ?? 0).toFixed(3)),
      avgDownload: Number((summary?.avg_download ?? 0).toFixed(3))
    }
  };
}

export async function getTopDevicesUsage(hours = 24, limit = 10) {
  const db = getDb();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  if (!db) return [];
  const sampleWindowSec = 300;

  const rows = db
    .prepare(
      `SELECT mac, MAX(name) AS name, MAX(ip) AS ip,
              MAX(upload) AS peak_upload,
              MAX(download) AS peak_download,
              AVG(upload + download) AS avg_total,
              COUNT(*) AS sample_count,
              SUM((upload + download) * ? / 8.0) AS estimated_mb
       FROM device_bandwidth_samples
       WHERE timestamp >= ?
       GROUP BY mac
       ORDER BY avg_total DESC
       LIMIT ?`
    )
    .all(sampleWindowSec, cutoff, limit);

  return rows.map((row) => ({
    ...row,
    estimated_mb: Number((row.estimated_mb || 0).toFixed(1))
  }));
}
