import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
}

const DEFAULTS: Config = { providers: ['agent', 'anthropic', 'openai'] };

function fromFile(): Partial<Config> {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<Config>;
  } catch {
    return {}; // no config file is the normal case
  }
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
  return { ...DEFAULTS, ...fromFile(), ...fromEnv() };
}
