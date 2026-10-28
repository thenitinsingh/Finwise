// Dashboard calculation checks for spec AC4–AC7 (run with `npm test`).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  categoryTotals,
  computeMetrics,
  formatCurrency,
  monthlySeries,
  shortDate,
  sortForTable,
} from '../src/lib/dashboard.js';

// Same 14 fictional rows the server returns from GET /api/sample.
const sample = [
  ['Campus Cafe', '2026-06-05', 'Dining', 8.5],
  ['StreamBox Premium', '2026-06-03', 'Subscriptions', 37.69],
  ['Groceries Market', '2026-06-08', 'Shopping', 42.1],
  ['Spotify', '2026-06-14', 'Subscriptions', 11.99],
  ['StreamBox Premium', '2026-07-03', 'Subscriptions', 37.69],
  ['Campus Cafe', '2026-07-06', 'Dining', 9.25],
  ['Spotify', '2026-07-14', 'Subscriptions', 11.99],
  ['StreamBox Premium', '2026-08-03', 'Subscriptions', 49.0],
  ['Groceries Market', '2026-08-08', 'Shopping', 39.4],
  ['Spotify', '2026-08-14', 'Subscriptions', 11.99],
  ['Fuel Station', '2026-08-17', 'Fuel', 25.0],
  ['StreamBox Premium', '2026-09-03', 'Subscriptions', 49.0],
  ['Spotify', '2026-09-14', 'Subscriptions', 11.99],
  ['Food Delivery', '2026-09-18', 'Food delivery', 18.75],
].map(([merchant, date, category, amount]) => ({ merchant, date, category, amount, raw_line: `${merchant} ${amount}` }));

describe('dashboard calculations', () => {
  it('AC4 — metric cards', () => {
    const m = computeMetrics(sample);
    assert.equal(m.count, 14);
    assert.equal(m.uniqueMerchants, 6);
    assert.equal(formatCurrency(m.totalOutflow), '$364.34');
    assert.equal(formatCurrency(m.subscriptionTotal), '$221.34');
  });

  it('AC5 — monthly chart points', () => {
    assert.deepEqual(
      monthlySeries(sample).map((p) => [p.label, p.total]),
      [
        ['Jun 26', 100.28],
        ['Jul 26', 58.93],
        ['Aug 26', 125.39],
        ['Sep 26', 79.74],
      ],
    );
  });

  it('AC6 — category order and totals', () => {
    assert.deepEqual(
      categoryTotals(sample).map((c) => [c.category, c.total]),
      [
        ['Subscriptions', 221.34],
        ['Shopping', 81.5],
        ['Fuel', 25],
        ['Food delivery', 18.75],
        ['Dining', 17.75],
      ],
    );
    assert.equal(categoryTotals(sample)[0].width, 100);
  });

  it('AC7 — table sorted newest first, Food Delivery on Sep 18 at the top', () => {
    const rows = sortForTable(sample);
    assert.equal(rows.length, 14);
    assert.equal(rows[0].merchant, 'Food Delivery');
    assert.equal(shortDate(rows[0].date), 'Sep 18');
  });

  it('E10/E11 — null dates go last and show "Date unclear"; refunds are excluded from totals', () => {
    const rows = [
      { merchant: 'A', date: null, category: 'Other', amount: 5 },
      { merchant: 'B', date: '2026-01-02', category: 'Subscriptions', amount: -10 },
      { merchant: 'C', date: '2026-01-01', category: 'Subscriptions', amount: 10 },
    ];
    assert.deepEqual(sortForTable(rows).map((r) => r.merchant), ['B', 'C', 'A']);
    assert.equal(shortDate(null), 'Date unclear');
    const m = computeMetrics(rows);
    assert.equal(m.totalOutflow, 15);
    assert.equal(m.subscriptionTotal, 10);
    assert.deepEqual(monthlySeries(rows).map((p) => p.total), [10]);
  });

  it('category bars have a 3% minimum width', () => {
    const rows = [
      { merchant: 'Big', date: null, category: 'Bills', amount: 10000 },
      { merchant: 'Tiny', date: null, category: 'Other', amount: 1 },
    ];
    assert.equal(categoryTotals(rows)[1].width, 3);
  });
});

describe('empty start, income and merging uploads', () => {
  it('an empty dashboard has zero everything', async () => {
    const m = computeMetrics([]);
    assert.deepEqual([m.count, m.totalOutflow, m.subscriptionTotal], [0, 0, 0]);
    assert.deepEqual(monthlySeries([]), []);
    assert.deepEqual(categoryTotals([]), []);
  });

  it('income is not counted as spending', () => {
    const rows = [
      { merchant: 'Employer', date: '2026-09-01', category: 'Income', amount: 50000, raw_line: null },
      { merchant: 'HPCL', date: '2026-09-02', category: 'Fuel', amount: 1000, raw_line: null },
    ];
    assert.equal(computeMetrics(rows).totalOutflow, 1000);
    assert.deepEqual(categoryTotals(rows).map((c) => c.category), ['Fuel']);
    assert.equal(monthlySeries(rows)[0].total, 1000);
  });

  it('a second upload is appended and exact duplicates are skipped', async () => {
    const { mergeTransactions } = await import('../src/lib/dashboard.js');
    const a = { merchant: 'HPCL', date: '2026-09-02', category: 'Fuel', amount: 1000, raw_line: 'x' };
    const b = { merchant: 'Cafe', date: '2026-09-03', category: 'Dining', amount: 200, raw_line: 'y' };
    const merged = mergeTransactions([a], [{ ...a }, b]);
    assert.equal(merged.rows.length, 2);
    assert.deepEqual([merged.added, merged.skipped], [1, 1]);
  });
});
