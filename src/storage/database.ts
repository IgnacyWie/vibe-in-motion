import fs from 'node:fs'
import path from 'node:path'

import BetterSqlite3 from 'better-sqlite3'

export type Database = BetterSqlite3.Database

export function openDatabase(databasePath = getDefaultDatabasePath()) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  const database = new BetterSqlite3(databasePath)
  database.pragma('journal_mode = WAL')

  migrate(database)

  return database
}

export function getDefaultDatabasePath() {
  return process.env.BOT_DB_PATH || path.join(process.cwd(), 'data', 'bot.sqlite')
}

function migrate(database: Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      alias TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_state (
      chat_id TEXT PRIMARY KEY,
      active_workspace_alias TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(active_workspace_alias) REFERENCES workspaces(alias) ON DELETE SET NULL
    );
  `)
}
