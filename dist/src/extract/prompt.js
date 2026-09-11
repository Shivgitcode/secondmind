import { NOTE_TYPES, isNoteType } from '../core/types.js';
export const SYSTEM_PROMPT = `You read a transcript of a developer working with an AI coding assistant and pull out
the few things that would be genuinely useful to a DIFFERENT session, days later, possibly in a
different repository.

Keep:
- what the actual problem was
- what was discovered about how the system behaves
- what was tried and did NOT work (this saves the most time later)
- decisions made and why
- unresolved questions and the obvious next step
- files and services that turned out to matter

Drop everything else: pleasantries, restated code, tool output, anything the repository already says.

Rules:
- Each note must stand on its own. "It was the serializer" is useless later; name the service.
- Do not merge a guess with a fact. Use type "hypothesis" for a guess, "discovery" for something confirmed.
- keywords: alternative words someone might search for later, including synonyms for the concept.
  If the note is about duplicate deliveries, include "idempotency". This is how the note gets found.
- related_projects: other repos/services this note is relevant to, if any.
- importance: 3 = would change how someone approaches the problem, 2 = useful, 1 = minor.
- Prefer 3-8 notes. If nothing is worth keeping, return an empty list.

Reply with JSON only, in this shape:
{"notes":[{"type":"<one of: ${NOTE_TYPES.join('|')}>","content":"...","keywords":["..."],"files":["..."],"related_projects":["..."],"importance":1}]}`;
/** JSON Schema for providers that can constrain output. Mirrors the prompt above. */
export const OUTPUT_SCHEMA = {
    type: 'object',
    properties: {
        notes: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: [...NOTE_TYPES] },
                    content: { type: 'string' },
                    keywords: { type: 'array', items: { type: 'string' } },
                    files: { type: 'array', items: { type: 'string' } },
                    related_projects: { type: 'array', items: { type: 'string' } },
                    importance: { type: 'integer', enum: [1, 2, 3] },
                },
                required: ['type', 'content', 'keywords', 'files', 'related_projects', 'importance'],
                additionalProperties: false,
            },
        },
    },
    required: ['notes'],
    additionalProperties: false,
};
export function userPrompt(transcript, project) {
    return `Current project: ${project}\n\nTranscript:\n\n${transcript}`;
}
const asStrings = (value) => Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
/**
 * Parse a model's reply into notes.
 *
 * Providers that support constrained output hand back clean JSON. Sampling
 * through a coding agent does not — whatever model is behind it may wrap the
 * JSON in prose or a code fence — so find the JSON object rather than trusting
 * the whole reply to be one.
 */
export function parseNotes(reply) {
    const start = reply.indexOf('{');
    const end = reply.lastIndexOf('}');
    if (start === -1 || end <= start)
        return [];
    let parsed;
    try {
        parsed = JSON.parse(reply.slice(start, end + 1));
    }
    catch {
        throw new Error('The model did not return usable JSON.');
    }
    const notes = parsed.notes;
    if (!Array.isArray(notes))
        return [];
    return notes.flatMap((raw) => {
        const note = raw;
        const content = typeof note['content'] === 'string' ? note['content'].trim() : '';
        if (!content)
            return [];
        const importance = Number(note['importance']);
        return [{
                type: isNoteType(note['type']) ? note['type'] : 'discovery',
                content,
                keywords: asStrings(note['keywords']),
                files: asStrings(note['files']),
                relatedProjects: asStrings(note['related_projects']),
                importance: importance === 1 || importance === 3 ? importance : 2,
            }];
    });
}
//# sourceMappingURL=prompt.js.map