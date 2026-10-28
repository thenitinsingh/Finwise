// Tests the real AiService against a stubbed Gemini HTTP endpoint (no network, no key needed).
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { AiService, geminiRequestTarget } from '../src/ai/aiService.js';
import { loadConfig } from '../src/config.js';
import { OutOfScopeError } from '../src/errors.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const service = () => new AiService(loadConfig({ AI_API_KEY: 'test-key-123', AI_MODEL: '' }));
const gemini = (obj, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] } : obj), { status });

describe('AiService → Gemini', () => {
  it('defaults to gemini-3.8-flash and sends the key in a header, image as inline data', async () => {
    let call;
    globalThis.fetch = async (url, init) => {
      call = { url, init, body: JSON.parse(init.body) };
      return gemini({ is_financial_document: true, transactions: [{ merchant: 'A', amount: 1 }], notes: ['n'] });
    };
    const out = await service().extractStatement(null, Buffer.from('img'), 'image/png');
    assert.match(call.url, /models\/gemini-3\.8-flash:generateContent$/);
    assert.ok(!call.url.includes('test-key-123'));
    assert.equal(call.init.headers['x-goog-api-key'], 'test-key-123');
    assert.equal(call.body.contents[0].parts[0].inlineData.mimeType, 'image/png');
    assert.equal(call.body.contents[0].parts[0].inlineData.data, Buffer.from('img').toString('base64'));
    assert.equal(call.body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(out.notes, ['n']);
    assert.equal(out.transactions.length, 1);
  });

  it('rejects non-financial documents with OutOfScopeError', async () => {
    globalThis.fetch = async () => gemini({ is_financial_document: false, rejection_reason: 'a photo of a dog', transactions: [], notes: [] });
    await assert.rejects(service().extractStatement(null, Buffer.from('x'), 'image/jpeg'), (e) => e instanceof OutOfScopeError && /dog/.test(e.message));
  });

  it('chat: out-of-scope → OutOfScopeError, in-scope → reply, history starts with a user turn', async () => {
    let body;
    globalThis.fetch = async (url, init) => ((body = JSON.parse(init.body)), gemini({ in_scope: true, reply: ' Spend less. ' }));
    const out = await service().chat({
      message: 'q',
      history: [{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }],
      context: { x: 1 },
    });
    assert.equal(out.reply, 'Spend less.');
    assert.equal(body.contents[0].role, 'user');
    assert.ok(body.contents.at(-1).parts[0].text.includes('<finance_context>'));

    globalThis.fetch = async () => gemini({ in_scope: false, reply: 'Only finance, please.' });
    await assert.rejects(service().chat({ message: 'poem', context: {} }), (e) => e instanceof OutOfScopeError && e.message === 'Only finance, please.');
  });

  it('maps API errors to helpful messages and retries a 503 once', async () => {
    let calls = 0;
    globalThis.fetch = async () => (++calls === 1 ? gemini({ error: { message: 'overloaded' } }, 503) : gemini({ is_financial_document: true, transactions: [], notes: [] }));
    await service().extractStatement('x');
    assert.equal(calls, 2);

    globalThis.fetch = async () => gemini({ error: { message: 'API key not valid. Please pass a valid API key.' } }, 400);
    await assert.rejects(service().extractStatement('x'), /rejected the API key/);
    globalThis.fetch = async () => gemini({ error: { message: 'models/foo is not found' } }, 404);
    await assert.rejects(service().extractStatement('x'), /Gemini says: models\/foo is not found/);
  });

  it('AQ. and AIza keys both go to the Gemini API address with the key in a header', () => {
    for (const key of ['AQ.abc', 'AIzaXYZ']) {
      const target = geminiRequestTarget(key, 'gemini-3.8-flash');
      assert.equal(target.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
      assert.equal(target.headers['x-goog-api-key'], key);
    }
  });
});

describe('speed settings', () => {
  it('asks for low thinking, and drops the setting if the model rejects it', async () => {
    const bodies = [];
    globalThis.fetch = async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return bodies.length === 1
        ? gemini({ error: { message: 'Thinking level is not supported for this model' } }, 400)
        : gemini({ is_financial_document: true, transactions: [], notes: [] });
    };
    await service().extractStatement('x');
    assert.equal(bodies[0].generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
  });

  it('does not retry a timeout', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    };
    await assert.rejects(service().extractStatement('x'), /took too long/);
    assert.equal(calls, 1);
  });
});
