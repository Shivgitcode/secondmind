import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import type { Export, ImportResult, Store } from './store.js';

/** Write so that a reader — or a sync tool mid-copy — never sees half a file. */
export function writePrivate(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, path);
}

export function readExport(path: string): unknown {
  const text = path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} is not JSON. Only JSON exports can be imported — markdown is for reading.`);
  }
}

/** Human-readable export: one section per project, newest first. Not importable. */
export function toMarkdown(data: Export): string {
  const byProject = new Map<string, Export['notes']>();
  for (const note of [...data.notes].reverse()) {
    byProject.set(note.project, [...(byProject.get(note.project) ?? []), note]);
  }

  const lines = [`# secondmind notes`, '', `Exported ${data.exportedAt.slice(0, 10)} · ${data.notes.length} note${data.notes.length === 1 ? '' : 's'}`, ''];
  for (const [project, notes] of [...byProject].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${project}`, '');
    for (const note of notes) {
      lines.push(`- **${note.type}** · ${note.createdAt.slice(0, 10)} — ${note.content.replace(/\n+/g, ' ')}`);
      const extra = [
        note.keywords && `keywords: ${note.keywords}`,
        note.related && `also relevant to: ${note.related}`,
        note.files && `files: ${note.files}`,
      ].filter(Boolean);
      if (extra.length > 0) lines.push(`  <br>_${extra.join(' · ')}_`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** What this machine calls itself in a sync folder. */
export function deviceName(): string {
  const raw = process.env['SECONDMIND_DEVICE'] ?? hostname();
  return raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'device';
}

export interface SyncResult extends ImportResult {
  file: string;
  from: string[];
  unreadable: string[];
}

/**
 * Two-way sync through a folder you already sync — Syncthing, Dropbox, iCloud,
 * a git repo. Each machine writes only its own file and reads everyone else's,
 * so no two machines ever write the same file and there is nothing to conflict.
 */
export function syncFolder(store: Store, dir: string, device = deviceName()): SyncResult {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const own = `${device}.json`;
  const result: SyncResult = { added: 0, skipped: 0, deleted: 0, file: join(dir, own), from: [], unreadable: [] };

  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== own).sort()) {
    try {
      const merged = store.importAll(readExport(join(dir, name)));
      result.added += merged.added;
      result.skipped += merged.skipped;
      result.deleted += merged.deleted;
      result.from.push(name);
    } catch {
      result.unreadable.push(name); // another machine mid-write, or a stray file
    }
  }

  // Written after merging, so any one file in the folder is a complete backup.
  writePrivate(result.file, JSON.stringify(store.exportAll(), null, 2));
  return result;
}
