import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import Database from 'better-sqlite3';

import { redact } from '../src/core/redact.js';
import { SCHEMA_VERSION, Store } from '../src/core/store.js';
import { extract } from '../src/extract/index.js';

const freshPath = () => join(mkdtempSync(join(tmpdir(), 'secondmind-')), 'memory.db');

test('common credential shapes are redacted', () => {
  const text = [
    'ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123',
    'token ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'aws AKIAIOSFODNN7EXAMPLE',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz.123',
    'postgres://admin:hunter2secret@db.internal:5432/app',
    'password: correcthorsebattery',
  ].join('\n');
  const out = redact(text);
  for (const secret of ['sk-ant-api03', 'ghp_abc', 'AKIAIOSFODNN7EXAMPLE', 'abcdefghijklmnopqrstuvwxyz.123', 'hunter2secret', 'correcthorsebattery']) {
    assert.ok(!out.includes(secret), `${secret} leaked: ${out}`);
  }
  assert.match(out, /postgres:\/\/admin:\[redacted\]@db\.internal/);
});

test('ordinary prose survives redaction untouched', () => {
  const text = 'warehouse-service returns available_quantity, but checkout-service expects quantity';
  assert.equal(redact(text), text);
});

test('secrets never reach the database', () => {
  const store = Store.open(freshPath());
  const id = store.remember({ project: 'p', content: 'the key was sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' });
  assert.equal(store.get(id)?.content, 'the key was [redacted anthropic key]');
  store.close();
});

test('secrets never reach the model reading a transcript', async () => {
  let seen = '';
  const agent = {
    mcpReq: {
      requestSampling: async (params: { messages: { content: { text: string } }[] }) => {
        seen = params.messages.map((m) => m.content.text).join('\n');
        return { role: 'assistant', content: { type: 'text', text: '{"notes":[]}' } };
      },
    },
  };
  await extract('user: my key is ghp_abcdefghijklmnopqrstuvwxyz0123456789', { project: 'p', config: { providers: ['agent'] }, agent });
  assert.ok(seen.length > 0);
  assert.ok(!seen.includes('ghp_abc'));
});

test('the database is readable only by its owner', { skip: process.platform === 'win32' }, () => {
  const path = freshPath();
  Store.open(path).close();
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('a fresh database is stamped with the schema version', () => {
  const path = freshPath();
  Store.open(path).close();
  const db = new Database(path);
  assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
  db.close();
});

test('a database from before versioning upgrades and keeps its notes', () => {
  const path = freshPath();
  const store = Store.open(path);
  store.remember({ project: 'p', content: 'kept across the upgrade' });
  store.close();

  // Strip it back to exactly what v0.1.0 wrote: no uid, no deletions, no version.
  const db = new Database(path);
  db.exec('DROP INDEX notes_uid; ALTER TABLE notes DROP COLUMN uid; DROP TABLE deleted_notes;');
  db.pragma('user_version = 0');
  db.close();

  const reopened = Store.open(path);
  const [found] = reopened.search('upgrade');
  assert.ok(found, 'the note survived');
  assert.match(found.uid, /^[0-9a-f]{32}$/, 'and was given an id it can sync by');
  reopened.close();
});

test('a database from a newer version is refused, not damaged', () => {
  const path = freshPath();
  Store.open(path).close();
  const db = new Database(path);
  db.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
  db.close();
  assert.throws(() => Store.open(path), /newer secondmind/);
});
