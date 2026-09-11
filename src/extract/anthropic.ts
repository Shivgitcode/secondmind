import Anthropic from '@anthropic-ai/sdk';

import type { Config } from '../config.js';
import { OUTPUT_SCHEMA } from './prompt.js';
import { SamplerUnavailableError, type Sampler } from './sampler.js';

const DEFAULT_MODEL = 'claude-opus-5';

/**
 * Claude via the official SDK.
 *
 * Credentials resolve lazily — the SDK accepts ANTHROPIC_API_KEY,
 * ANTHROPIC_AUTH_TOKEN and `ant auth login` profiles, and only finds out which
 * on the first request. So availability is reported when the call is made, not
 * when the client is built.
 */
export function anthropicSampler(config: Config): Sampler | null {
  let client: Anthropic;
  try {
    client = new Anthropic();
  } catch {
    return null;
  }

  const model = config.model ?? DEFAULT_MODEL;

  return {
    name: 'anthropic',
    describe: `Claude (${model})`,
    async run(system, user) {
      const response = await client.messages.create({
        model,
        max_tokens: 8000,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA }, effort: 'medium' },
      }).catch((error: unknown) => {
        if (error instanceof Anthropic.AuthenticationError) {
          throw new SamplerUnavailableError('anthropic', 'the API key was rejected');
        }
        if (error instanceof Error && /resolve authentication|api[_ ]?key/i.test(error.message)) {
          throw new SamplerUnavailableError('anthropic', 'no credentials found');
        }
        throw error;
      });

      if (response.stop_reason === 'refusal') {
        throw new Error(`Claude declined to process this transcript (${response.stop_details?.category ?? 'unknown'}).`);
      }

      const text = response.content.find((block) => block.type === 'text');
      return text?.type === 'text' ? text.text : '';
    },
  };
}
