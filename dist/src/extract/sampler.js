/**
 * Thrown by a provider that turns out not to be usable — no credentials, a
 * rejected key, a client that cannot sample. Only this error makes the caller
 * move on to the next provider; anything else is a real failure worth showing.
 */
export class SamplerUnavailableError extends Error {
    provider;
    reason;
    constructor(provider, reason) {
        super(`${provider}: ${reason}`);
        this.provider = provider;
        this.reason = reason;
        this.name = 'SamplerUnavailableError';
    }
}
export class NoProviderError extends Error {
    constructor(tried, failures = []) {
        super(`No way to read the transcript. Tried: ${tried.join(', ')}.`
            + (failures.length > 0 ? `\n  ${failures.join('\n  ')}` : '') + '\n\n'
            + 'Either use a coding agent that supports MCP sampling, or set one of:\n'
            + '  ANTHROPIC_API_KEY=...                      (Claude)\n'
            + '  OPENAI_API_KEY=... SECONDMIND_MODEL=...    (OpenAI)\n'
            + '  SECONDMIND_BASE_URL=... SECONDMIND_MODEL=...  (Gemini, OpenRouter, Ollama, local)\n\n'
            + 'Saving and searching notes never need any of this.');
        this.name = 'NoProviderError';
    }
}
//# sourceMappingURL=sampler.js.map