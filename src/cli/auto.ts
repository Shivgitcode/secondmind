import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { loadConfig, saveConfig } from '../config.js';
import { writePrivate } from '../core/sync.js';
import { skill } from '../mcp/guidance.js';

/** Where Claude Code looks for personal skills. */
export function claudeSkillPath(): string {
  const base = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');
  return join(base, 'skills', 'secondmind', 'SKILL.md');
}

export interface AutoState {
  autoSave: boolean;
  skill: 'installed' | 'removed' | 'no claude code';
  path: string;
}

/** Install the skill if Claude Code is on this machine. Never creates ~/.claude itself. */
export function installSkill(path = claudeSkillPath()): boolean {
  const claudeDir = dirname(dirname(dirname(path)));
  if (!existsSync(claudeDir)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writePrivate(path, skill());
  return true;
}

/**
 * Keep an installed skill in step with this version's guidance, so upgrading
 * secondmind is enough — no need to rerun init. Never installs one that isn't
 * there: a missing skill means the user turned it off or never had Claude Code.
 */
export function refreshSkill(path = claudeSkillPath()): boolean {
  try {
    if (!existsSync(path) || readFileSync(path, 'utf8') === skill()) return false;
    writePrivate(path, skill());
    return true;
  } catch {
    return false; // a stale skill is not worth failing the server over
  }
}

export function removeSkill(path = claudeSkillPath()): void {
  rmSync(dirname(path), { recursive: true, force: true });
}

/**
 * One switch for every agent: the config flag changes what the MCP server tells
 * each client at connect time, and the skill is added or removed for Claude Code.
 */
export function setAutoSave(on: boolean, path = claudeSkillPath()): AutoState {
  saveConfig({ autoSave: on });
  if (on) return { autoSave: true, skill: installSkill(path) ? 'installed' : 'no claude code', path };
  removeSkill(path);
  return { autoSave: false, skill: 'removed', path };
}

export function autoSaveEnabled(): boolean {
  return loadConfig().autoSave !== false;
}
