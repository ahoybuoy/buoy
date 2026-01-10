import Database, { type Database as BetterSqlite3Database } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface DbConfig {
  path?: string;
  inMemory?: boolean;
}

export type SqliteDb = BetterSqlite3Database;

const DEFAULT_DB_PATH = '.buoy/buoy.db';

export interface DbInstance {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: SqliteDb;
  close: () => void;
}

export function createDb(config: DbConfig = {}): DbInstance {
  let dbPath: string;

  if (config.inMemory) {
    dbPath = ':memory:';
  } else {
    dbPath = config.path || resolve(process.cwd(), DEFAULT_DB_PATH);

    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}

export type BuoyDb = DbInstance['db'];

// Initialize database schema
export function initializeDb(_db: BuoyDb, sqlite: SqliteDb): void {
  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_url TEXT,
      figma_file_keys TEXT,
      storybook_url TEXT,
      config TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      status TEXT NOT NULL DEFAULT 'pending',
      sources TEXT NOT NULL,
      stats TEXT,
      errors TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS components (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      scan_id TEXT NOT NULL REFERENCES scans(id),
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      source_location TEXT NOT NULL,
      props TEXT,
      variants TEXT,
      token_refs TEXT,
      dependencies TEXT,
      metadata TEXT,
      scanned_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      scan_id TEXT NOT NULL REFERENCES scans(id),
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      aliases TEXT,
      usedby TEXT,
      metadata TEXT,
      scanned_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drift_signals (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      scan_id TEXT REFERENCES scans(id),
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT,
      message TEXT NOT NULL,
      details TEXT,
      claude_analysis TEXT,
      resolved INTEGER DEFAULT 0,
      resolution TEXT,
      detected_at INTEGER NOT NULL,
      resolved_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS intents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      decision TEXT NOT NULL,
      context TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      scan_id TEXT NOT NULL REFERENCES scans(id),
      summary TEXT NOT NULL,
      component_count INTEGER NOT NULL,
      token_count INTEGER NOT NULL,
      drift_count INTEGER NOT NULL,
      coverage_score INTEGER,
      created_at INTEGER NOT NULL
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_scans_project ON scans(project_id);
    CREATE INDEX IF NOT EXISTS idx_components_project ON components(project_id);
    CREATE INDEX IF NOT EXISTS idx_components_scan ON components(scan_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_project ON tokens(project_id);
    CREATE INDEX IF NOT EXISTS idx_drift_signals_project ON drift_signals(project_id);
    CREATE INDEX IF NOT EXISTS idx_drift_signals_resolved ON drift_signals(resolved);
    CREATE INDEX IF NOT EXISTS idx_intents_entity ON intents(entity_type, entity_id);
  `);
}

// Convenience function to create and initialize
export function setupDb(config: DbConfig = {}): DbInstance {
  const { db, sqlite, close } = createDb(config);
  initializeDb(db, sqlite);
  return { db, sqlite, close };
}
