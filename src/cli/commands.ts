import { CONFIG_PATH, DB_PATH, loadConfig } from '../config.js';
import { VERSION } from '../version.js';
import { detectProject } from '../core/project.js';
import type { Store } from '../core/store.js';
import { type NoteType, isNoteType } from '../core/types.js';
import { readTranscript } from '../core/transcript.js';
import { readExport, syncFolder, toMarkdown, writePrivate } from '../core/sync.js';
import { extract } from '../extract/index.js';
import { autoSaveEnabled, installSkill, setAutoSave } from './auto.js';
import { browse } from './browse.js';
import { bold, dim, formatNotes } from './render.js';

export interface CommandOptions {
  project?: string | undefined;
  type?: string | undefined;
  limit?: number | undefined;
  session?: string | undefined;
  keywords?: string | undefined;
  related?: string | undefined;
  all?: boolean | undefined;
  format?: string | undefined;
}

const asList = (value: string | undefined): string[] =>
  (value ?? '').split(',').map((part) => part.trim()).filter(Boolean);

export function init(): void {
  console.log(`Ready. Your notes live in ${DB_PATH} and never leave this machine.

${bold('Connect your AI coding tool')} — pick the line for the one you use:

  Claude Code    claude mcp add secondmind -- secondmind mcp

  Anything else  add this to its MCP settings file:

                 {
                   "mcpServers": {
                     "secondmind": { "command": "secondmind", "args": ["mcp"] }
                   }
                 }

Then just work as usual. Your assistant can look up what past sessions found,
and save new findings as it goes.

${bold('Reading whole transcripts')} is optional. secondmind will ask your coding
agent's own model to do it, so it usually needs no key at all. If your agent
does not support that, point it at a local model:

  SECONDMIND_BASE_URL=http://localhost:11434/v1 SECONDMIND_MODEL=llama3.2

Cloud providers are off until you name one, so a key in your environment never
sends a transcript anywhere by surprise:

  SECONDMIND_PROVIDER=anthropic ANTHROPIC_API_KEY=...                  Claude
  SECONDMIND_PROVIDER=openai    OPENAI_API_KEY=... SECONDMIND_MODEL=...  OpenAI, OpenRouter, Gemini

Saving and searching notes never need any of this.
Provider order can be pinned in ${CONFIG_PATH}.

You are in project "${detectProject().name}". Try:  secondmind remember "something worth knowing"`);

  if (autoSaveEnabled()) {
    const installed = installSkill();
    console.log(`
${bold('Automatic saving is on')} — your assistant saves findings as it works, without being asked.
${installed ? 'Installed the Claude Code skill that teaches it when. ' : ''}Turn it off with: secondmind auto off`);
  }
}

export function auto(words: string[]): void {
  const [choice] = words;
  if (choice !== 'on' && choice !== 'off') {
    console.log(`Automatic saving is ${bold(autoSaveEnabled() ? 'on' : 'off')}. Change it with: secondmind auto on|off`);
    return;
  }

  const state = setAutoSave(choice === 'on');
  const skill = {
    installed: `Claude Code skill installed at ${state.path}`,
    removed: 'Claude Code skill removed.',
    'no claude code': 'Claude Code not found, so no skill was installed — other agents follow the setting anyway.',
  }[state.skill];

  console.log(state.autoSave
    ? `Automatic saving is ${bold('on')}. Your assistant will save findings as it works.`
    : `Automatic saving is ${bold('off')}. Your assistant will only save when you ask it to.`);
  console.log(`${skill}\n${dim('Takes effect in your next session.')}`);
}

export function exportCommand(store: Store, file: string | undefined, options: CommandOptions): void {
  const format = options.format ?? (file?.endsWith('.md') ? 'md' : 'json');
  if (format !== 'json' && format !== 'md') throw new Error(`Unknown format "${format}". Use json or md.`);

  const data = store.exportAll();
  const text = format === 'md' ? toMarkdown(data) : `${JSON.stringify(data, null, 2)}\n`;
  if (!file || file === '-') {
    process.stdout.write(text);
    return;
  }
  writePrivate(file, text);
  console.log(`Exported ${plural(data.notes.length, 'note')} to ${file}`);
}

