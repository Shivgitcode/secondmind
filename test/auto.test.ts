import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Settings are read from SECONDMIND_HOME when the modules load, so point it at a
// scratch directory first and import afterwards.
const scratch = mkdtempSync(join(tmpdir(), 'secondmind-'));
process.env['SECONDMIND_HOME'] = join(scratch, 'home');
const { loadConfig } = await import('../src/config.js');
const { setAutoSave } = await import('../src/cli/auto.js');
const { instructions, skill } = await import('../src/mcp/guidance.js');

test('automatic saving is on unless you turn it off', () => {
  assert.equal(loadConfig().autoSave, true);
});

test('the toggle is remembered and leaves other settings alone', () => {
  const claude = join(scratch, 'claude');
  mkdirSync(claude);
  const path = join(claude, 'skills', 'secondmind', 'SKILL.md');

  setAutoSave(false, path);
  assert.equal(loadConfig().autoSave, false);
  assert.equal(loadConfig().allowRemote, false, 'turning auto-save off must not opt anyone into the cloud');

  const on = setAutoSave(true, path);
  assert.equal(on.skill, 'installed');
  assert.equal(loadConfig().autoSave, true);
  assert.match(readFileSync(path, 'utf8'), /^---\nname: secondmind\ndescription: /);

  setAutoSave(false, path);
  assert.ok(!existsSync(path), 'off removes the skill');
});

test('no skill is forced onto a machine without Claude Code', () => {
  const path = join(scratch, 'nothing-here', 'skills', 'secondmind', 'SKILL.md');
  assert.equal(setAutoSave(true, path).skill, 'no claude code');
  assert.ok(!existsSync(join(scratch, 'nothing-here')));
});

test('every agent is told the same thing the skill says', () => {
  assert.match(instructions(true), /without waiting to be asked/);
  assert.match(instructions(false), /turned automatic saving OFF/);
  assert.doesNotMatch(instructions(false), /without waiting to be asked/);
  assert.ok(skill().includes(instructions(true)));
  // Searching stays automatic either way — reading your own notes costs nothing.
  assert.match(instructions(false), /Call search_context at the START/);
});

test('agents are told to widen their searches, whether or not auto-save is on', () => {
  for (const text of [instructions(true), instructions(false), skill()]) {
    assert.match(text, /matches words, not meaning/);
    assert.match(text, /synonyms/);
  }
});
