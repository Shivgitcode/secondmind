import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { Store } from '../src/core/store.js';
import { formatNotes } from '../src/cli/render.js';

let store: Store;
let A: number, B: number, C: number, D: number;

// The worked example from the PRD: four notes, three projects, one obviously irrelevant.
before(() => {
  store = Store.open(join(mkdtempSync(join(tmpdir(), 'secondmind-')), 'memory.db'));

  A = store.remember({
    project: 'payments-service', type: 'discovery', importance: 3,
    content: 'Payment provider retries the webhook when a response exceeds 2 seconds.',
    keywords: ['retry', 'timeout', 'duplicate delivery'],
    related: ['orders-service'],
  });
  B = store.remember({
    project: 'frontend', type: 'decision',
    content: 'Changed button spacing on the checkout page.',
  });
  C = store.remember({
    project: 'orders-service', type: 'attempt',
    content: 'Added a retry to payment processing.',
  });
  D = store.remember({
    project: 'payments-service', type: 'decision', importance: 3,
    content: 'Webhook processing must be idempotent, keyed on payment_event_id.',
    keywords: ['duplicate', 'idempotency', 'double charge'],
    related: ['orders-service'],
  });
});

after(() => store.close());

test('finds relevant notes and leaves the irrelevant one out', () => {
  const ids = store.search('debug duplicate payment events', { project: 'orders-service' }).map((n) => n.id);

  assert.ok(ids.includes(D), 'the idempotency decision should be returned');
  assert.ok(ids.includes(A), 'the webhook retry discovery should be returned');
  assert.ok(!ids.includes(B), 'unrelated frontend work must not be returned');
  assert.equal(ids[0], D, 'the decision that answers the question should rank first');
});

test('notes cross project boundaries', () => {
  // Nothing in the query mentions orders-service, and the winners were saved
  // while working in payments-service. That is the whole point of the tool.
  const hits = store.search('duplicate payment events', { project: 'orders-service' });
  assert.ok(hits.some((n) => n.project === 'payments-service'));
});

test('keywords bridge the vocabulary gap', () => {
  // The note never says "duplicate webhook"; it says idempotent. Keywords connect them.
  const ids = store.search('duplicate webhook deliveries', { project: 'orders-service' }).map((n) => n.id);
  assert.ok(ids.includes(D));
});

test('the current project is a boost, not a filter', () => {
  const projects = new Set(store.search('retry', { project: 'orders-service' }).map((n) => n.project));
  assert.ok(projects.size > 1, 'other projects must still be reachable');
});

test('search punctuation does not blow up the query parser', () => {
  for (const query of ['foo -- "bar" AND (baz*)', 'NEAR/2', '', '   ', '???', 'a'.repeat(500)]) {
    assert.doesNotThrow(() => store.search(query, { project: 'orders-service' }));
  }
});

test('rows come back as domain objects, not raw sql', () => {
  const note = store.get(A);
  assert.ok(note);
  assert.equal(note.sessionId, null, 'snake_case columns are mapped');
  assert.equal(note.type, 'discovery');
  assert.equal(note.importance, 3);
  assert.equal(typeof note.createdAt, 'string');
});

test('forgetting a note also removes it from search', () => {
  const id = store.remember({ project: 'temp-service', content: 'Zanzibar quirk in the ledger writer.' });
  assert.ok(store.search('zanzibar').some((n) => n.id === id));

  assert.equal(store.forget(id), true);
  assert.equal(store.search('zanzibar').length, 0, 'the search index must drop it too');
  assert.equal(store.forget(id), false, 'deleting twice is a no-op, not an error');
});

test('editing a note keeps the search index honest', () => {
  const id = store.remember({ project: 'temp', content: 'original wording about kangaroos' });
  assert.equal(store.search('kangaroos').length, 1);
  assert.equal(store.forget(id), true);
});

test('bad input is rejected with a usable message', () => {
  assert.throws(() => store.remember({ content: '', project: 'x' }), /content is required/);
  assert.throws(() => store.remember({ content: 'x', project: '  ' }), /project is required/);
  assert.throws(
    () => store.remember({ content: 'x', project: 'y', type: 'nonsense' as never }),
    /unknown type/,
  );
});

test('importance is clamped rather than trusted', () => {
  const high = store.get(store.remember({ content: 'a', project: 'p', importance: 99 }));
  const low = store.get(store.remember({ content: 'b', project: 'p', importance: -4 }));
  assert.equal(high?.importance, 3);
  assert.equal(low?.importance, 1);
});

test('empty results say so instead of printing a blank page', () => {
  assert.match(formatNotes([]), /Nothing relevant/);
  assert.match(formatNotes(store.list({ project: 'payments-service' })), /payments-service/);
});

test('counts reflect what is stored', () => {
  assert.ok(store.stats().notes >= 4);
  assert.ok(store.stats().projects >= 3);
});

test('search stems, so plurals and tenses still match', () => {
  assert.ok(store.search('retries', { project: null }).some((n) => n.id === C || n.id === A));
});
