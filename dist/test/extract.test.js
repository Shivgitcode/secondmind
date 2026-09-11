import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoProviderError, extract, resolveSampler } from '../src/extract/index.js';
import { parseNotes } from '../src/extract/prompt.js';
const REPLY = JSON.stringify({
    notes: [{
            type: 'discovery',
            content: 'warehouse-service returns available_quantity, checkout expects quantity',
            keywords: ['inventory', 'mismatch'],
            files: ['checkout/src/stock.ts'],
            related_projects: ['checkout-service'],
            importance: 3,
        }],
});
/** A stand-in for a coding agent that supports MCP sampling. */
const fakeAgent = (reply) => ({
    mcpReq: {
        requestSampling: async () => ({ role: 'assistant', content: { type: 'text', text: reply } }),
    },
});
test('clean JSON parses into notes', () => {
    const [note] = parseNotes(REPLY);
    assert.equal(note?.type, 'discovery');
    assert.equal(note?.importance, 3);
    assert.deepEqual(note?.relatedProjects, ['checkout-service']);
});
test('JSON wrapped in prose or a code fence still parses', () => {
    // An agent's own model has no structured-output guarantee, so this is the normal case.
    assert.equal(parseNotes('Sure! Here you go:\n```json\n' + REPLY + '\n```\nHope that helps.').length, 1);
});
test('unusable replies fail loudly, empty ones quietly', () => {
    assert.throws(() => parseNotes('{ not json at all }'), /did not return usable JSON/);
    assert.equal(parseNotes('I could not find anything.').length, 0);
    assert.equal(parseNotes('{"notes":[]}').length, 0);
});
test('junk inside a note is repaired rather than stored wrong', () => {
    const [note] = parseNotes(JSON.stringify({
        notes: [{ type: 'not-a-type', content: '  spaced  ', keywords: 'nope', importance: 47 }],
    }));
    assert.equal(note?.type, 'discovery', 'unknown types fall back');
    assert.equal(note?.content, 'spaced');
    assert.deepEqual(note?.keywords, [], 'a string where an array belongs becomes empty');
    assert.equal(note?.importance, 2, 'out-of-range importance falls back');
});
test('notes with no content are dropped', () => {
    assert.equal(parseNotes(JSON.stringify({ notes: [{ content: '   ' }, { content: 'real' }] })).length, 1);
});
test('the agent is asked before any provider that needs a key', () => {
    const config = { providers: ['agent', 'anthropic', 'openai'] };
    assert.equal(resolveSampler(config, fakeAgent('')).name, 'agent');
});
test('a client without sampling falls through to a configured provider', () => {
    const config = { providers: ['agent', 'openai'], apiKeyEnv: 'TEST_KEY_FOR_SECONDMIND', model: 'm' };
    process.env['TEST_KEY_FOR_SECONDMIND'] = 'sk-test';
    try {
        assert.equal(resolveSampler(config, { mcpReq: {} }).name, 'openai');
    }
    finally {
        delete process.env['TEST_KEY_FOR_SECONDMIND'];
    }
});
test('a local endpoint needs no key at all', () => {
    const config = { providers: ['openai'], baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' };
    assert.equal(resolveSampler(config).name, 'openai');
});
test('no agent and no credentials gives an actionable error', () => {
    const config = { providers: ['agent', 'openai'], apiKeyEnv: 'DEFINITELY_UNSET_KEY' };
    assert.throws(() => resolveSampler(config), NoProviderError);
    assert.throws(() => resolveSampler(config), /ANTHROPIC_API_KEY|OPENAI_API_KEY/);
});
test('end to end: an agent-sampled transcript becomes notes, with no API key', async () => {
    const result = await extract('user: inventory checks keep failing\nassistant: field name mismatch', {
        project: 'inventory-service',
        config: { providers: ['agent'] },
        agent: fakeAgent(REPLY),
    });
    assert.equal(result.notes.length, 1);
    assert.match(result.via, /coding agent/);
    assert.equal(result.notes[0]?.content, 'warehouse-service returns available_quantity, checkout expects quantity');
});
test('an empty transcript never reaches a provider', async () => {
    const result = await extract('   ', { project: 'p', config: { providers: [] } });
    assert.deepEqual(result.notes, []);
});
test('a provider that cannot authenticate hands over to the next one', async () => {
    const config = { providers: ['agent', 'openai'], baseUrl: 'http://localhost:1/v1', model: 'm' };
    const result = await extract('user: something happened', {
        project: 'p',
        config,
        // This agent answers, so the unreachable openai endpoint is never touched.
        agent: fakeAgent(REPLY),
    });
    assert.equal(result.notes.length, 1);
});
test('an agent that answers with nothing falls through instead of losing the session', async () => {
    const silent = { mcpReq: { requestSampling: async () => ({ role: 'assistant', content: { type: 'text', text: '' } }) } };
    await assert.rejects(extract('user: something', { project: 'p', config: { providers: ['agent'] }, agent: silent }), /No way to read the transcript[\s\S]*agent: the agent returned nothing/);
});
test('a real provider error is surfaced, not swallowed by a fallback', async () => {
    const broken = {
        mcpReq: {
            requestSampling: async () => { throw new Error('client exploded'); },
        },
    };
    await assert.rejects(extract('user: something', { project: 'p', config: { providers: ['agent'] }, agent: broken }), /client exploded/);
});
//# sourceMappingURL=extract.test.js.map