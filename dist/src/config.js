import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export const HOME = process.env['SECONDMIND_HOME'] ?? join(homedir(), '.secondmind');
export const DB_PATH = join(HOME, 'memory.db');
export const CONFIG_PATH = join(HOME, 'config.json');
const DEFAULTS = { providers: ['agent', 'anthropic', 'openai'] };
function fromFile() {
    try {
        return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    }
    catch {
        return {}; // no config file is the normal case
    }
}
function fromEnv() {
    const env = process.env;
    const provider = env['SECONDMIND_PROVIDER'];
    return {
        ...(provider ? { providers: provider.split(',').map((p) => p.trim()) } : {}),
        ...(env['SECONDMIND_MODEL'] ? { model: env['SECONDMIND_MODEL'] } : {}),
        ...(env['SECONDMIND_BASE_URL'] ? { baseUrl: env['SECONDMIND_BASE_URL'] } : {}),
        ...(env['SECONDMIND_API_KEY_ENV'] ? { apiKeyEnv: env['SECONDMIND_API_KEY_ENV'] } : {}),
    };
}
/** File overrides defaults, environment overrides file. */
export function loadConfig() {
    return { ...DEFAULTS, ...fromFile(), ...fromEnv() };
}
//# sourceMappingURL=config.js.map