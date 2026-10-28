// API tests in offline / demo mode (no AI key). Covers spec AC3, AC4, AC8–AC16,
// scenario S2 and edge cases E1–E5, E7–E8, E14–E17.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app.js';
import { AiService } from '../src/ai/aiService.js';
import { loadConfig } from '../src/config.js';
import { getSampleTransactions } from '../src/data/sampleTransactions.js';

const demoConfig = loadConfig({ CLIENT_ORIGIN: 'http://localhost:5173' }); // no AI key

async function startServer(config = demoConfig, options = {}) {
  const app = createApp(config, options);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { server, base };
}

const postJson = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function extractForm({ text, file }) {
  const form = new FormData();
  if (text !== undefined) form.append('text', text);
  if (file) form.append('file', new Blob([file.content], { type: file.type }), file.name);
  return form;
}

describe('API (demo mode, no AI key)', () => {
  let server;
  let base;

  before(async () => {
    ({ server, base } = await startServer());
  });
  after(() => server.close());

  it('AC3 — GET /api/health reports ai_configured false', async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok', ai_configured: false });
  });

  it('AC4 — GET /api/sample returns the 14 fictional USD transactions', async () => {
    const res = await fetch(`${base}/sample`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.transactions.length, 14);
    assert.equal(body.currency, 'USD');
    assert.equal(body.source, 'fictional workshop sample');
  });

  describe('sample audit → approval', () => {
    let session;

    before(async () => {
      const res = await postJson(`${base}/audits`, { transactions: getSampleTransactions() });
      assert.equal(res.status, 200);
      session = await res.json();
    });

    it('AC8 — awaiting_approval after 3 steps with exactly one StreamBox finding', () => {
      assert.equal(session.status, 'awaiting_approval');
      assert.equal(session.steps, 3);
      assert.equal(session.goal, 'Audit my transactions for subscription traps and silent price hikes.');
      assert.deepEqual(session.findings, [
        {
          merchant: 'StreamBox Premium',
          old_amount: 37.69,
          new_amount: 49,
          change_pct: 30,
          date: '2026-08-03',
          monthly_increase: 11.31,
        },
      ]);
      assert.match(session.session_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('AC9 — pending action has annual_cost 588, a grounded draft and sent=false', () => {
      const action = session.pending_action;
      assert.equal(action.type, 'review_subscription_change');
      assert.equal(action.annual_cost, 588);
      assert.equal(action.sent, false);
      for (const amount of ['$37.69', '$49.00', '$11.31']) assert.ok(action.draft.includes(amount));
    });

    it('AC10 — trace order', () => {
      const trace = session.audit_log.map((entry) =>
        entry.type === 'plan' ? `plan(${entry.details.tool})` : entry.type,
      );
      assert.deepEqual(trace, [
        'started',
        'plan(detect_stealth_hikes)',
        'tool',
        'plan(calculate_annual_leakage)',
        'tool',
        'plan(generate_cancellation_script)',
        'tool',
        'approval_required',
      ]);
      for (const entry of session.audit_log) {
        assert.ok(!Number.isNaN(Date.parse(entry.time)) && entry.time.endsWith('Z'), 'UTC ISO-8601 time');
      }
      assert.deepEqual(session.audit_log[0].details, { transaction_count: 14 });
      assert.deepEqual(session.audit_log[4].details, {
        merchant: 'StreamBox Premium',
        monthly_amount: 49,
        annual_cost: 588,
      });
    });

    it('AC11 — summary text', () => {
      assert.equal(
        session.summary,
        'StreamBox Premium increased from $37.69 to $49.00 (+30.0%). Current annualized cost: $588.00.',
      );
    });

    it('F9 — GET /api/audits/:id returns the stored session', async () => {
      const res = await fetch(`${base}/audits/${session.session_id}`);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).status, 'awaiting_approval');
    });

    it('AC12/AC13 — approve records a simulation, a second approval is 409', async () => {
      const res = await postJson(`${base}/audits/${session.session_id}/approval`, {
        decision: 'approve',
        reason: 'Looks right',
      });
      assert.equal(res.status, 200);
      const approved = await res.json();
      assert.equal(approved.status, 'done');
      assert.equal(approved.pending_action.approved, true);
      assert.equal(approved.pending_action.sent, false);
      assert.equal(
        approved.pending_action.simulated_execution,
        'Approved and recorded locally; no external message was sent.',
      );
      const last = approved.audit_log.at(-1);
      assert.equal(last.type, 'approved_simulation');
      assert.deepEqual(last.details, { merchant: 'StreamBox Premium', reason: 'Looks right' });
      assert.ok(approved.summary.endsWith('Demo action approved and simulated; no message was sent.'));

      const again = await postJson(`${base}/audits/${session.session_id}/approval`, { decision: 'approve' });
      assert.equal(again.status, 409);
      assert.deepEqual(await again.json(), { detail: 'This audit has no pending approval.' });
    });
  });

  it('AC12 — reject records the decision and sends nothing', async () => {
    const started = await (await postJson(`${base}/audits`, { transactions: getSampleTransactions() })).json();
    const res = await postJson(`${base}/audits/${started.session_id}/approval`, { decision: 'reject' });
    const rejected = await res.json();
    assert.equal(res.status, 200);
    assert.equal(rejected.status, 'done');
    assert.equal(rejected.pending_action.approved, false);
    assert.equal(rejected.pending_action.sent, false);
    assert.equal(rejected.audit_log.at(-1).type, 'rejected');
    assert.equal(rejected.audit_log.at(-1).message, 'Human rejected the proposed action. Nothing was sent.');
    assert.ok(rejected.summary.endsWith('Proposed action rejected; nothing was sent.'));
  });

  it('AC13 — approval for an unknown session is 404', async () => {
    const res = await postJson(`${base}/audits/${crypto.randomUUID()}/approval`, { decision: 'approve' });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { detail: 'Audit session not found. Start a new audit.' });
  });

  it('E20 — GET for an unknown session is 404', async () => {
    const res = await fetch(`${base}/audits/${crypto.randomUUID()}`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { detail: 'Audit session not found.' });
  });

  it('approval with an invalid decision is 400', async () => {
    const started = await (await postJson(`${base}/audits`, { transactions: getSampleTransactions() })).json();
    const res = await postJson(`${base}/audits/${started.session_id}/approval`, { decision: 'send_it' });
    assert.equal(res.status, 400);
  });

  it('S2/E13 — no hike: status done, no findings, no pending action', async () => {
    const spotify = getSampleTransactions().filter((t) => t.merchant === 'Spotify');
    const session = await (await postJson(`${base}/audits`, { transactions: spotify })).json();
    assert.equal(session.status, 'done');
    assert.deepEqual(session.findings, []);
    assert.equal(session.pending_action, null);
    assert.equal(session.summary, 'No subscription price hikes above 10% were found in the provided data.');
    assert.equal(session.audit_log.at(-1).type, 'completed');
  });

  it('AC16/E12 — empty transaction list is 400', async () => {
    const res = await postJson(`${base}/audits`, { transactions: [] });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { detail: 'Add transactions before starting an audit.' });
  });

  it('audit with an invalid transaction is 400', async () => {
    const res = await postJson(`${base}/audits`, { transactions: [{ merchant: '', amount: 'ten' }] });
    assert.equal(res.status, 400);
    assert.ok((await res.json()).detail.includes('transactions.0'));
  });

  it('AC14/E6 — extract with text but no key is 503', async () => {
    const res = await fetch(`${base}/extract`, { method: 'POST', body: extractForm({ text: '2026-09-14 TST* SPOTIFY USA 11.99' }) });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), {
      detail: 'AI is not configured. Add AI_API_KEY to server/.env and restart the server.',
    });
  });

  it('AC15/E1 — extract with no inputs is 400', async () => {
    const res = await fetch(`${base}/extract`, { method: 'POST', body: extractForm({ text: '   ' }) });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { detail: 'Paste transaction text or choose a file.' });
  });

  it('AC15/E3 — a 13 MB file is 413', async () => {
    const big = new Uint8Array(13 * 1024 * 1024);
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      body: extractForm({ file: { content: big, type: 'application/pdf', name: 'big.pdf' } }),
    });
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { detail: 'Please use a file smaller than 12 MB for this classroom demo.' });
  });

  it('AC15/E2 — an empty file is 400', async () => {
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      body: extractForm({ file: { content: new Uint8Array(0), type: 'text/plain', name: 'empty.txt' } }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { detail: 'The selected file is empty.' });
  });

  it('E4 — non-UTF-8 CSV is 400', async () => {
    const latin1 = new Uint8Array([0x6d, 0x65, 0x72, 0x63, 0x68, 0x61, 0x6e, 0x74, 0x0a, 0x43, 0x61, 0x66, 0xe9, 0x0a]);
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      body: extractForm({ file: { content: latin1, type: 'text/csv', name: 'bad.csv' } }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { detail: 'CSV must be UTF-8 encoded.' });
  });

  it('E5 — CSV with a header but no rows is 400', async () => {
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      body: extractForm({ file: { content: 'date,description,amount\n', type: 'text/csv', name: 'rows.csv' } }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).detail, /^Could not read CSV: /);
  });

  it('a valid CSV is parsed by the server, then reaches the (unconfigured) AI → 503', async () => {
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      body: extractForm({
        file: { content: '﻿date,description,amount\n2026-09-14,TST* SPOTIFY USA,11.99\n', type: 'text/csv', name: 'ok.csv' },
      }),
    });
    assert.equal(res.status, 503);
  });

  it('unknown API path is 404 JSON', async () => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { detail: 'Not found.' });
  });

  it('CORS allows only CLIENT_ORIGIN', async () => {
    const ok = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const blocked = await fetch(`${base}/health`, { headers: { Origin: 'http://evil.example' } });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  });
});

