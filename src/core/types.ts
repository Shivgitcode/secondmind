export const NOTE_TYPES = [
  'discovery', 'problem', 'hypothesis', 'attempt', 'result',
  'decision', 'blocker', 'next_step', 'relevant_file', 'dependency',
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

/** 1 minor · 2 useful · 3 would change how someone approaches the problem. */
export type Importance = 1 | 2 | 3;

/** How a note got here. Something you wrote yourself outranks something inferred. */
export type NoteSource = 'saved' | 'extracted';

export interface Note {
  id: number;
  content: string;
  type: NoteType;
  project: string;
  sessionId: string | null;
  /** Other words this note should be findable by. Space separated. */
  keywords: string;
  files: string;
  /** Other projects this note is relevant to. Space separated. */
  related: string;
  importance: Importance;
  source: NoteSource;
  createdAt: string;
}

export interface NewNote {
  content: string;
  project: string;
  type?: NoteType;
  sessionId?: string | null;
  keywords?: string | string[];
  files?: string | string[];
  related?: string | string[];
  importance?: number;
  source?: NoteSource;
}

export interface ScoredNote extends Note {
  score: number;
}

export interface SearchOptions {
  /** Ranking boost, never a filter — cross-project recall is the point. */
  project?: string | null;
  limit?: number;
}

export interface ListOptions {
  project?: string | null;
  session?: string | null;
  limit?: number;
}

/** What an extractor pulls out of a transcript, before it becomes a Note. */
export interface ExtractedNote {
  type: NoteType;
  content: string;
  keywords: string[];
  files: string[];
  relatedProjects: string[];
  importance: Importance;
}

export function isNoteType(value: unknown): value is NoteType {
  return typeof value === 'string' && (NOTE_TYPES as readonly string[]).includes(value);
}
