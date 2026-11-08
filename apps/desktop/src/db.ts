import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

export interface PageRecord {
  id: string;
  title: string;
  icon?: string;
  parentId?: string | null;
  order: number;
  blocks: string; // JSON string of Block[]
  createdAt: number;
  updatedAt: number;
}

export interface PagePayload {
  id: string;
  title: string;
  icon?: string;
  parentId?: string | null;
  order: number;
  blocks: any[];
  createdAt: number;
  updatedAt: number;
}

let db: Database.Database | null = null;

export function initDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  let resolvedPath = dbPath;
  if (!resolvedPath) {
    try {
      const userData = app?.getPath ? app.getPath('userData') : '';
      resolvedPath = path.join(userData || process.cwd(), 'notion-clone.db');
    } catch {
      resolvedPath = path.join(process.cwd(), 'notion-clone.db');
    }
  }

  try {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(resolvedPath);
  } catch (err) {
    console.warn(`[DB] Failed to open SQLite at ${resolvedPath}, falling back:`, err);
    try {
      const fallbackPath = path.join(process.cwd(), 'notion-clone.db');
      db = new Database(fallbackPath);
    } catch {
      console.warn('[DB] Falling back to in-memory database');
      db = new Database(':memory:');
    }
  }

  // WAL mode for high performance
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  } catch (err) {
    console.warn('[DB] WAL pragma not applicable:', err);
  }

  // Create pages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      icon TEXT,
      parentId TEXT,
      "order" REAL NOT NULL DEFAULT 0,
      blocks TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pages_parentId ON pages(parentId);
    CREATE INDEX IF NOT EXISTS idx_pages_order ON pages("order");
  `);

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export function loadAllPagesFromDb(): PagePayload[] {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM pages ORDER BY "order" ASC');
  const rows = stmt.all() as PageRecord[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    icon: row.icon || undefined,
    parentId: row.parentId || undefined,
    order: row.order,
    blocks: JSON.parse(row.blocks || '[]'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function loadPagesFromDb(ids: string[]): (PagePayload | undefined)[] {
  if (!ids.length) return [];
  const database = getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const stmt = database.prepare(`SELECT * FROM pages WHERE id IN (${placeholders})`);
  const rows = stmt.all(...ids) as PageRecord[];
  const map = new Map<string, PagePayload>();
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      title: row.title,
      icon: row.icon || undefined,
      parentId: row.parentId || undefined,
      order: row.order,
      blocks: JSON.parse(row.blocks || '[]'),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
  return ids.map((id) => map.get(id));
}

export function writePagesToDb(put: PagePayload[], del: string[]): void {
  const database = getDatabase();
  const insertOrUpdate = database.prepare(`
    INSERT INTO pages (id, title, icon, parentId, "order", blocks, createdAt, updatedAt)
    VALUES (@id, @title, @icon, @parentId, @order, @blocks, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      icon = excluded.icon,
      parentId = excluded.parentId,
      "order" = excluded."order",
      blocks = excluded.blocks,
      updatedAt = excluded.updatedAt
  `);

  const deleteStmt = database.prepare('DELETE FROM pages WHERE id = ?');

  const runTx = database.transaction(() => {
    for (const p of put) {
      insertOrUpdate.run({
        id: p.id,
        title: p.title || '',
        icon: p.icon || null,
        parentId: p.parentId || null,
        order: typeof p.order === 'number' ? p.order : 0,
        blocks: JSON.stringify(p.blocks || []),
        createdAt: p.createdAt || Date.now(),
        updatedAt: p.updatedAt || Date.now(),
      });
    }
    for (const id of del) {
      deleteStmt.run(id);
    }
  });

  runTx();
}

export function clearAllPagesFromDb(): void {
  const database = getDatabase();
  database.prepare('DELETE FROM pages').run();
}
