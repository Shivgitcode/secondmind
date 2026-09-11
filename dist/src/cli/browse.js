import { emitKeypressEvents } from 'node:readline';
import { filterNotes } from '../core/ranking.js';
import { ago, bold, dim, invert, truncate } from './render.js';
const ALT_SCREEN_ON = '\x1b[?1049h\x1b[?25l';
const ALT_SCREEN_OFF = '\x1b[?1049l\x1b[?25h';
const CLEAR = '\x1b[2J\x1b[H';
/** Rows the header and footer take, so the list knows how much room it has. */
const CHROME_ROWS = 5;
const ROWS_PER_NOTE = 3;
/**
 * Interactive note browser. Type to filter, arrow keys to move, Enter to read
 * one in full, then `d` to delete it. Delete only exists in the expanded view:
 * in the list every printable key goes into the filter, and Ctrl+D is EOF on a
 * terminal — neither is a safe home for something destructive.
 *
 * ponytail: raw ANSI and node:readline keypress events rather than a TUI
 * framework — one screen with one list does not need a render tree. If this
 * grows panes or mouse support, that is the point to reach for a library.
 */
export function browse(store, initialProject) {
    const out = process.stdout;
    const width = () => Math.max(40, out.columns || 80);
    const visibleNotes = () => Math.max(1, Math.floor(((out.rows || 24) - CHROME_ROWS) / ROWS_PER_NOTE));
    const state = { query: '', notes: [], selected: 0, expanded: false, pendingDelete: false, status: '' };
    // Load once, filter in memory: a personal note collection is small, and this
    // keeps every keystroke instant.
    const all = store.list({ project: initialProject, limit: 5000 });
    const refresh = () => {
        state.notes = filterNotes(all, state.query);
        state.selected = Math.min(state.selected, Math.max(0, state.notes.length - 1));
    };
    const render = () => {
        const w = width();
        const lines = [];
        const scope = initialProject ? ` in ${initialProject}` : '';
        lines.push(bold(` secondmind${scope}`));
        lines.push(` search: ${state.query}${dim('▌')}${' '.repeat(Math.max(1, w - 20 - state.query.length))}${dim(`${state.notes.length} notes`)}`);
        lines.push(dim(' '.padEnd(w, '─')));
        if (state.notes.length === 0) {
            lines.push('', dim(state.query ? '  no notes match that' : '  nothing saved yet'));
        }
        else if (state.expanded) {
            const note = state.notes[state.selected];
            if (note) {
                lines.push('');
                lines.push(` ${bold(note.type)} · ${note.project} · ${dim(ago(note.createdAt))}`);
                lines.push('');
                for (const line of wrap(note.content, w - 3))
                    lines.push(`  ${line}`);
                if (note.files)
                    lines.push('', dim(`  files: ${note.files}`));
                if (note.related)
                    lines.push(dim(`  also relevant to: ${note.related}`));
                if (note.keywords)
                    lines.push(dim(`  keywords: ${note.keywords}`));
            }
        }
        else {
            const window = visibleNotes();
            const start = Math.max(0, Math.min(state.selected - Math.floor(window / 2), state.notes.length - window));
            for (const [offset, note] of state.notes.slice(start, start + window).entries()) {
                const index = start + offset;
                const chosen = index === state.selected;
                const meta = `${note.type.padEnd(12)} ${note.project.padEnd(20).slice(0, 20)} ${ago(note.createdAt)}`;
                lines.push(chosen ? invert(` ▸ ${truncate(meta, w - 4)}`) : dim(`   ${truncate(meta, w - 4)}`));
                lines.push(`   ${truncate(note.content, w - 5)}`);
                lines.push('');
            }
        }
        const help = state.pendingDelete
            ? bold('delete this note? y to confirm, any other key to cancel')
            : state.expanded
                ? '↑↓ move   ⏎ back to list   d delete   esc quit'
                : '↑↓ move   ⏎ expand   esc quit   (type to filter)';
        out.write(CLEAR + lines.join('\n') + `\n${dim(' '.padEnd(w, '─'))}\n ${dim(help)}`);
        if (state.status)
            out.write(`   ${state.status}`);
    };
    refresh();
    render();
    return new Promise((resolve) => {
        emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY)
            process.stdin.setRawMode(true);
        process.stdin.resume();
        const finish = () => {
            process.stdin.off('keypress', onKey);
            process.stdin.off('end', finish);
            if (process.stdin.isTTY)
                process.stdin.setRawMode(false);
            process.stdin.pause();
            out.write(ALT_SCREEN_OFF);
            resolve();
        };
        const onKey = (chunk, key = {}) => {
            state.status = '';
            const quit = key.name === 'escape' || (key.ctrl && (key.name === 'c' || key.name === 'd'));
            if (quit)
                return finish();
            if (key.name === 'up')
                state.selected = Math.max(0, state.selected - 1);
            else if (key.name === 'down')
                state.selected = Math.min(state.notes.length - 1, state.selected + 1);
            else if (key.name === 'return' || key.name === 'enter') {
                state.expanded = !state.expanded && state.notes.length > 0;
                state.pendingDelete = false;
            }
            else if (key.name === 'backspace') {
                state.query = state.query.slice(0, -1);
                refresh();
            }
            else if (state.expanded && key.name === 'd') {
                state.pendingDelete = true;
            }
            else if (state.expanded && state.pendingDelete && key.name === 'y') {
                const note = state.notes[state.selected];
                if (note) {
                    store.forget(note.id);
                    const index = all.findIndex((candidate) => candidate.id === note.id);
                    if (index >= 0)
                        all.splice(index, 1);
                    state.status = dim(`deleted note ${note.id}`);
                }
                state.pendingDelete = false;
                state.expanded = false;
                refresh();
            }
            else if (!state.expanded && chunk && !key.ctrl && chunk.length === 1 && chunk >= ' ') {
                state.query += chunk;
                refresh();
            }
            else {
                state.pendingDelete = false;
            }
            render();
        };
        out.write(ALT_SCREEN_ON);
        render();
        process.stdin.on('keypress', onKey);
        process.stdin.once('end', finish);
    });
}
function wrap(text, width) {
    const lines = [];
    let current = '';
    for (const word of text.split(/\s+/)) {
        if (current && current.length + word.length + 1 > width) {
            lines.push(current);
            current = word;
        }
        else {
            current = current ? `${current} ${word}` : word;
        }
    }
    if (current)
        lines.push(current);
    return lines;
}
//# sourceMappingURL=browse.js.map