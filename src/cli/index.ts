#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { DB_PATH } from '../config.js';
import { Store } from '../core/store.js';
import { NOTE_TYPES } from '../core/types.js';
import * as commands from './commands.js';
import { bold } from './render.js';

const HELP = `
${bold('secondmind')} — shared memory for your AI coding sessions

  secondmind init                     Set up, and show how to connect your AI tool
  secondmind remember "<what>"        Save something you want to know next time
  secondmind search "<what>"          Look for it later
  secondmind browse                   Interactive: filter, read and delete notes
  secondmind list                     Print the most recent notes
  secondmind compact <file|->         Read a session transcript and save what mattered
  secondmind forget <id>              Delete one note
  secondmind stats                    What's stored, and which model reads transcripts
  secondmind mcp                      Run the server your AI tool talks to

Options
  -p, --project <name>   Which project (default: the current git repository)
  -a, --all              Every project, not just this one
  -t, --type <type>      ${NOTE_TYPES.join(', ')}
  -n, --limit <n>        How many notes to show
  -s, --session <id>     Only notes from one session
  -k, --keywords <list>  Other words you might search for later, comma separated
  -r, --related <list>   Other projects this affects, comma separated

Everything is stored on your machine, in ${DB_PATH}
`.trim();

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string', short: 'p' },
      all: { type: 'boolean', short: 'a' },
      type: { type: 'string', short: 't' },
      limit: { type: 'string', short: 'n' },
      session: { type: 'string', short: 's' },
      keywords: { type: 'string', short: 'k' },
      related: { type: 'string', short: 'r' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const [command, ...rest] = positionals;
  if (!command || values.help || command === 'help') {
    console.log(HELP);
    return;
  }

  // The MCP server owns stdout for protocol traffic, so it runs before anything prints.
  if (command === 'mcp') {
    const { runStdio } = await import('../mcp/server.js');
    await runStdio();
    return;
  }

  const options: commands.CommandOptions = {
    project: values.project,
    type: values.type,
    limit: values.limit ? Number(values.limit) : undefined,
    session: values.session,
    keywords: values.keywords,
    related: values.related,
    all: values.all,
  };

  if (command === 'init') {
    Store.open().close();
    commands.init();
    return;
  }

  const store = Store.open();
  try {
    switch (command) {
      case 'remember': commands.remember(store, rest, options); return;
      case 'search': commands.search(store, rest, options); return;
      case 'list': commands.list(store, options); return;
      case 'browse': await commands.browseCommand(store, options); return;
      case 'compact': await commands.compact(store, rest[0] ?? '-', options); return;
      case 'forget': commands.forget(store, rest[0]); return;
      case 'stats': commands.stats(store); return;
      default: throw new Error(`Unknown command "${command}". Run secondmind --help.`);
    }
  } finally {
    store.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
