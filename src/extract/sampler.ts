import type { ProviderName } from '../config.js';

/**
 * Everything an extractor needs from a model: given a system prompt and a user
 * prompt, come back with text. Keeping the seam this narrow is what lets the
 * same extraction run against Claude, an OpenAI-compatible endpoint, or the
 * model your coding agent already has open.
 */
export interface Sampler {
  readonly name: ProviderName;
  readonly describe: string;
  run(system: string, user: string): Promise<string>;
}

/**
 * Thrown by a provider that turns out not to be usable — no credentials, a
 * rejected key, a client that cannot sample. Only this error makes the caller
 * move on to the next provider; anything else is a real failure worth showing.
 */
export class SamplerUnavailableError extends Error {
  constructor(public readonly provider: ProviderName, public readonly reason: string) {
    super(`${provider}: ${reason}`);
    this.name = 'SamplerUnavailableError';
  }
}

export class NoProviderError extends Error {
  constructor(tried: string[], failures: string[] = []) {
    super(
      `No way to read the transcript. Tried: ${tried.join(', ')}.`
      + (failures.length > 0 ? `\n  ${failures.join('\n  ')}` : '') + '\n\n'
      + 'Either use a coding agent that supports MCP sampling, or set one of:\n'
      + '  ANTHROPIC_API_KEY=...                      (Claude)\n'
      + '  OPENAI_API_KEY=... SECONDMIND_MODEL=...    (OpenAI)\n'
      + '  SECONDMIND_BASE_URL=... SECONDMIND_MODEL=...  (Gemini, OpenRouter, Ollama, local)\n\n'
      + 'Saving and searching notes never need any of this.',
    );
    this.name = 'NoProviderError';
  }
}
