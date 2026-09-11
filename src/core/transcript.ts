import { readFileSync } from 'node:fs';

interface LoggedMessage {
  role?: unknown;
  content?: unknown;
}

/** Read a transcript from a file, or from stdin when given "-". */
export function readTranscript(source: string): string {
  return flatten(source === '-' ? readFileSync(0, 'utf8') : readFileSync(source, 'utf8'));
}

/**
 * Some agents (Claude Code among them) log sessions as JSON lines. Flatten those
 * to plain text; anything else is already plain text and passes straight through.
 */
export function flatten(raw: string): string {
  const lines = raw.split('\n').filter((line) => line.trim());
  const messages: string[] = [];

  for (const line of lines) {
    let entry: { message?: LoggedMessage } | undefined;
    try {
      entry = JSON.parse(line) as { message?: LoggedMessage };
    } catch {
      return raw; // not JSON lines — treat the whole thing as plain text
    }

    const message = entry?.message;
    if (typeof message?.role !== 'string') continue;

    const content = typeof message.content === 'string'
      ? message.content
      : (Array.isArray(message.content) ? message.content : [])
          .filter((block): block is { type: 'text'; text: string } =>
            typeof block === 'object' && block !== null
            && (block as { type?: unknown }).type === 'text'
            && typeof (block as { text?: unknown }).text === 'string')
          .map((block) => block.text)
          .join('\n');

    if (content.trim()) messages.push(`${message.role}: ${content.trim()}`);
  }

  return messages.length > 0 ? messages.join('\n\n') : raw;
}
