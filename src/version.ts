import { readFileSync } from 'node:fs';

/** Read from package.json, which ships in every install, so it can never drift. */
export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
