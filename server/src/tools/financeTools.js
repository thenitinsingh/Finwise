// Deterministic finance tools (spec Section 6, L4–L6).
//
// SAFETY: every tool here is a pure, read-only function. None of them sends
// email, calls a merchant/bank, or touches the network. The agent can only
// reach them through the allowlist in src/api/auditAgent.js.

import { ToolValidationError } from '../errors.js';
import { money, round1, round2, toCents } from './money.js';

export const DEFAULT_HIKE_THRESHOLD = 0.1;

const merchantKey = (merchant) => String(merchant).trim().toLowerCase();

// Null dates sort first; ISO strings sort correctly as plain strings.
function compareDatesNullFirst(a, b) {
  if (a.date === b.date) return 0;
  if (a.date === null || a.date === undefined) return -1;
  if (b.date === null || b.date === undefined) return 1;
  return a.date < b.date ? -1 : 1;
}

/**
 * L4 — Find subscription charges that went up by MORE than `threshold`
 * between two consecutive charges from the same merchant.
 * @returns {Array<{merchant, old_amount, new_amount, change_pct, date, monthly_increase}>}
 */
export function detectStealthHikes(transactions, threshold = DEFAULT_HIKE_THRESHOLD) {
  const groups = new Map();
  for (const transaction of transactions) {
    // Refunds/credits (amount <= 0) and non-subscriptions are ignored.
    if (transaction.category !== 'Subscriptions' || !(transaction.amount > 0)) continue;
    const key = merchantKey(transaction.merchant);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(transaction);
  }

  const findings = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(compareDatesNullFirst); // stable sort
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      if (prev.amount <= 0) continue;

      // Compare in integer cents so an exact +10% is exactly 0.1 (not 0.1000001).
      const prevCents = toCents(prev.amount);
      const curCents = toCents(cur.amount);
      const change = (curCents - prevCents) / prevCents;

      if (change > threshold) {
        findings.push({
          merchant: cur.merchant,
          old_amount: round2(prev.amount),
          new_amount: round2(cur.amount),
          change_pct: round1(change * 100),
          date: cur.date ?? null,
          monthly_increase: round2((curCents - prevCents) / 100),
        });
      }
    }
  }
  return findings;
}

/** L5 — Annualised cost of a monthly charge. Rejects negative amounts. */
export function calculateAnnualLeakage(merchant, monthlyAmount) {
  const amount = Number(monthlyAmount);
  if (!Number.isFinite(amount)) {
    throw new ToolValidationError('monthly_amount must be a number.');
  }
  if (amount < 0) {
    throw new ToolValidationError('monthly_amount must not be negative.');
  }
  return {
    merchant: String(merchant),
    monthly_amount: round2(amount),
    annual_cost: round2(amount * 12),
  };
}

/**
 * L6 — Build a cancellation/dispute DRAFT. It is only text: `sent` is always
 * false and nothing in this app can send it.
 */
export function generateCancellationScript(merchant, oldAmount, newAmount) {
  const increase = round2(Number(newAmount) - Number(oldAmount));
  const draft = [
    'Subject: Request to review subscription price change',
    '',
    `Hello ${merchant} Support,`,
    '',
    `I noticed my recurring subscription changed from $${money(oldAmount)} to $${money(newAmount)}. ` +
      'Please confirm when and how this price change was communicated. ' +
      `I request a review of the $${money(increase)} increase and information about cancellation options and any applicable refund policy.`,
    '',
    'Thank you.',
  ].join('\n');

  return { merchant: String(merchant), draft, sent: false };
}

// ---------------------------------------------------------------------------
// Chat context — every number the coach may quote is computed HERE, in code.
// ---------------------------------------------------------------------------

// Rule-of-thumb share of monthly income. These are general guidelines (not
// rules) — the coach is told to say so. [low, high]
export const BENCHMARK_SHARE_OF_INCOME = Object.freeze({
  Fuel: [0.04, 0.08],
  Dining: [0.03, 0.07],
  'Food delivery': [0.02, 0.05],
  Shopping: [0.1, 0.2], // groceries + general shopping
  Subscriptions: [0.01, 0.03],
  Bills: [0.2, 0.35], // utilities, rent, EMIs, insurance
});

const centsSum = (rows) => rows.reduce((total, row) => total + toCents(row.amount), 0) / 100;

export function buildFinanceContext(transactions, currency = 'USD') {
  const isIncome = (t) => t.category === 'Income';
  const spend = transactions.filter((t) => !isIncome(t) && t.amount !== 0);
  const income = transactions.filter((t) => isIncome(t) && t.amount > 0);

  const months = new Set(transactions.filter((t) => t.date).map((t) => t.date.slice(0, 7)));
  const monthsCovered = Math.max(months.size, 1);

  const totalSpend = round2(centsSum(spend));
  const totalIncome = round2(centsSum(income));
  const monthlyIncome = totalIncome > 0 ? round2(totalIncome / monthsCovered) : null;
  const monthlySpend = round2(totalSpend / monthsCovered);

  const byCategory = new Map();
  for (const t of spend) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category).push(t);
  }

  const categories = [...byCategory.entries()]
    .map(([category, rows]) => {
      const total = round2(centsSum(rows));
      const monthlyAverage = round2(total / monthsCovered);
      const merchants = new Map();
      for (const row of rows) {
        const key = row.merchant;
        const entry = merchants.get(key) ?? { merchant: key, total_cents: 0, count: 0 };
        entry.total_cents += toCents(row.amount);
        entry.count += 1;
        merchants.set(key, entry);
      }
      const perMonth = {};
      for (const row of rows) {
        if (!row.date) continue;
        const key = row.date.slice(0, 7);
        perMonth[key] = round2((perMonth[key] ?? 0) + row.amount);
      }
      const range = BENCHMARK_SHARE_OF_INCOME[category];
      return {
        category,
        total,
        monthly_average: monthlyAverage,
        transaction_count: rows.length,
        share_of_spending_pct: totalSpend > 0 ? round1((total / totalSpend) * 100) : null,
        share_of_income_pct: monthlyIncome ? round1((monthlyAverage / monthlyIncome) * 100) : null,
        top_merchants: [...merchants.values()]
          .sort((a, b) => b.total_cents - a.total_cents)
          .slice(0, 3)
          .map((m) => ({ merchant: m.merchant, total: round2(m.total_cents / 100), count: m.count })),
        monthly_totals: perMonth,
        benchmark: range
          ? {
              typical_share_of_income_pct: [range[0] * 100, range[1] * 100],
              suggested_monthly_range: monthlyIncome ? [round2(monthlyIncome * range[0]), round2(monthlyIncome * range[1])] : null,
              note: 'General rule of thumb, varies by city, commute and family size.',
            }
          : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  const dates = transactions.map((t) => t.date).filter(Boolean).sort();

  return {
    currency,
    has_transactions: transactions.length > 0,
    transaction_count: transactions.length,
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1], months_covered: monthsCovered } : null,
    total_spending: totalSpend,
    average_monthly_spending: monthlySpend,
    total_income: totalIncome || null,
    average_monthly_income: monthlyIncome,
    monthly_income_known: monthlyIncome !== null,
    estimated_monthly_savings: monthlyIncome !== null ? round2(monthlyIncome - monthlySpend) : null,
    savings_rate_pct: monthlyIncome ? round1(((monthlyIncome - monthlySpend) / monthlyIncome) * 100) : null,
    categories,
    general_guideline: '50/30/20 rule: about 50% needs, 30% wants, 20% savings and debt repayment.',
  };
}
