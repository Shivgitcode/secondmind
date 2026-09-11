/**
 * How much a note's score decays with age. At this many days old a note is
 * worth half what it was — long enough that last month's debugging still
 * surfaces, short enough that a reversed decision fades.
 */
const HALF_LIFE_DAYS = 120;
const SAME_PROJECT = 1.6;
const RELATED_PROJECT = 1.4;
const HAND_WRITTEN = 1.15;
/**
 * Turn a text-match score into a relevance score.
 *
 * The current project is a boost rather than a filter on purpose: a discovery
 * made in payments-service has to be able to surface while you are working in
 * orders-service, which is the entire point of the tool.
 */
export function score(note, project, now = Date.now()) {
    let value = -note.bm25;
    if (project) {
        if (note.project === project)
            value *= SAME_PROJECT;
        else if (note.related.split(/\s+/).includes(project))
            value *= RELATED_PROJECT;
    }
    value *= 1 + 0.25 * (note.importance - 2);
    if (note.source === 'saved')
        value *= HAND_WRITTEN;
    const ageDays = (now - Date.parse(note.createdAt)) / 86_400_000;
    value *= 1 / (1 + Math.max(0, ageDays) / HALF_LIFE_DAYS);
    return value;
}
export function rank(notes, project, limit) {
    const now = Date.now();
    return notes
        .map(({ bm25: _bm25, ...note }) => ({ ...note, score: score({ ...note, bm25: _bm25 }, project, now) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
/**
 * Turn free text into an FTS5 query. Every word becomes an OR term so a partial
 * overlap still matches, and bm25 sorts out which hits were actually good.
 * Quoting each term stops FTS5 operators in user input from being parsed.
 */
export function toFtsQuery(text) {
    const terms = text.match(/[\p{L}\p{N}_]+/gu) ?? [];
    return terms.length > 0 ? terms.map((term) => `"${term}"`).join(' OR ') : null;
}
/**
 * Narrow an already-loaded set of notes to those containing every word typed,
 * anywhere in their text. This is what the interactive filter uses instead of
 * search: a half-typed "pay" has to reach "payments" immediately, and FTS5
 * prefix queries cannot do that through the porter stemmer, which indexes
 * "pay" as "pai". Plain substring matching is also what a filter box means.
 */
export function filterNotes(notes, query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return notes;
    return notes.filter((note) => {
        const haystack = `${note.content} ${note.keywords} ${note.project} ${note.type} ${note.related}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
    });
}
//# sourceMappingURL=ranking.js.map