import Database from 'better-sqlite3';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

import { DB_PATH } from '../config.js';
import { type RankInput, rank, toFtsQuery } from './ranking.js';
import { redact } from './redact.js';
import { type ListOptions, type NewNote, type Note, NOTE_TYPES, type ScoredNote, type SearchOptions, isNoteType } from './types.js';

/** How many text matches to score before trimming to the caller's limit. */
const CANDIDATE_POOL = 60;

/**
 * One entry per schema version, applied in order and recorded in
 * `PRAGMA user_version`. Never edit a shipped entry — append a new one.
 * Version 1 is written with IF NOT EXISTS so databases from before
 * versioning existed upgrade cleanly.
 */
const MIGRATIONS: string[] = [
  `
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  content    TEXT NOT NULL,
  type       TEXT NOT NULL,
  project    TEXT NOT NULL,
  session_id TEXT,
  keywords   TEXT NOT NULL DEFAULT '',
  files      TEXT NOT NULL DEFAULT '',
  related    TEXT NOT NULL DEFAULT '',
  importance INTEGER NOT NULL DEFAULT 2,
  source     TEXT NOT NULL DEFAULT 'saved',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_project ON notes(project);
CREATE INDEX IF NOT EXISTS notes_session ON notes(session_id);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  content, keywords, files, related,
  content='notes', content_rowid='id', tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, content, keywords, files, related)
  VALUES (new.id, new.content, new.keywords, new.files, new.related);
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content, keywords, files, related)
  VALUES ('delete', old.id, old.content, old.keywords, old.files, old.related);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content, keywords, files, related)
  VALUES ('delete', old.id, old.content, old.keywords, old.files, old.related);
  INSERT INTO notes_fts(rowid, content, keywords, files, related)
  VALUES (new.id, new.content, new.keywords, new.files, new.related);
END;
`,
  // 2: a machine-independent id per note, and a record of deletions, so notes can
  // move between machines without duplicating or coming back from the dead.
  `
ALTER TABLE notes ADD COLUMN uid TEXT;
UPDATE notes SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
CREATE UNIQUE INDEX notes_uid ON notes(uid);
CREATE TABLE deleted_notes (uid TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

function migrate(db: Database.Database): void {
  // IMMEDIATE takes the write lock before reading the version, so two processes
  // opening a fresh database at once cannot both apply the same migration.
  db.transaction(() => {
    const current = db.pragma('user_version', { simple: true }) as number;
    if (current > SCHEMA_VERSION) {
      throw new Error(
        `This database was written by a newer secondmind (schema ${current}, this version knows ${SCHEMA_VERSION}). `
        + 'Upgrade secondmind to open it.',
      );
    }
    for (let version = current; version < SCHEMA_VERSION; version++) db.exec(MIGRATIONS[version]!);
    if (current !== SCHEMA_VERSION) db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }).immediate();
}

/** Notes can hold anything a session touched, so only you get to read them. */
function lockDown(path: string): void {
  if (path === ':memory:') return;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Create the file ourselves so it never exists with looser permissions; SQLite
  // gives the -wal and -shm files the same mode as the database.
  closeSync(openSync(path, 'a', 0o600));
  try {
    chmodSync(path, 0o600); // tighten databases created by earlier versions
  } catch {
    // not supported on every filesystem; the data is still local
  }
}

/** Bumped only if the export shape changes incompatibly. */
const EXPORT_FORMAT = 1;

export interface Export {
  secondmind: number;
  exportedAt: string;
  notes: Omit<Note, 'id'>[];
  deleted: { uid: string; deletedAt: string }[];
}

export interface ImportResult {
  added: number;
  skipped: number;
  deleted: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Accept only what an export can contain; anything else is dropped, not trusted. */
function parseExport(data: unknown): Pick<Export, 'notes' | 'deleted'> {
  if (!isRecord(data) || typeof data['secondmind'] !== 'number') {
    throw new Error('That file is not a secondmind export.');
  }
  if (data['secondmind'] > EXPORT_FORMAT) {
    throw new Error('That export was written by a newer secondmind. Upgrade to import it.');
  }
  const notes = (Array.isArray(data['notes']) ? data['notes'] : []).filter(isRecord).flatMap((raw) => {
    const uid = str(raw['uid']);
    const createdAt = str(raw['createdAt']);
    if (!uid || !str(raw['content']).trim() || !str(raw['project']).trim() || Number.isNaN(Date.parse(createdAt))) return [];
    return [{
      uid,
      content: str(raw['content']),
      type: isNoteType(raw['type']) ? raw['type'] : 'discovery',
      project: str(raw['project']),
      sessionId: str(raw['sessionId']) || null,
      keywords: str(raw['keywords']),
      files: str(raw['files']),
      related: str(raw['related']),
      importance: clampImportance(Number(raw['importance']) || 2),
      source: raw['source'] === 'extracted' ? 'extracted' as const : 'saved' as const,
      createdAt,
    }];
  });
  const deleted = (Array.isArray(data['deleted']) ? data['deleted'] : []).filter(isRecord).flatMap((raw) => {
    const uid = str(raw['uid']);
    return uid ? [{ uid, deletedAt: str(raw['deletedAt']) || new Date().toISOString() }] : [];
  });
  return { notes, deleted };
}

interface Row {
  id: number;
  uid: string;
  content: string;
  type: string;
  project: string;
  session_id: string | null;
  keywords: string;
  files: string;
  related: string;
  importance: number;
  source: string;
  created_at: string;
}

function toNote(row: Row): Note {
  return {
    id: row.id,
    uid: row.uid,
    content: row.content,
    type: isNoteType(row.type) ? row.type : 'discovery',
    project: row.project,
    sessionId: row.session_id,
    keywords: row.keywords,
    files: row.files,
    related: row.related,
    importance: clampImportance(row.importance),
    source: row.source === 'extracted' ? 'extracted' : 'saved',
    createdAt: row.created_at,
  };
}

function clampImportance(value: number): 1 | 2 | 3 {
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return 2;
}

const asText = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value.join(' ') : (value ?? '')).trim();

/**
 * The note database. One SQLite file, one table, one full-text index.
 * Construct it once and pass it around; `Store.open()` is the usual entry point.
 */
export class Store {
  private constructor(private readonly db: Database.Database) {}

  static open(path: string = DB_PATH): Store {
    lockDown(path);
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    migrate(db);
    return new Store(db);
  }

  /** Store one note and return its id. */
  remember(note: NewNote): number {
    return this.insert(note, randomUUID(), new Date().toISOString());
  }

  private insert(note: NewNote, uid: string, createdAt: string): number {
    const content = redact(note.content?.trim() ?? '');
    const project = note.project?.trim();
    if (!content) throw new Error('content is required');
    if (!project) throw new Error('project is required');

    const type = note.type ?? 'discovery';
    if (!isNoteType(type)) {
      throw new Error(`unknown type "${type}" (expected one of: ${NOTE_TYPES.join(', ')})`);
    }

    const result = this.db.prepare(`
      INSERT INTO notes (uid, content, type, project, session_id, keywords, files, related, importance, source, created_at)
      VALUES (@uid, @content, @type, @project, @sessionId, @keywords, @files, @related, @importance, @source, @createdAt)
    `).run({
      uid,
      content,
      type,
      project,
      sessionId: note.sessionId ?? null,
      keywords: redact(asText(note.keywords)),
      files: asText(note.files),
      related: asText(note.related),
      importance: clampImportance(Number(note.importance) || 2),
      source: note.source === 'extracted' ? 'extracted' : 'saved',
      createdAt,
    });

    return Number(result.lastInsertRowid);
  }

  /** Find notes relevant to `query`, best first. */
  search(query: string, options: SearchOptions = {}): ScoredNote[] {
    const match = toFtsQuery(query);
    if (!match) return [];

    const rows = this.db.prepare(`
      SELECT n.*, bm25(notes_fts) AS bm25
      FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
      WHERE notes_fts MATCH ?
      ORDER BY bm25
      LIMIT ?
    `).all(match, CANDIDATE_POOL) as (Row & { bm25: number })[];

    const candidates: RankInput[] = rows.map((row) => ({ ...toNote(row), bm25: row.bm25 }));
    return rank(candidates, options.project ?? null, options.limit ?? 6);
  }

  list(options: ListOptions = {}): Note[] {
    const clauses: string[] = [];
    const args: unknown[] = [];
    if (options.project) { clauses.push('project = ?'); args.push(options.project); }
    if (options.session) { clauses.push('session_id = ?'); args.push(options.session); }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM notes ${where} ORDER BY id DESC LIMIT ?`)
      .all(...args, options.limit ?? 20) as Row[];
    return rows.map(toNote);
  }

  get(id: number): Note | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Row | undefined;
    return row ? toNote(row) : null;
  }

  forget(id: number): boolean {
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT uid FROM notes WHERE id = ?').get(id) as { uid: string } | undefined;
      if (!row) return false;
      // Remembered so that a sync from another machine does not bring it back.
      this.db.prepare('INSERT OR REPLACE INTO deleted_notes (uid, deleted_at) VALUES (?, ?)')
        .run(row.uid, new Date().toISOString());
      this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
      return true;
    })();
  }

  /** Every note and every deletion, oldest first — the whole database as data. */
  exportAll(): Export {
    const notes = (this.db.prepare('SELECT * FROM notes ORDER BY id').all() as Row[]).map(toNote);
    const deleted = this.db.prepare('SELECT uid, deleted_at AS deletedAt FROM deleted_notes ORDER BY deleted_at')
      .all() as Export['deleted'];
    return {
      secondmind: EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      notes: notes.map(({ id: _id, ...note }) => note),
      deleted,
    };
  }

  /**
   * Merge an export into this database. Safe to run any number of times: notes
   * already here are skipped, and a deletion on either side wins.
   */
  importAll(data: unknown): ImportResult {
    const parsed = parseExport(data);
    const result: ImportResult = { added: 0, skipped: 0, deleted: 0 };
    const exists = this.db.prepare('SELECT 1 FROM notes WHERE uid = ?');
    const tombstoned = this.db.prepare('SELECT 1 FROM deleted_notes WHERE uid = ?');
    const bury = this.db.prepare('INSERT OR IGNORE INTO deleted_notes (uid, deleted_at) VALUES (?, ?)');
    const remove = this.db.prepare('DELETE FROM notes WHERE uid = ?');

    this.db.transaction(() => {
      for (const { uid, deletedAt } of parsed.deleted) {
        bury.run(uid, deletedAt);
        result.deleted += remove.run(uid).changes;
      }
      for (const note of parsed.notes) {
        if (exists.get(note.uid) || tombstoned.get(note.uid)) {
          result.skipped++;
          continue;
        }
        this.insert(note, note.uid, note.createdAt);
        result.added++;
      }
    })();

    return result;
  }

  stats(): { notes: number; projects: number } {
    const notes = this.db.prepare('SELECT count(*) AS n FROM notes').get() as { n: number };
    const projects = this.db.prepare('SELECT count(DISTINCT project) AS n FROM notes').get() as { n: number };
    return { notes: notes.n, projects: projects.n };
  }

  close(): void {
    this.db.close();
  }
}
