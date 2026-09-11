import type { Config } from '../config.js';
import { SamplerUnavailableError, type Sampler } from './sampler.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/**
 * Any endpoint that speaks the OpenAI chat-completions shape: OpenAI itself,
 * Gemini's compatibility layer, OpenRouter, Ollama, vLLM, LM Studio.
 *
 * A key is only required when talking to a remote host — local servers such as
 * Ollama accept requests without one.
 */
export function openaiSampler(config: Config): Sampler | null {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = config.model ?? DEFAULT_MODEL;
  const apiKey = process.env[config.apiKeyEnv ?? 'OPENAI_API_KEY'];

  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(baseUrl);
  if (!apiKey && !isLocal) return null;

  return {
    name: 'openai',
    describe: `${model} at ${baseUrl}`,
    async run(system, user) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_object' },
        }),
      });

      const body = (await response.json().catch(() => ({}))) as ChatResponse;
      if (response.status === 401 || response.status === 403) {
        throw new SamplerUnavailableError('openai', `${baseUrl} rejected the key`);
      }
      if (!response.ok) {
        throw new Error(`${baseUrl} returned ${response.status}: ${body.error?.message ?? response.statusText}`);
      }
      return body.choices?.[0]?.message?.content ?? '';
    },
  };
}
