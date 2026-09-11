import { SamplerUnavailableError, type Sampler } from './sampler.js';

const SAMPLING_TIMEOUT_MS = 120_000;

interface SamplingContent {
  type?: string;
  text?: string;
}

interface SamplingResult {
  content?: SamplingContent | SamplingContent[];
  model?: string;
}

/** The slice of an MCP tool-handler context we need. Kept structural so the SDK's own shape can move. */
export interface SamplingContext {
  mcpReq?: {
    requestSampling?: (
      params: {
        messages: { role: 'user' | 'assistant'; content: { type: 'text'; text: string } }[];
        systemPrompt?: string;
        maxTokens: number;
      },
      options?: { timeout?: number },
    ) => Promise<unknown>;
  };
}

function textOf(result: SamplingResult): string {
  const blocks = Array.isArray(result.content) ? result.content : [result.content];
  return blocks
    .filter((block): block is SamplingContent => Boolean(block) && block?.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n');
}

/**
 * Ask the coding agent to run the extraction on whatever model it already has
 * open. This is the only path that needs no API key of its own: a Cursor user
 * gets their model, a Gemini CLI user gets theirs.
 *
 * Only some clients implement sampling. The caller must confirm the client
 * DECLARED the capability before passing a context here: `requestSampling` is
 * present on every context regardless, so calling it blindly against a client
 * that cannot answer leaves the request hanging until it times out.
 *
 * ponytail: uses the 2025-era push-style `requestSampling`, which is what every
 * client negotiates today (2026-07-28 is typed in the SDK but not yet in
 * SUPPORTED_PROTOCOL_VERSIONS). When clients start negotiating that revision this
 * throws and the direct providers take over; the upgrade is to return
 * `inputRequired({inputRequests: {extract: inputRequired.createMessage(...)}})`
 * and read the reply back off `ctx.mcpReq.inputResponses`.
 */
export function agentSampler(ctx: SamplingContext | undefined): Sampler | null {
  const requestSampling = ctx?.mcpReq?.requestSampling;
  if (typeof requestSampling !== 'function') return null;

  return {
    name: 'agent',
    describe: "your coding agent's own model",
    async run(system, user) {
      const result = await requestSampling(
        {
          messages: [{ role: 'user', content: { type: 'text', text: user } }],
          systemPrompt: system,
          maxTokens: 8000,
        },
        // Reading a long transcript on someone else's model can be slow.
        { timeout: SAMPLING_TIMEOUT_MS },
      );
      const text = textOf((result ?? {}) as SamplingResult);
      if (!text.trim()) throw new SamplerUnavailableError('agent', 'the agent returned nothing');
      return text;
    },
  };
}
