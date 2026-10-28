// Unit tests for the deterministic finance tools (spec Section 10.B).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getSampleTransactions } from '../src/data/sampleTransactions.js';
import { ToolValidationError } from '../src/errors.js';
import {
  calculateAnnualLeakage,
  detectStealthHikes,
  generateCancellationScript,
} from '../src/tools/financeTools.js';
import { offlinePlanner } from '../src/ai/aiService.js';

const sub = (merchant, date, amount) => ({ merchant, date, category: 'Subscriptions', amount, raw_line: null });

describe('detect_stealth_hikes', () => {
  it('finds exactly the StreamBox Premium hike in the sample data', () => {
    const findings = detectStealthHikes(getSampleTransactions());
    assert.deepEqual(findings, [
      {
        merchant: 'StreamBox Premium',
        old_amount: 37.69,
        new_amount: 49,
        change_pct: 30,
        date: '2026-08-03',
        monthly_increase: 11.31,
      },
    ]);
  });

  it('does not flag flat charges (Spotify, all 11.99)', () => {
    const spotify = getSampleTransactions().filter((t) => t.merchant === 'Spotify');
    assert.equal(spotify.length, 4);
    assert.deepEqual(detectStealthHikes(spotify), []);
  });

  it('does NOT flag an increase of exactly 10% (strictly greater than)', () => {
    assert.deepEqual(detectStealthHikes([sub('Box', '2026-01-01', 10), sub('Box', '2026-02-01', 11)]), []);
    assert.deepEqual(detectStealthHikes([sub('Box', '2026-01-01', 37.7), sub('Box', '2026-02-01', 41.47)]), []);
  });

  it('flags an increase just above 10%', () => {
    const findings = detectStealthHikes([sub('Box', '2026-01-01', 10), sub('Box', '2026-02-01', 11.01)]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].change_pct, 10.1);
  });

  it('ignores refunds and non-subscription categories', () => {
    const rows = [
      sub('Box', '2026-01-01', 10),
      { ...sub('Box', '2026-02-01', -10) },
      { merchant: 'Box', date: '2026-03-01', category: 'Shopping', amount: 50, raw_line: null },
    ];
    assert.deepEqual(detectStealthHikes(rows), []);
  });

  it('groups merchants case-insensitively and sorts null dates first', () => {
    const findings = detectStealthHikes([
      sub('  streambox ', '2026-02-01', 20),
      sub('StreamBox', null, 10),
    ]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].old_amount, 10);
    assert.equal(findings[0].new_amount, 20);
    assert.equal(findings[0].date, '2026-02-01');
  });
});

describe('calculate_annual_leakage', () => {
  it('annualises 49.00 to 588.00', () => {
    assert.deepEqual(calculateAnnualLeakage('StreamBox Premium', 49.0), {
      merchant: 'StreamBox Premium',
      monthly_amount: 49,
      annual_cost: 588,
    });
  });

  it('rejects a negative monthly amount', () => {
    assert.throws(() => calculateAnnualLeakage('StreamBox Premium', -1), ToolValidationError);
  });
});

describe('generate_cancellation_script', () => {
  it('produces a draft that is never sent and mentions the $11.31 increase', () => {
    const result = generateCancellationScript('StreamBox Premium', 37.69, 49.0);
    assert.equal(result.sent, false);
    assert.ok(result.draft.includes('$11.31'));
    assert.ok(result.draft.includes('$37.69'));
    assert.ok(result.draft.includes('$49.00'));
    assert.ok(result.draft.startsWith('Subject: Request to review subscription price change\n\nHello StreamBox Premium Support,'));
    assert.ok(result.draft.endsWith('\n\nThank you.'));
  });
});

describe('offline planner (L8)', () => {
  it('runs detect → calculate → draft → finish', () => {
    const findings = detectStealthHikes(getSampleTransactions());
    const steps = [];
    const toolResults = [];
    for (let i = 0; i < 4; i += 1) {
      const decision = offlinePlanner(i === 0 ? [] : findings, toolResults);
      steps.push(decision.tool_name);
      toolResults.push({ tool: decision.tool_name, result: {} });
    }
    assert.deepEqual(steps, [
      'detect_stealth_hikes',
      'calculate_annual_leakage',
      'generate_cancellation_script',
      'finish',
    ]);
  });

  it('finishes straight after detection when there is no hike', () => {
    const decision = offlinePlanner([], [{ tool: 'detect_stealth_hikes', result: [] }]);
    assert.equal(decision.tool_name, 'finish');
  });
});
