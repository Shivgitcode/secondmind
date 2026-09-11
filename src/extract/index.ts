import { type Config, type ProviderName, loadConfig } from '../config.js';
import type { ExtractedNote } from '../core/types.js';
import { type SamplingContext, agentSampler } from './agent.js';
import { anthropicSampler } from './anthropic.js';
import { openaiSampler } from './openai.js';
import { SYSTEM_PROMPT, parseNotes, userPrompt } from './prompt.js';
import { NoProviderError, SamplerUnavailableError, type Sampler } from './sampler.js';

export { NoProviderError, SamplerUnavailableError } from './sampler.js';
export type { SamplingContext } from './agent.js';

export interface ExtractOptions {
  project: string;
  config?: Config;
  /** MCP tool context, when extraction was triggered by an agent that may be able to sample. */
  agent?: SamplingContext;
}

export interface ExtractResult {
  notes: ExtractedNote[];
  /** Which model actually did the reading, for the caller to report. */
  via: string;
}

/** Every configured provider that can even be constructed, in preference order. */
export function buildSamplers(config: Config, agent?: SamplingContext): Sampler[] {
  const builders: Record<ProviderName, () => Sampler | null> = {
    agent: () => agentSampler(agent),
    anthropic: () => anthropicSampler(config),
    openai: () => openaiSampler(config),
  };

  return config.providers.flatMap((name) => {
    const sampler = builders[name]?.();
    return sampler ? [sampler] : [];
  });
}

/** The first provider that can be constructed. Throws when there is none. */
export function resolveSampler(config: Config, agent?: SamplingContext): Sampler {
  const [first] = buildSamplers(config, agent);
  if (!first) throw new NoProviderError(config.providers);
  return first;
}

/**
 * Read a transcript and return the notes worth keeping.
 *
 * Providers are tried in order. Only an "I cannot run" failure moves on to the
 * next one — a provider that ran and genuinely errored surfaces that error,
 * rather than silently spending money somewhere else.
 */
export async function extract(transcript: string, options: ExtractOptions): Promise<ExtractResult> {
  if (!transcript.trim()) return { notes: [], via: 'nothing to read' };

  const config = options.config ?? loadConfig();
  const samplers = buildSamplers(config, options.agent);
  const system = SYSTEM_PROMPT;
  const user = userPrompt(transcript, options.project);
  const unavailable: string[] = [];

  for (const sampler of samplers) {
    try {
      return { notes: parseNotes(await sampler.run(system, user)), via: sampler.describe };
    } catch (error) {
      if (error instanceof SamplerUnavailableError) {
        unavailable.push(error.message);
        continue;
      }
      throw error;
    }
  }

  throw new NoProviderError(config.providers, unavailable);
}
