import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type RankInput, filterNotes, score, toFtsQuery } from '../src/core/ranking.js';

const NOW = Date.parse('2026-09-10T00:00:00.000Z');

function note(overrides: Partial<RankInput> = {}): RankInput {
  return {
    id: 1, content: 'x', type: 'discovery', project: 'payments-service', sessionId: null,
    keywords: '', files: '', related: '', importance: 2, source: 'extracted',
    createdAt: new Date(NOW).toISOString(), bm25: -1,
    ...overrides,
  };
}

test('a better text match scores higher', () => {
  assert.ok(score(note({ bm25: -5 }), null, NOW) > score(note({ bm25: -1 }), null, NOW));
});

test('the current project is boosted, and so is one that names it', () => {
  const base = score(note({ project: 'other' }), 'orders-service', NOW);
  const same = score(note({ project: 'orders-service' }), 'orders-service', NOW);
  const related = score(note({ project: 'other', related: 'orders-service billing' }), 'orders-service', NOW);

  assert.ok(same > related, 'the note from this project should win');
  assert.ok(related > base, 'a note that names this project should still be lifted');
});

test('a related-project match is exact, not a substring', () => {
  // "orders" must not match "orders-service-v2" and quietly inflate the score.
  const spurious = score(note({ project: 'other', related: 'orders-service-v2' }), 'orders', NOW);
  assert.equal(spurious, score(note({ project: 'other' }), 'orders', NOW));
});

test('importance and hand-written notes rank up', () => {
  assert.ok(score(note({ importance: 3 }), null, NOW) > score(note({ importance: 1 }), null, NOW));
  assert.ok(score(note({ source: 'saved' }), null, NOW) > score(note({ source: 'extracted' }), null, NOW));
});

test('old notes fade but do not vanish', () => {
  const old = note({ createdAt: new Date(NOW - 365 * 86_400_000).toISOString() });
  const fresh = note();
  assert.ok(score(old, null, NOW) < score(fresh, null, NOW));
  assert.ok(score(old, null, NOW) > 0, 'age must not zero a note out');
});

test('a clock skewed into the future does not invert ranking', () => {
  const future = note({ createdAt: new Date(NOW + 10 * 86_400_000).toISOString() });
  assert.ok(score(future, null, NOW) <= score(note(), null, NOW) * 1.0001);
});

test('query text is escaped into safe FTS terms', () => {
  assert.equal(toFtsQuery('duplicate payment'), '"duplicate" OR "payment"');
  assert.equal(toFtsQuery('foo -- "bar" AND (baz*)'), '"foo" OR "bar" OR "AND" OR "baz"');
  assert.equal(toFtsQuery('   '), null);
  assert.equal(toFtsQuery('???'), null);
});

test('the interactive filter matches half-typed words', () => {
  // Why this is substring matching and not FTS: the porter stemmer indexes
  // "pay" as "pai", so an FTS prefix query for "pay" misses "payment" entirely.
  const notes = [
    note({ id: 1, project: 'orders', content: 'Webhook must be idempotent', keywords: 'duplicate payment' }),
    note({ id: 2, project: 'frontend', content: 'Changed button spacing', keywords: '' }),
  ];

  assert.deepEqual(filterNotes(notes, 'pay').map((n) => n.id), [1]);
  assert.deepEqual(filterNotes(notes, 'idempot').map((n) => n.id), [1]);
  assert.deepEqual(filterNotes(notes, 'PAY').map((n) => n.id), [1], 'case insensitive');
  assert.deepEqual(filterNotes(notes, '').map((n) => n.id), [1, 2], 'empty query keeps everything');
});

test('the filter also matches on project name', () => {
  const notes = [note({ id: 1, project: 'payments-service' }), note({ id: 2, project: 'frontend' })];
  assert.deepEqual(filterNotes(notes, 'payments').map((n) => n.id), [1]);
});

test('the filter requires every word typed, not just one', () => {
  const notes = [
    note({ id: 1, project: 'orders', content: 'duplicate webhook deliveries' }),
    note({ id: 2, project: 'billing', content: 'duplicate invoice rows' }),
  ];
  assert.deepEqual(filterNotes(notes, 'duplicate webhook').map((n) => n.id), [1]);
  assert.deepEqual(filterNotes(notes, 'duplicate').map((n) => n.id), [1, 2]);
});
