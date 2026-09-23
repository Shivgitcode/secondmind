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
      + 'Either use a coding agent that supports MCP sampling, or run a local model:\n'
      + '  SECONDMIND_BASE_URL=http://localhost:11434/v1 SECONDMIND_MODEL=llama3.2   (Ollama, LM Studio, vLLM)\n\n'
      + 'Cloud providers are off by default. To send transcripts to one, name it:\n'
      + '  SECONDMIND_PROVIDER=anthropic ANTHROPIC_API_KEY=...                       (Claude)\n'
      + '  SECONDMIND_PROVIDER=openai OPENAI_API_KEY=... SECONDMIND_MODEL=...        (OpenAI, OpenRouter, Gemini)\n\n'
      + 'Saving and searching notes never need any of this.',
    );
    this.name = 'NoProviderError';
  }
}
