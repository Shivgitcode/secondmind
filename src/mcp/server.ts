import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { loadConfig } from '../config.js';
import { Store } from '../core/store.js';
import { detectProject } from '../core/project.js';
import { NOTE_TYPES, type NoteType } from '../core/types.js';
import { type SamplingContext, extract } from '../extract/index.js';
import { formatNotes } from '../cli/render.js';

/**
 * Handed to the client at connect time and shown to its model. Without this an
 * agent sees three tools it has no reason to reach for: asked "what do you know
 * about X" it describes the tools instead of searching them.
 */
const INSTRUCTIONS = `secondmind is this user's memory of their past coding sessions, across every repository they work in.

Call search_context at the START of any debugging, investigation, or "why does X happen" task, and before asking the user to explain background. The answer is often already there from a session in a different repo. Do this without being asked.

Call remember_context as soon as you confirm something worth knowing months from now:
- a discovery about how the system actually behaves
- an approach that did NOT work (this saves the most time later)
- a decision and the reason for it
- an unresolved question and the obvious next step

Save the finding, not the conversation, and write it so it stands alone — "it was the serializer" is useless later; name the service. Always fill in keywords (other words someone might search for, including synonyms for the concept) and related_projects (other services affected). A note saved without keywords may never be found again.`;

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const fail = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] });

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function buildServer(store: Store = Store.open()): McpServer {
  const server = new McpServer(
    { name: 'secondmind', version: '0.1.0' },
    { capabilities: { tools: {} }, enforceStrictCapabilities: true, instructions: INSTRUCTIONS },
  );
  const here = () => detectProject().name;

  /** Whether this client told us at startup that it can run completions for us. */
  const clientCanSample = () => Boolean(server.server.getClientCapabilities()?.sampling);

  server.registerTool(
    'search_context',
    {
      description:
        'Search what was learned in earlier coding sessions — including sessions in other repositories. '
        + 'Call this at the start of any debugging or investigation task, before asking the user to explain background. '
        + 'Omit the query to see the most recent notes for this project instead.',
      inputSchema: fromJsonSchema<{ query?: string; project?: string; limit?: number }>({
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What you are working on right now, in plain words.' },
          project: { type: 'string', description: 'Current project. Defaults to the current git repository.' },
          limit: { type: 'integer', description: 'Max notes to return (default 6).' },
        },
      }),
    },
    async ({ query, project, limit }) => {
      const name = project ?? here();
      const max = limit ?? 6;
      return query?.trim()
        ? ok(formatNotes(store.search(query, { project: name, limit: max })))
        : ok(formatNotes(store.list({ project: name, limit: max }), { heading: `Recent notes for ${name}` }));
    },
  );

  server.registerTool(
    'remember_context',
    {
      description:
        'Save something worth knowing in a future session: a discovery, a decision, a dead end, or an open question. '
        + 'Save the finding, not the conversation. Include other affected services in related_projects.',
      inputSchema: fromJsonSchema<{
        content: string; type?: NoteType; project?: string;
        keywords?: string[]; files?: string[]; related_projects?: string[]; importance?: number;
      }>({
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The finding, stated so it stands alone months later.' },
          type: { type: 'string', enum: [...NOTE_TYPES], description: 'Default "discovery".' },
          project: { type: 'string', description: 'Defaults to the current git repository.' },
          keywords: { type: 'array', items: { type: 'string' }, description: 'Other words someone might search for.' },
          files: { type: 'array', items: { type: 'string' } },
          related_projects: { type: 'array', items: { type: 'string' } },
          importance: { type: 'integer', description: '1 minor, 2 useful, 3 changes the approach. Default 2.' },
        },
        required: ['content'],
      }),
    },
    async (args) => {
      try {
        const id = store.remember({
          content: args.content,
          type: args.type ?? 'discovery',
          project: args.project ?? here(),
          keywords: args.keywords ?? [],
          files: args.files ?? [],
          related: args.related_projects ?? [],
          importance: args.importance ?? 2,
        });
        return ok(`Saved as note ${id}.`);
      } catch (error) {
        return fail(message(error));
      }
    },
  );

  server.registerTool(
    'save_session',
    {
      description:
        'Hand over the session transcript at the end of a piece of work. Pulls out the findings, '
        + 'failed attempts and open questions, and stores them for future sessions.',
      inputSchema: fromJsonSchema<{ transcript: string; project?: string; session_id?: string }>({
        type: 'object',
        properties: {
          transcript: { type: 'string', description: 'The conversation, or a written summary of it.' },
          project: { type: 'string' },
          session_id: { type: 'string' },
        },
        required: ['transcript'],
      }),
    },
    // The second argument is the MCP request context. If this client supports
    // sampling we read the transcript with its model and nobody needs an API key.
    async ({ transcript, project, session_id: sessionId }, ctx) => {
      const name = project ?? here();
      try {
        const { notes, via } = await extract(transcript, {
          project: name,
          config: loadConfig(),
          agent: clientCanSample() ? (ctx as SamplingContext) : undefined,
        });

        for (const note of notes) {
          store.remember({
            content: note.content, type: note.type, project: name, sessionId: sessionId ?? null,
            keywords: note.keywords, files: note.files, related: note.relatedProjects,
            importance: note.importance, source: 'extracted',
          });
        }

        return ok(notes.length > 0
          ? `Saved ${notes.length} note${notes.length === 1 ? '' : 's'} (read by ${via}):\n\n${notes.map((n) => `- ${n.type}: ${n.content}`).join('\n')}`
          : 'Nothing in this session looked worth keeping.');
      } catch (error) {
        return fail(message(error));
      }
    },
  );

  return server;
}

/**
 * Serve MCP on stdin/stdout until the client hangs up. Nothing may be written to
 * stdout but protocol traffic, so diagnostics go to stderr.
 */
export function runStdio(): Promise<void> {
  const store = Store.open();
  const handle = serveStdio(() => buildServer(store));

  return new Promise<void>((resolve) => {
    const shutdown = () => { void handle.close().finally(() => { store.close(); resolve(); }); };
    process.stdin.once('end', shutdown);
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
