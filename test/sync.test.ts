import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { Store } from '../src/core/store.js';
import { syncFolder, toMarkdown } from '../src/core/sync.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'secondmind-'));
const open = () => Store.open(join(scratch(), 'memory.db'));

test('an export imports into an empty machine with nothing lost', () => {
  const laptop = open();
  laptop.remember({
    project: 'checkout-service', type: 'decision', importance: 3, content: 'Retry payments at most twice',
    keywords: ['retry'], related: ['payments-service'], files: ['src/pay.ts'], sessionId: 's1',
  });
  const exported = laptop.exportAll();

  const desktop = open();
  assert.deepEqual(desktop.importAll(exported), { added: 1, skipped: 0, deleted: 0 });

  const [original] = laptop.list();
  const [copy] = desktop.list();
  assert.deepEqual({ ...copy, id: 0 }, { ...original, id: 0 }, 'every field, including uid and date, survives');
});

test('importing the same export twice adds nothing the second time', () => {
  const a = open();
  a.remember({ project: 'p', content: 'only once' });
  const b = open();
  b.importAll(a.exportAll());
  assert.deepEqual(b.importAll(a.exportAll()), { added: 0, skipped: 1, deleted: 0 });
  assert.equal(b.stats().notes, 1);
});

test('a note deleted on one machine is deleted on the other, and stays deleted', () => {
  const a = open();
  const id = a.remember({ project: 'p', content: 'stale advice' });
  const b = open();
  b.importAll(a.exportAll());

  const before = a.exportAll(); // still contains the note
  a.forget(id);
  assert.equal(b.importAll(a.exportAll()).deleted, 1);
  assert.equal(b.stats().notes, 0);

  // An old export from before the deletion must not resurrect it.
  assert.equal(b.importAll(before).added, 0);
  assert.equal(b.stats().notes, 0);
});

test('junk and foreign files are refused, not half-imported', () => {
  const store = open();
  assert.throws(() => store.importAll({ hello: 'world' }), /not a secondmind export/);
  assert.throws(() => store.importAll({ secondmind: 99, notes: [] }), /newer secondmind/);

  const result = store.importAll({
    secondmind: 1,
    notes: [{ uid: 'x', content: '', project: 'p', createdAt: '2026-01-01' }, { content: 'no uid', project: 'p' }, 'nonsense'],
  });
  assert.equal(result.added, 0);
});

test('imported notes are redacted like any other', () => {
  const store = open();
  store.importAll({
    secondmind: 1,
    notes: [{ uid: 'u', content: 'key ghp_abcdefghijklmnopqrstuvwxyz0123456789', project: 'p', createdAt: '2026-01-01T00:00:00Z' }],
  });
  assert.ok(!store.list()[0]?.content.includes('ghp_'));
});

test('two machines sharing a folder converge on the same notes', () => {
  const folder = scratch();
  const laptop = open();
  const desktop = open();
  laptop.remember({ project: 'p', content: 'found on the laptop' });
  desktop.remember({ project: 'p', content: 'found on the desktop' });

  syncFolder(laptop, folder, 'laptop');
  const second = syncFolder(desktop, folder, 'desktop');
  syncFolder(laptop, folder, 'laptop');

  assert.equal(second.added, 1);
  assert.deepEqual(second.from, ['laptop.json']);
  const contents = (s: Store) => s.list().map((n) => n.content).sort();
  assert.deepEqual(contents(laptop), ['found on the desktop', 'found on the laptop']);
  assert.deepEqual(contents(desktop), contents(laptop));
  assert.equal(statSync(join(folder, 'laptop.json')).mode & 0o777, 0o600);
});

test('a broken file in the sync folder is skipped, not fatal', () => {
  const folder = scratch();
  writeFileSync(join(folder, 'half-written.json'), '{"secondmind": 1, "no');
  const result = syncFolder(open(), folder, 'me');
  assert.deepEqual(result.unreadable, ['half-written.json']);
  assert.ok(JSON.parse(readFileSync(result.file, 'utf8')).secondmind);
});

test('markdown export groups by project and is readable', () => {
  const store = open();
  store.remember({ project: 'billing', content: 'invoices are generated at midnight UTC', keywords: 'cron' });
  store.remember({ project: 'auth', content: 'tokens refresh 5 minutes early' });
  const md = toMarkdown(store.exportAll());
  assert.ok(md.indexOf('## auth') < md.indexOf('## billing'));
  assert.match(md, /- \*\*discovery\*\* · \d{4}-\d{2}-\d{2} — invoices are generated at midnight UTC/);
  assert.match(md, /keywords: cron/);
});
