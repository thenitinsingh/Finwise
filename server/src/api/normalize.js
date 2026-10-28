// Lenient clean-up of AI-extracted rows BEFORE strict schema validation.
// LLMs often return "₹1,250.00" instead of 1250, "14/09/2026" instead of
// "2026-09-14" or "Food & Dining" instead of "Dining". Rather than throwing
// those rows away, we repair what can be repaired safely. Anything that still
// cannot be understood is rejected by the strict schema afterwards.

import { CATEGORIES } from '../models/schemas.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const CATEGORY_SYNONYMS = new Map([
  ['dining', 'Dining'], ['restaurant', 'Dining'], ['restaurants', 'Dining'], ['cafe', 'Dining'], ['food', 'Dining'],
  ['food & dining', 'Dining'], ['eating out', 'Dining'],
  ['fuel', 'Fuel'], ['petrol', 'Fuel'], ['gas', 'Fuel'], ['diesel', 'Fuel'], ['transport', 'Fuel'],
  ['shopping', 'Shopping'], ['groceries', 'Shopping'], ['grocery', 'Shopping'], ['retail', 'Shopping'],
  ['subscriptions', 'Subscriptions'], ['subscription', 'Subscriptions'], ['entertainment', 'Subscriptions'],
  ['food delivery', 'Food delivery'], ['delivery', 'Food delivery'], ['food_delivery', 'Food delivery'],
  ['income', 'Income'], ['salary', 'Income'], ['credit', 'Income'], ['deposit', 'Income'],
  ['bills', 'Bills'], ['bill', 'Bills'], ['utilities', 'Bills'], ['rent', 'Bills'], ['emi', 'Bills'], ['insurance', 'Bills'],
  ['other', 'Other'], ['others', 'Other'], ['misc', 'Other'], ['miscellaneous', 'Other'],
]);

const pad = (n) => String(n).padStart(2, '0');
const validDate = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const expandYear = (y) => (y < 100 ? 2000 + y : y);

/** Returns "YYYY-MM-DD" or null when the date cannot be read with confidence. */
export function normalizeDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return validDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }

  // 14/09/2026, 14-09-26 → day first (Indian / UK style) unless the second part cannot be a month.
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (match) {
    let [a, b] = [Number(match[1]), Number(match[2])];
    const y = expandYear(Number(match[3]));
    if (b > 12 && a <= 12) [a, b] = [b, a]; // clearly month/day/year
    return validDate(y, b, a) ? `${y}-${pad(b)}-${pad(a)}` : null;
  }

  // 14 Sep 2026, 14-Sep-26, Sep 14, 2026
  match = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{2,4})$/);
  if (match) {
    const m = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    const y = expandYear(Number(match[3]));
    return m && validDate(y, m, Number(match[1])) ? `${y}-${pad(m)}-${pad(Number(match[1]))}` : null;
  }
  match = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (match) {
    const m = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1;
    const y = expandYear(Number(match[3]));
    return m && validDate(y, m, Number(match[2])) ? `${y}-${pad(m)}-${pad(Number(match[2]))}` : null;
  }
  return null;
}

/** "₹1,250.50", "$12.00", "(45.00)", "1.250,50 EUR" → number; unreadable → the original value. */
export function normalizeAmount(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  let text = value.trim();
  if (!text) return value;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text.replace(/[^\d.,]/g, '');
  if (!text) return value;
  // European style 1.250,50 → 1250.50 ; otherwise drop thousands commas.
  if (/,\d{1,2}$/.test(text) && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (/,\d{1,2}$/.test(text) && !text.includes('.')) text = text.replace(',', '.');
  else text = text.replace(/,/g, '');
  const number = Number(text);
  if (!Number.isFinite(number)) return value;
  return negative ? -number : number;
}

export function normalizeCategory(value) {
  if (typeof value !== 'string') return 'Other';
  const exact = CATEGORIES.find((category) => category.toLowerCase() === value.trim().toLowerCase());
  return exact ?? CATEGORY_SYNONYMS.get(value.trim().toLowerCase()) ?? 'Other';
}

/** Repairs one raw row. Non-object rows are returned unchanged so the schema rejects them. */
export function normalizeRow(row, notes = []) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const merchant = typeof row.merchant === 'string' ? row.merchant.trim().slice(0, 120) : row.merchant;

  let date = null;
  if (row.date !== null && row.date !== undefined && row.date !== '') {
    date = normalizeDate(row.date);
    if (date === null) notes.push(`Date "${String(row.date)}" for ${merchant ?? 'a row'} could not be read and was left empty.`);
  }

  return {
    merchant,
    date,
    category: normalizeCategory(row.category),
    amount: normalizeAmount(row.amount),
    raw_line: typeof row.raw_line === 'string' ? row.raw_line.slice(0, 2000) : null,
  };
}
