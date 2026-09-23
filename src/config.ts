import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const HOME = process.env['SECONDMIND_HOME'] ?? join(homedir(), '.secondmind');
export const DB_PATH = join(HOME, 'memory.db');
export const CONFIG_PATH = join(HOME, 'config.json');

/**
 * Which model reads your transcripts.
 *
 * `agent` asks whatever model your coding assistant already runs, so nothing
 * needs an API key — but only some clients support it. `anthropic` and
 * `openai` call a provider directly; `openai` means any OpenAI-compatible
 * endpoint, which covers OpenAI, Gemini, OpenRouter, Ollama and local servers.
 */
export type ProviderName = 'agent' | 'anthropic' | 'openai';

export interface Config {
  /** Ordered list of what to try. First one that can run, wins. */
  providers: ProviderName[];
  model?: string;
  /** For OpenAI-compatible endpoints. Defaults to OpenAI itself. */
  baseUrl?: string;
  /** Which environment variable holds the key. Defaults per provider. */
  apiKeyEnv?: string;
  /**
   * Whether a transcript may be sent to a remote host. Off unless you name the
   * providers yourself, so an API key that happens to be in your environment
   * never ships a session off the machine by surprise.
   */
  allowRemote?: boolean;
  /**
   * Whether your assistant saves findings as it works, without being asked.
   * On by default; `secondmind auto off` turns it off.
   */
  autoSave?: boolean;
}

/** Your agent's own model, then a local OpenAI-compatible server if you set one. */
const DEFAULTS: Config = { providers: ['agent', 'openai'], allowRemote: false, autoSave: true };

function fromFile(path = CONFIG_PATH): Partial<Config> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Partial<Config>;
  } catch {
    return {}; // no config file is the normal case
  }
}

/** Change some settings in the config file, leaving everything else as it was. */
export function saveConfig(changes: Partial<Config>, path = CONFIG_PATH): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ ...fromFile(path), ...changes }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

function fromEnv(): Partial<Config> {
  const env = process.env;
  const provider = env['SECONDMIND_PROVIDER'];
  return {
    ...(provider ? { providers: provider.split(',').map((p) => p.trim()) as ProviderName[] } : {}),
    ...(env['SECONDMIND_MODEL'] ? { model: env['SECONDMIND_MODEL'] } : {}),
    ...(env['SECONDMIND_BASE_URL'] ? { baseUrl: env['SECONDMIND_BASE_URL'] } : {}),
    ...(env['SECONDMIND_API_KEY_ENV'] ? { apiKeyEnv: env['SECONDMIND_API_KEY_ENV'] } : {}),
  };
}

/** File overrides defaults, environment overrides file. */
export function loadConfig(): Config {
  const file = fromFile();
  const env = fromEnv();
  const merged: Config = { ...DEFAULTS, ...file, ...env };
  // Naming the providers is the opt-in to the cloud; defaults never are.
  merged.allowRemote = file.allowRemote ?? Boolean(file.providers ?? env.providers);
  return merged;
}
