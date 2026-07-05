import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let BetterSqlite3 = undefined;
let loadError = null;

export function isSqliteAvailable() {
  return loadSqliteModule() !== null;
}

export function getSqliteLoadError() {
  loadSqliteModule();
  return loadError;
}

function loadSqliteModule() {
  if (BetterSqlite3 === null) return null;
  if (BetterSqlite3) return BetterSqlite3;

  try {
    BetterSqlite3 = require('better-sqlite3');
    return BetterSqlite3;
  } catch (error) {
    loadError = error;
    BetterSqlite3 = null;
    console.warn('[sqlite] Native module unavailable:', error.message);
    return null;
  }
}

export function openSqliteDatabase(dbPath, { onCreate, mkdir = true } = {}) {
  const Sqlite = loadSqliteModule();
  if (!Sqlite) return null;

  try {
    if (mkdir) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    const db = new Sqlite(dbPath);
    db.pragma('journal_mode = WAL');
    if (onCreate) onCreate(db);
    return db;
  } catch (error) {
    loadError = error;
    console.warn(`[sqlite] Failed to open ${dbPath}:`, error.message);
    return null;
  }
}
