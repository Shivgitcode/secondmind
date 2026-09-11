import { readFileSync } from 'node:fs';
/** Read a transcript from a file, or from stdin when given "-". */
export function readTranscript(source) {
    return flatten(source === '-' ? readFileSync(0, 'utf8') : readFileSync(source, 'utf8'));
}
/**
 * Some agents (Claude Code among them) log sessions as JSON lines. Flatten those
 * to plain text; anything else is already plain text and passes straight through.
 */
export function flatten(raw) {
    const lines = raw.split('\n').filter((line) => line.trim());
    const messages = [];
    for (const line of lines) {
        let entry;
        try {
            entry = JSON.parse(line);
        }
        catch {
            return raw; // not JSON lines — treat the whole thing as plain text
        }
        const message = entry?.message;
        if (typeof message?.role !== 'string')
            continue;
        const content = typeof message.content === 'string'
            ? message.content
            : (Array.isArray(message.content) ? message.content : [])
                .filter((block) => typeof block === 'object' && block !== null
                && block.type === 'text'
                && typeof block.text === 'string')
                .map((block) => block.text)
                .join('\n');
        if (content.trim())
            messages.push(`${message.role}: ${content.trim()}`);
    }
    return messages.length > 0 ? messages.join('\n\n') : raw;
}
//# sourceMappingURL=transcript.js.map