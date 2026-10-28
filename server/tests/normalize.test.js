import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeAmount, normalizeCategory, normalizeDate } from '../src/api/normalize.js';
import { parseJsonReply } from '../src/ai/aiService.js';

describe('normalisation of AI output', () => {
  it('dates', () => {
    assert.equal(normalizeDate('2026-09-14'), '2026-09-14');
    assert.equal(normalizeDate('14/09/2026'), '2026-09-14');
    assert.equal(normalizeDate('09/14/2026'), '2026-09-14'); // 14 cannot be a month
    assert.equal(normalizeDate('14-Sep-26'), '2026-09-14');
    assert.equal(normalizeDate('Sep 14, 2026'), '2026-09-14');
    assert.equal(normalizeDate('31/02/2026'), null);
    assert.equal(normalizeDate('yesterday'), null);
  });
  it('amounts', () => {
    assert.equal(normalizeAmount('₹1,250.50'), 1250.5);
    assert.equal(normalizeAmount('(45.00)'), -45);
    assert.equal(normalizeAmount('1.250,50'), 1250.5);
    assert.equal(normalizeAmount(12), 12);
    assert.equal(normalizeAmount('abc'), 'abc');
  });
  it('categories', () => {
    assert.equal(normalizeCategory('Petrol'), 'Fuel');
    assert.equal(normalizeCategory('food delivery'), 'Food delivery');
    assert.equal(normalizeCategory('???'), 'Other');
    assert.equal(normalizeCategory(null), 'Other');
  });
  it('JSON replies with fences or prose', () => {
    assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonReply('Sure! {"a":1} done'), { a: 1 });
    assert.throws(() => parseJsonReply('nope'));
  });
});
