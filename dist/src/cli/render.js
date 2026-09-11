const useColor = process.stdout.isTTY === true && !process.env['NO_COLOR'];
export const dim = (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s);
export const bold = (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s);
export const invert = (s) => (useColor ? `\x1b[7m${s}\x1b[0m` : s);
export function ago(iso) {
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
    if (days <= 0)
        return 'today';
    if (days === 1)
        return 'yesterday';
    if (days < 30)
        return `${days} days ago`;
    const months = Math.round(days / 30);
    return months === 1 ? 'last month' : `${months} months ago`;
}
export function truncate(text, width) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length <= width ? flat : `${flat.slice(0, Math.max(0, width - 1))}…`;
}
/**
 * Render notes as a compact block. Deliberately short: dumping a wall of history
 * into a new session costs the same attention the tool is meant to save.
 */
export function formatNotes(notes, options = {}) {
    if (notes.length === 0)
        return 'Nothing relevant found in previous sessions.';
    const heading = options.heading ?? 'From your previous sessions';
    const body = notes.map((note) => {
        const lines = [dim(`[${note.id}] ${note.type} · ${note.project} · ${ago(note.createdAt)}`), note.content];
        if (note.files)
            lines.push(dim(`    files: ${note.files}`));
        if (note.related)
            lines.push(dim(`    also relevant to: ${note.related}`));
        return lines.join('\n');
    });
    return `${heading}:\n\n${body.join('\n\n')}`;
}
//# sourceMappingURL=render.js.map