describe('API with a fake AI service (validation and safety boundaries)', () => {
  // A configurable stand-in for the hand-coded AI service.
  class FakeAi extends AiService {
    constructor({ extract, plan } = {}) {
      super(demoConfig);
      this.extract = extract;
      this.plan = plan;
      this.planCalls = 0;
    }
    isConfigured() {
      return true;
    }
    async extractStatement(text, fileBytes, mimeType) {
      return this.extract(text, fileBytes, mimeType);
    }
    async chooseNextStep(goal, findings, toolResults, tools) {
      this.planCalls += 1;
      return this.plan ? this.plan(findings, toolResults, tools) : super.chooseNextStep(goal, findings, toolResults, tools);
    }
  }

  async function withServer(aiService, fn) {
    const { server, base } = await startServer(demoConfig, { aiService });
    try {
      await fn(base);
    } finally {
      server.close();
    }
  }

  it('AC8 equivalent with ai_configured true — health flips, audit result unchanged', async () => {
    await withServer(new FakeAi(), async (base) => {
      assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok', ai_configured: true });
      const session = await (await postJson(`${base}/audits`, { transactions: getSampleTransactions() })).json();
      assert.equal(session.status, 'awaiting_approval');
      assert.equal(session.pending_action.annual_cost, 588);
    });
  });

  it('E8 — repairable rows are cleaned; unusable rows are dropped and reported', async () => {
    let received;
    const ai = new FakeAi({
      extract: (text) => {
        received = text;
        return {
          transactions: [
            { merchant: 'Spotify', date: '2026-09-14', category: 'Subscriptions', amount: 11.99, raw_line: 'TST* SPOTIFY USA 11.99' },
            { merchant: 'Mystery', date: 'yesterday', category: 'Other', amount: 5, raw_line: 'x' },
            { merchant: 'Shop', date: null, category: 'Groceries', amount: 3, raw_line: 'y' },
            { merchant: 'Cafe', date: null, amount: '$4.00', raw_line: 'z' },
            { merchant: '', date: null, category: 'Other', amount: 9, raw_line: 'no merchant' },
            { merchant: 'Broken', date: null, category: 'Other', amount: 'abc', raw_line: 'no amount' },
          ],
          notes: ['One line had no date.'],
        };
      },
    });
    await withServer(ai, async (base) => {
      const res = await fetch(`${base}/extract`, { method: 'POST', body: extractForm({ text: '  some text  ' }) });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(received, 'some text');
      // 'yesterday' → date null, 'Groceries' → Shopping, '$4.00' → 4: repaired, not dropped.
      assert.equal(body.count, 4);
      assert.equal(body.transactions[0].merchant, 'Spotify');
      assert.equal(body.transactions[1].date, null);
      assert.equal(body.transactions[2].category, 'Shopping');
      assert.equal(body.transactions[3].amount, 4);
      assert.ok(body.notes.includes('One line had no date.'));
      assert.ok(body.notes.some((note) => note.includes('"yesterday"')));
      assert.deepEqual(body.validation_errors.map((e) => e.row), [5, 6]);
    });
  });

  it('CSV rows are serialised by the server with the normalise-only prefix', async () => {
    let received;
    const ai = new FakeAi({
      extract: (text) => {
        received = text;
        return { transactions: [], notes: [] };
      },
    });
    await withServer(ai, async (base) => {
      const res = await fetch(`${base}/extract`, {
        method: 'POST',
        body: extractForm({ file: { content: 'date,description,amount\n2026-09-14,TST* SPOTIFY USA,11.99\n', type: 'text/plain', name: 'rows.CSV' } }),
      });
      assert.equal(res.status, 200);
      assert.ok(received.startsWith('CSV rows (extract/normalize only; do not invent values):\n'));
      assert.ok(received.includes('TST* SPOTIFY USA'));
    });
  });

  it('E7 — an AI failure is 502 with the reason', async () => {
    const ai = new FakeAi({
      extract: () => {
        throw new Error('quota exceeded');
      },
    });
    await withServer(ai, async (base) => {
      const res = await fetch(`${base}/extract`, { method: 'POST', body: extractForm({ text: 'x' }) });
      assert.equal(res.status, 502);
      assert.deepEqual(await res.json(), { detail: 'AI extraction failed: quota exceeded' });
    });
  });

  it('E14 — a tool outside the allowlist stops the audit safely', async () => {
    const ai = new FakeAi({ plan: () => ({ tool_name: 'send_email', arguments: { to: 'merchant' } }) });
    await withServer(ai, async (base) => {
      const session = await (await postJson(`${base}/audits`, { transactions: getSampleTransactions() })).json();
      assert.equal(session.status, 'failed');
      assert.equal(session.pending_action, null);
      assert.equal(session.summary, 'Audit stopped safely: Tool is not allowed: send_email');
      assert.equal(session.audit_log.at(-1).type, 'error');
    });
  });

  it('E15/AC22 — made-up planner arguments are ignored; results stay grounded', async () => {
    const ai = new FakeAi({
      plan: (findings, toolResults) => {
        const ran = (name) => toolResults.some((r) => r.tool === name);
        if (!ran('detect_stealth_hikes')) return { tool_name: 'detect_stealth_hikes', arguments: {} };
        if (!ran('calculate_annual_leakage'))
          return { tool_name: 'calculate_annual_leakage', arguments: { merchant: 'Netflix', monthly_amount: 9999 } };
        return {
          tool_name: 'generate_cancellation_script',
          arguments: { merchant: 'Netflix', old_amount: 1, new_amount: 1000 },
        };
      },
    });
    await withServer(ai, async (base) => {
      const session = await (await postJson(`${base}/audits`, { transactions: getSampleTransactions() })).json();
      assert.equal(session.status, 'awaiting_approval');
      const calcTool = session.audit_log.filter((e) => e.type === 'tool')[1];
      assert.deepEqual(calcTool.details, { merchant: 'StreamBox Premium', monthly_amount: 49, annual_cost: 588 });
      assert.equal(session.pending_action.merchant, 'StreamBox Premium');
      assert.equal(session.pending_action.annual_cost, 588);
      assert.ok(session.pending_action.draft.includes('$11.31'));
      // The trace still shows what the planner asked for.
      const calcPlan = session.audit_log.filter((e) => e.type === 'plan')[1];
      assert.deepEqual(calcPlan.details.arguments, { merchant: 'Netflix', monthly_amount: 9999 });
    });
  });

  it('E16 — calculate/draft with no findings are skipped and the loop continues', async () => {
    const order = ['calculate_annual_leakage', 'generate_cancellation_script', 'finish'];
    const ai = new FakeAi({ plan: (findings, toolResults) => ({ tool_name: order[toolResults.length], arguments: {} }) });
    await withServer(ai, async (base) => {
      const session = await (await postJson(`${base}/audits`, { transactions: getSampleTransactions() })).json();
      assert.equal(session.status, 'done');
      assert.equal(session.pending_action, null);
      const tools = session.audit_log.filter((e) => e.type === 'tool');
      assert.deepEqual(tools.map((t) => t.details), [{ skipped: 'No price hike found.' }, { skipped: 'No price hike found.' }]);
    });
  });

  it('E17 — the loop stops after 6 iterations without finish', async () => {
    const ai = new FakeAi({ plan: () => ({ tool_name: 'detect_stealth_hikes', arguments: {} }) });
    await withServer(ai, async (base) => {
      const session = await (await postJson(`${base}/audits`, { transactions: getSampleTransactions() })).json();
      assert.equal(ai.planCalls, 6);
      assert.equal(session.steps, 6);
      assert.equal(session.status, 'done');
      assert.equal(session.findings.length, 1);
      assert.ok(session.summary.startsWith('StreamBox Premium increased'));
      assert.deepEqual(session.audit_log.at(-1).details, { steps: 6 });
    });
  });
});

