import fs from 'fs';
import path from 'path';
import { getDataDir } from '../utils/paths.js';
import { openSqliteDatabase } from './sqliteOpen.js';

const DATA_DIR = getDataDir();
const DB_PATH = path.join(DATA_DIR, 'devices.db');
const JSON_PATH = path.join(DATA_DIR, 'devices.json');

let dbInstance = null;
let jsonMode = false;
let jsonDevices = null;

function rowToDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    ip_address: row.ip_address,
    mac_address: row.mac_address,
    manufacturer: row.manufacturer,
    device_type: row.device_type,
    status: row.status,
    custom_name: row.custom_name ?? undefined,
    notes: row.notes ?? undefined,
    is_online: row.is_online !== 0 && row.is_online !== false,
    is_favorite: row.is_favorite === 1 || row.is_favorite === true,
    dns_blocked: row.dns_blocked === 1 || row.dns_blocked === true,
    last_seen: row.last_seen,
    created_at: row.created_at,
    updated_at: row.updated_at,
    open_ports: Array.isArray(row.open_ports)
      ? row.open_ports
      : row.open_ports
        ? JSON.parse(row.open_ports)
        : []
  };
}

function ensureColumns(db) {
  const columns = db.prepare('PRAGMA table_info(devices)').all().map((c) => c.name);
  if (!columns.includes('is_favorite')) {
    db.exec('ALTER TABLE devices ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.includes('dns_blocked')) {
    db.exec('ALTER TABLE devices ADD COLUMN dns_blocked INTEGER NOT NULL DEFAULT 0');
  }
}

function migrateFromJson(db) {
  if (!fs.existsSync(JSON_PATH)) return;

  const existing = db.prepare('SELECT COUNT(*) AS count FROM devices').get();
  if (existing.count > 0) return;

  try {
    const devices = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    if (!Array.isArray(devices) || devices.length === 0) return;

    const insert = db.prepare(`
      INSERT INTO devices (
        mac_address, id, name, hostname, ip_address, manufacturer, device_type,
        status, custom_name, notes, is_online, is_favorite, dns_blocked, last_seen, created_at, updated_at, open_ports
      ) VALUES (
        @mac_address, @id, @name, @hostname, @ip_address, @manufacturer, @device_type,
        @status, @custom_name, @notes, @is_online, @is_favorite, @dns_blocked, @last_seen, @created_at, @updated_at, @open_ports
      )
    `);

    const migrate = db.transaction((rows) => {
      for (const device of rows) {
        insert.run({
          mac_address: device.mac_address,
          id: device.id || device.mac_address,
          name: device.name,
          hostname: device.hostname || device.ip_address,
          ip_address: device.ip_address,
          manufacturer: device.manufacturer || 'Unknown',
          device_type: device.device_type || 'unknown',
          status: device.status || 'allowed',
          custom_name: device.custom_name ?? null,
          notes: device.notes ?? null,
          is_online: device.is_online === false ? 0 : 1,
          is_favorite: device.is_favorite ? 1 : 0,
          dns_blocked: device.dns_blocked ? 1 : 0,
          last_seen: device.last_seen,
          created_at: device.created_at || device.last_seen,
          updated_at: device.updated_at || device.last_seen,
          open_ports: JSON.stringify(device.open_ports ?? [])
        });
      }
    });

    migrate(devices);
    fs.renameSync(JSON_PATH, `${JSON_PATH}.bak`);
  } catch (error) {
    console.warn('SQLite migration from devices.json failed:', error.message);
  }
}

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      mac_address TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      hostname TEXT,
      ip_address TEXT NOT NULL,
      manufacturer TEXT,
      device_type TEXT,
      status TEXT NOT NULL DEFAULT 'allowed',
      custom_name TEXT,
      notes TEXT,
      is_online INTEGER NOT NULL DEFAULT 1,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      dns_blocked INTEGER NOT NULL DEFAULT 0,
      last_seen TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      open_ports TEXT
    )
  `);
  ensureColumns(db);
  migrateFromJson(db);
}

function enableJsonMode(reason) {
  if (jsonMode) return;
  jsonMode = true;
  dbInstance = null;
  console.warn('[deviceStore] Using JSON storage:', reason);
  loadJsonDevices();
}

function loadJsonDevices() {
  if (jsonDevices) return jsonDevices;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const candidates = [JSON_PATH, `${JSON_PATH}.bak`];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const devices = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(devices)) {
        jsonDevices = devices.map((device) => rowToDevice(device));
        return jsonDevices;
      }
    } catch {
      // try next candidate
    }
  }

  jsonDevices = [];
  return jsonDevices;
}

function saveJsonDevices() {
  if (!jsonDevices) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(jsonDevices, null, 2));
}

function findJsonDevice(macAddress) {
  return loadJsonDevices().find((device) => device.mac_address === macAddress) ?? null;
}

function getDb() {
  if (jsonMode) return null;
  if (dbInstance) return dbInstance;

  const db = openSqliteDatabase(DB_PATH, { onCreate: initDb });
  if (!db) {
    enableJsonMode('SQLite unavailable');
    return null;
  }

  dbInstance = db;
  return dbInstance;
}

export class DeviceStore {
  buildDeviceName(scanned, existing) {
    if (existing?.custom_name) {
      return existing.custom_name;
    }

    const candidate =
      scanned.display_name ||
      (scanned.hostname && scanned.hostname !== scanned.ip_address ? scanned.hostname : null);

    if (candidate) return candidate;
    if (existing?.name && !existing.name.startsWith('Device ')) return existing.name;
    if (scanned.manufacturer && scanned.manufacturer !== 'Unknown') {
      return `${scanned.manufacturer} (${scanned.ip_address})`;
    }
    return `Device ${scanned.mac_address.slice(-8)}`;
  }

  async getAll() {
    const db = getDb();
    if (jsonMode) {
      return loadJsonDevices()
        .slice()
        .sort((a, b) => {
          if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
          return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
        });
    }

    const rows = db
      .prepare('SELECT * FROM devices ORDER BY is_favorite DESC, datetime(last_seen) DESC')
      .all();
    return rows.map(rowToDevice);
  }

  async getFavorites() {
    const db = getDb();
    if (jsonMode) {
      return loadJsonDevices()
        .filter((device) => device.is_favorite)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return db
      .prepare('SELECT * FROM devices WHERE is_favorite = 1 ORDER BY name ASC')
      .all()
      .map(rowToDevice);
  }

  async getByMac(macAddress) {
    getDb();
    if (jsonMode) return findJsonDevice(macAddress);

    const db = dbInstance;
    return rowToDevice(
      db.prepare('SELECT * FROM devices WHERE mac_address = ?').get(macAddress)
    );
  }

  async getBlocked() {
    const db = getDb();
    if (jsonMode) {
      return loadJsonDevices().filter((device) => device.status === 'blocked');
    }

    return db
      .prepare("SELECT * FROM devices WHERE status = 'blocked'")
      .all()
      .map(rowToDevice);
  }

  async setFavorite(macAddress, favorite) {
    getDb();
    if (jsonMode) {
      const device = findJsonDevice(macAddress);
      if (!device) return null;
      device.is_favorite = favorite;
      device.updated_at = new Date().toISOString();
      saveJsonDevices();
      return device;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare('UPDATE devices SET is_favorite = ?, updated_at = ? WHERE mac_address = ?')
      .run(favorite ? 1 : 0, now, macAddress);
    if (result.changes === 0) return null;
    return this.getByMac(macAddress);
  }

  async setDnsBlocked(macAddress, blocked) {
    getDb();
    if (jsonMode) {
      const device = findJsonDevice(macAddress);
      if (!device) return null;
      device.dns_blocked = blocked;
      device.updated_at = new Date().toISOString();
      saveJsonDevices();
      return device;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare('UPDATE devices SET dns_blocked = ?, updated_at = ? WHERE mac_address = ?')
      .run(blocked ? 1 : 0, now, macAddress);
    if (result.changes === 0) return null;
    return this.getByMac(macAddress);
  }

  async upsertFromScan(scannedDevices) {
    getDb();
    if (jsonMode) {
      const now = new Date().toISOString();
      const devices = loadJsonDevices();

      for (const item of scannedDevices) {
        const index = devices.findIndex((device) => device.mac_address === item.mac_address);
        const existing = index >= 0 ? devices[index] : null;
        const next = {
          mac_address: item.mac_address,
          id: existing?.id || item.mac_address,
          name: this.buildDeviceName(item, existing),
          hostname: item.hostname || existing?.hostname || item.ip_address,
          ip_address: item.ip_address,
          manufacturer: item.manufacturer || existing?.manufacturer || 'Unknown',
          device_type: item.device_type || existing?.device_type || 'unknown',
          status: existing?.status || 'allowed',
          custom_name: existing?.custom_name,
          notes: existing?.notes,
          is_online: true,
          is_favorite: existing?.is_favorite ?? false,
          dns_blocked: existing?.dns_blocked ?? false,
          last_seen: now,
          created_at: existing?.created_at || now,
          updated_at: now,
          open_ports: item.open_ports ?? existing?.open_ports ?? []
        };

        if (index >= 0) devices[index] = next;
        else devices.push(next);
      }

      if (scannedDevices.length === 0) {
        for (const device of devices) device.is_online = false;
      } else {
        const seen = new Set(scannedDevices.map((device) => device.mac_address));
        for (const device of devices) {
          if (!seen.has(device.mac_address)) device.is_online = false;
        }
      }

      const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      jsonDevices = devices.filter(
        (device) =>
          device.is_online ||
          device.is_favorite ||
          new Date(device.last_seen).getTime() >= staleCutoff
      );
      saveJsonDevices();
      return this.getAll();
    }

    const db = getDb();
    const now = new Date().toISOString();
    const seenMacs = new Set(scannedDevices.map((d) => d.mac_address));

    const upsert = db.prepare(`
      INSERT INTO devices (
        mac_address, id, name, hostname, ip_address, manufacturer, device_type,
        status, custom_name, notes, is_online, is_favorite, dns_blocked, last_seen, created_at, updated_at, open_ports
      ) VALUES (
        @mac_address, @id, @name, @hostname, @ip_address, @manufacturer, @device_type,
        @status, @custom_name, @notes, @is_online, @is_favorite, @dns_blocked, @last_seen, @created_at, @updated_at, @open_ports
      )
      ON CONFLICT(mac_address) DO UPDATE SET
        ip_address = excluded.ip_address,
        name = excluded.name,
        hostname = excluded.hostname,
        device_type = excluded.device_type,
        manufacturer = excluded.manufacturer,
        last_seen = excluded.last_seen,
        updated_at = excluded.updated_at,
        is_online = excluded.is_online,
        open_ports = excluded.open_ports
    `);

    const tx = db.transaction((scanned) => {
      for (const item of scanned) {
        const existing = this.getByMacSync(db, item.mac_address);
        const name = this.buildDeviceName(item, existing);
        upsert.run({
          mac_address: item.mac_address,
          id: existing?.id || item.mac_address,
          name,
          hostname: item.hostname || existing?.hostname || item.ip_address,
          ip_address: item.ip_address,
          manufacturer: item.manufacturer || existing?.manufacturer || 'Unknown',
          device_type: item.device_type || existing?.device_type || 'unknown',
          status: existing?.status || 'allowed',
          custom_name: existing?.custom_name ?? null,
          notes: existing?.notes ?? null,
          is_online: 1,
          is_favorite: existing?.is_favorite ? 1 : 0,
          dns_blocked: existing?.dns_blocked ? 1 : 0,
          last_seen: now,
          created_at: existing?.created_at || now,
          updated_at: now,
          open_ports: JSON.stringify(item.open_ports ?? existing?.open_ports ?? [])
        });
      }

      if (scanned.length === 0) {
        db.prepare('UPDATE devices SET is_online = 0').run();
      } else {
        db.prepare(
          `UPDATE devices SET is_online = 0 WHERE mac_address NOT IN (${scanned.map(() => '?').join(',')})`
        ).run(...scanned.map((d) => d.mac_address));
      }

      const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('DELETE FROM devices WHERE is_online = 0 AND last_seen < ? AND is_favorite = 0').run(
        staleCutoff
      );
    });

    tx(scannedDevices);
    return this.getAll();
  }

  getByMacSync(db, macAddress) {
    return rowToDevice(db.prepare('SELECT * FROM devices WHERE mac_address = ?').get(macAddress));
  }

  async updateStatus(macAddress, status) {
    getDb();
    if (jsonMode) {
      const device = findJsonDevice(macAddress);
      if (!device) return null;
      device.status = status;
      device.updated_at = new Date().toISOString();
      saveJsonDevices();
      return device;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare('UPDATE devices SET status = ?, updated_at = ? WHERE mac_address = ?')
      .run(status, now, macAddress);
    if (result.changes === 0) return null;
    return this.getByMac(macAddress);
  }

  async rename(macAddress, customName) {
    getDb();
    if (jsonMode) {
      const device = findJsonDevice(macAddress);
      if (!device) return null;
      device.name = customName;
      device.custom_name = customName;
      device.updated_at = new Date().toISOString();
      saveJsonDevices();
      return device;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare(
        'UPDATE devices SET name = ?, custom_name = ?, updated_at = ? WHERE mac_address = ?'
      )
      .run(customName, customName, now, macAddress);
    if (result.changes === 0) return null;
    return this.getByMac(macAddress);
  }

  async updateNotes(macAddress, notes) {
    getDb();
    if (jsonMode) {
      const device = findJsonDevice(macAddress);
      if (!device) return null;
      device.notes = notes;
      device.updated_at = new Date().toISOString();
      saveJsonDevices();
      return device;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare('UPDATE devices SET notes = ?, updated_at = ? WHERE mac_address = ?')
      .run(notes, now, macAddress);
    if (result.changes === 0) return null;
    return this.getByMac(macAddress);
  }

  async updateIp(macAddress, ipAddress) {
    getDb();
    if (jsonMode) {
      const device = findJsonDevice(macAddress);
      if (!device) return null;
      device.ip_address = ipAddress;
      device.updated_at = new Date().toISOString();
      saveJsonDevices();
      return device;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare('UPDATE devices SET ip_address = ?, updated_at = ? WHERE mac_address = ?')
      .run(ipAddress, now, macAddress);
    if (result.changes === 0) return null;
    return this.getByMac(macAddress);
  }

  async markOnline(macAddress) {
    getDb();
    if (jsonMode) {
      const device = findJsonDevice(macAddress);
      if (!device) return null;
      const now = new Date().toISOString();
      device.is_online = true;
      device.last_seen = now;
      device.updated_at = now;
      saveJsonDevices();
      return device;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare('UPDATE devices SET is_online = 1, last_seen = ?, updated_at = ? WHERE mac_address = ?')
      .run(now, now, macAddress);
    if (result.changes === 0) return null;
    return this.getByMac(macAddress);
  }

  async resetStatusIfBlocked(macAddress) {
    const device = await this.getByMac(macAddress);
    if (device?.status === 'blocked') {
      return this.updateStatus(macAddress, 'allowed');
    }
    return device;
  }
}

export const deviceStore = new DeviceStore();
