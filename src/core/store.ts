import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { DB_PATH } from '../config.js';
import { type RankInput, rank, toFtsQuery } from './ranking.js';
import { type ListOptions, type NewNote, type Note, NOTE_TYPES, type ScoredNote, type SearchOptions, isNoteType } from './types.js';

/** How many text matches to score before trimming to the caller's limit. */
const CANDIDATE_POOL = 60;

const SCHEMA = `
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
`;

interface Row {
  id: number;
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
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(SCHEMA);
    return new Store(db);
  }

  /** Store one note and return its id. */
  remember(note: NewNote): number {
    const content = note.content?.trim();
    const project = note.project?.trim();
    if (!content) throw new Error('content is required');
    if (!project) throw new Error('project is required');

    const type = note.type ?? 'discovery';
    if (!isNoteType(type)) {
      throw new Error(`unknown type "${type}" (expected one of: ${NOTE_TYPES.join(', ')})`);
    }

    const result = this.db.prepare(`
      INSERT INTO notes (content, type, project, session_id, keywords, files, related, importance, source, created_at)
      VALUES (@content, @type, @project, @sessionId, @keywords, @files, @related, @importance, @source, @createdAt)
    `).run({
      content,
      type,
      project,
      sessionId: note.sessionId ?? null,
      keywords: asText(note.keywords),
      files: asText(note.files),
      related: asText(note.related),
      importance: clampImportance(Number(note.importance) || 2),
      source: note.source ?? 'saved',
      createdAt: new Date().toISOString(),
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
    return this.db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
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
