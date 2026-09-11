import assert from 'node:assert/strict';
import { test } from 'node:test';

import { flatten } from '../src/core/transcript.js';

test('plain text transcripts pass through unchanged', () => {
  const raw = 'User: the API times out\nAgent: the downstream service takes 1.8s';
  assert.equal(flatten(raw), raw);
});

test('JSON-lines session logs flatten to readable text', () => {
  const jsonl = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'the API times out' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'thinking', thinking: 'ignore me' },
      { type: 'text', text: 'the downstream service takes 1.8s' },
    ] } }),
    JSON.stringify({ type: 'summary', summary: 'no message field, skipped' }),
  ].join('\n');

  assert.equal(flatten(jsonl), 'user: the API times out\n\nassistant: the downstream service takes 1.8s');
});

test('half-JSON input falls back to plain text rather than losing content', () => {
  const raw = '{"message":{"role":"user","content":"hi"}}\nthis line is not json';
  assert.equal(flatten(raw), raw);
});

test('JSON lines carrying no usable messages fall back rather than returning nothing', () => {
  const raw = JSON.stringify({ type: 'meta', version: 3 });
  assert.equal(flatten(raw), raw);
});

test('malformed content blocks are skipped, not crashed on', () => {
  const jsonl = JSON.stringify({
    message: { role: 'assistant', content: [null, 42, { type: 'text' }, { type: 'text', text: 'kept' }] },
  });
  assert.equal(flatten(jsonl), 'assistant: kept');
});