describe('Gemini guardrails, uploads and chat (fake AI service)', () => {
  class GuardAi extends AiService {
    constructor(handlers = {}) {
      super(demoConfig);
      this.handlers = handlers;
    }
    isConfigured() {
      return true;
    }
    async extractStatement(text, fileBytes, mimeType) {
      return this.handlers.extract(text, fileBytes, mimeType);
    }
    async chat(input) {
      return this.handlers.chat(input);
    }
  }

  async function withServer(ai, fn) {
    const { server, base } = await startServer(demoConfig, { aiService: ai });
    try {
      await fn(base);
    } finally {
      server.close();
    }
  }

  const receipt = {
    transactions: [{ merchant: 'HPCL', date: '14/09/2026', category: 'petrol', amount: '₹1,250.50', raw_line: null }],
    notes: [],
  };

  it('a PNG receipt is sent to the AI with its image type and the row is cleaned for the dashboard', async () => {
    let seen;
    const ai = new GuardAi({
      extract: (text, bytes, mime) => {
        seen = { text, size: bytes.length, mime };
        return receipt;
      },
    });
    await withServer(ai, async (base) => {
      const res = await fetch(`${base}/extract`, {
        method: 'POST',
        body: extractForm({ file: { content: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), type: 'application/octet-stream', name: 'bill.PNG' } }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(seen, { text: null, size: 7, mime: 'image/png' });
      assert.deepEqual(body.transactions, [
        { merchant: 'HPCL', date: '2026-09-14', category: 'Fuel', amount: 1250.5, raw_line: null },
      ]);
    });
  });

  it('a PDF statement is sent as application/pdf', async () => {
    let mime;
    const ai = new GuardAi({ extract: (t, b, m) => ((mime = m), receipt) });
    await withServer(ai, async (base) => {
      const res = await fetch(`${base}/extract`, {
        method: 'POST',
        body: extractForm({ file: { content: '%PDF-1.4 fake', type: 'application/pdf', name: 'statement.pdf' } }),
      });
      assert.equal(res.status, 200);
      assert.equal(mime, 'application/pdf');
    });
  });

  it('unsupported file types are rejected with 400', async () => {
    const ai = new GuardAi({ extract: () => receipt });
    await withServer(ai, async (base) => {
      const res = await fetch(`${base}/extract`, {
        method: 'POST',
        body: extractForm({ file: { content: 'MZ', type: 'application/zip', name: 'x.zip' } }),
      });
      assert.equal(res.status, 400);
      assert.match((await res.json()).detail, /Unsupported file type/);
    });
  });

  it('a non-financial image is rejected with 422 and a clear message', async () => {
    const { OutOfScopeError } = await import('../src/errors.js');
    const ai = new GuardAi({
      extract: () => {
        throw new OutOfScopeError('This does not look like a bank statement, receipt or list of transactions.');
      },
    });
    await withServer(ai, async (base) => {
      const res = await fetch(`${base}/extract`, {
        method: 'POST',
        body: extractForm({ file: { content: new Uint8Array([1, 2, 3]), type: 'image/jpeg', name: 'dog.jpg' } }),
      });
      assert.equal(res.status, 422);
      assert.match((await res.json()).detail, /does not look like a bank statement/);
    });
  });

  it('chat passes code-computed spending numbers to the AI', async () => {
    let received;
    const ai = new GuardAi({ chat: (input) => ((received = input), { reply: 'Cap fuel at 8000.' }) });
    const transactions = [
      { merchant: 'Employer', date: '2026-08-01', category: 'Income', amount: 100000, raw_line: null },
      { merchant: 'HPCL', date: '2026-08-10', category: 'Fuel', amount: 9000, raw_line: null },
      { merchant: 'HPCL', date: '2026-09-10', category: 'Fuel', amount: 11000, raw_line: null },
      { merchant: 'Cafe', date: '2026-09-12', category: 'Dining', amount: 500, raw_line: null },
    ];
    await withServer(ai, async (base) => {
      const res = await postJson(`${base}/chat`, { message: 'How do I cut petrol spending?', history: [], transactions, currency: 'INR' });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { reply: 'Cap fuel at 8000.' });
      const fuel = received.context.categories.find((c) => c.category === 'Fuel');
      assert.equal(fuel.total, 20000);
      assert.equal(fuel.monthly_average, 10000);
      assert.equal(received.context.currency, 'INR');
      assert.equal(received.context.total_income, 100000);
      assert.equal(received.context.average_monthly_income, 50000);
      assert.equal(fuel.share_of_income_pct, 20);
      assert.deepEqual(fuel.benchmark.suggested_monthly_range, [2000, 4000]);
    });
  });

  it('an off-topic chat question gets a 422 error message', async () => {
    const { OutOfScopeError } = await import('../src/errors.js');
    const ai = new GuardAi({
      chat: () => {
        throw new OutOfScopeError('I can only help with personal finance.');
      },
    });
    await withServer(ai, async (base) => {
      const res = await postJson(`${base}/chat`, { message: 'Write me a poem about cats', transactions: [] });
      assert.equal(res.status, 422);
      assert.deepEqual(await res.json(), { detail: 'I can only help with personal finance.' });
    });
  });

  it('chat validates its input (empty and too long) and reports missing AI config', async () => {
    await withServer(new GuardAi({ chat: () => ({ reply: 'x' }) }), async (base) => {
      assert.equal((await postJson(`${base}/chat`, { message: '   ' })).status, 400);
      assert.equal((await postJson(`${base}/chat`, { message: 'a'.repeat(1001) })).status, 400);
    });
    const { server, base } = await startServer(); // real AiService, no key
    try {
      const res = await postJson(`${base}/chat`, { message: 'hello' });
      assert.equal(res.status, 503);
    } finally {
      server.close();
    }
  });
});