export function importCommand(store: Store, file: string | undefined): void {
  if (!file) throw new Error('Import what? Try: secondmind import notes.json');
  const { added, skipped, deleted } = store.importAll(readExport(file));
  console.log(`Imported ${plural(added, 'note')}`
    + dim(` (${skipped} already here${deleted > 0 ? `, ${deleted} deleted elsewhere` : ''})`));
}

export function sync(store: Store, dir: string | undefined): void {
  const folder = dir ?? process.env['SECONDMIND_SYNC_DIR'];
  if (!folder) throw new Error('Sync with which folder? Try: secondmind sync ~/Sync/secondmind');

  const result = syncFolder(store, folder);
  const from = result.from.length > 0 ? `from ${result.from.join(', ')}` : 'no other machines yet';
  console.log(`Synced: ${plural(result.added, 'new note')}${result.deleted > 0 ? `, ${result.deleted} deleted` : ''} ${dim(`(${from})`)}`);
  console.log(dim(`This machine's notes: ${result.file}`));
  if (result.unreadable.length > 0) console.log(dim(`Skipped unreadable: ${result.unreadable.join(', ')}`));
}

export function remember(store: Store, words: string[], options: CommandOptions): void {
  const content = words.join(' ');
  if (!content) throw new Error('Nothing to remember. Try: secondmind remember "what you learned"');

  const type: NoteType = options.type && isNoteType(options.type) ? options.type : 'discovery';
  if (options.type && !isNoteType(options.type)) throw new Error(`Unknown type "${options.type}".`);

  const id = store.remember({
    content,
    type,
    project: options.project ?? detectProject().name,
    keywords: asList(options.keywords),
    related: asList(options.related),
  });
  console.log(`Saved note ${id} to "${options.project ?? detectProject().name}".`);
}

export function search(store: Store, words: string[], options: CommandOptions): void {
  const query = words.join(' ');
  if (!query) throw new Error('Nothing to search for. Try: secondmind search "payment timeout"');

  const project = options.all ? null : (options.project ?? detectProject().name);
  console.log(formatNotes(store.search(query, { project, limit: options.limit ?? 6 })));
}

export function list(store: Store, options: CommandOptions): void {
  console.log(formatNotes(
    store.list({
      project: options.project ?? null,
      session: options.session ?? null,
      limit: options.limit ?? 20,
    }),
    { heading: 'Recent notes' },
  ));
}

export async function compact(store: Store, source: string, options: CommandOptions): Promise<void> {
  const project = options.project ?? detectProject().name;
  const { notes, via } = await extract(readTranscript(source), { project, config: loadConfig() });

  if (notes.length === 0) {
    console.log('Nothing in that session looked worth keeping.');
    return;
  }

  for (const note of notes) {
    store.remember({
      content: note.content, type: note.type, project,
      keywords: note.keywords, files: note.files, related: note.relatedProjects,
      importance: note.importance, source: 'extracted',
    });
  }

  console.log(`Saved ${plural(notes.length, 'note')} to "${project}" ${dim(`(read by ${via})`)}\n`);
  for (const note of notes) console.log(`  ${note.type}: ${note.content}`);
}

export function forget(store: Store, raw: string | undefined): void {
  const id = Number(raw);
  if (!Number.isInteger(id)) throw new Error('Which note? Try: secondmind forget 12');
  console.log(store.forget(id) ? `Deleted note ${id}.` : `No note ${id}.`);
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function stats(store: Store): void {
  const { notes, projects } = store.stats();
  const config = loadConfig();
  console.log(`secondmind ${VERSION}
${plural(notes, 'note')} across ${plural(projects, 'project')}
${DB_PATH}
provider order: ${config.providers.join(' → ')}
cloud providers: ${config.allowRemote ? 'allowed' : 'off (local and your agent only)'}
automatic saving: ${config.autoSave !== false ? 'on' : 'off'}`);
}

export function browseCommand(store: Store, options: CommandOptions): Promise<void> {
  if (!process.stdin.isTTY) throw new Error('browse needs an interactive terminal. Use `secondmind list` instead.');
  return browse(store, options.all ? null : (options.project ?? detectProject().name));
}
