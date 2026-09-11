export const NOTE_TYPES = [
    'discovery', 'problem', 'hypothesis', 'attempt', 'result',
    'decision', 'blocker', 'next_step', 'relevant_file', 'dependency',
];
export function isNoteType(value) {
    return typeof value === 'string' && NOTE_TYPES.includes(value);
}
//# sourceMappingURL=types.js.map