import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

let db;

export function initDb(dataDir = config.dataDir, file = 'eatransform.db') {
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, file));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      folder TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS processes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES processes(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_processes_project ON processes(project_id);
    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      process_id TEXT NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
      label TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_versions_process ON versions(process_id);
    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT,
      model TEXT,
      action TEXT,
      ok INTEGER,
      duration_ms INTEGER,
      input_chars INTEGER,
      output_chars INTEGER,
      error TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mime TEXT DEFAULT '',
      text TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      process_id TEXT,
      messages TEXT NOT NULL DEFAULT '[]',
      state TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function getDb() {
  if (!db) initDb();
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

export const now = () => new Date().toISOString();
