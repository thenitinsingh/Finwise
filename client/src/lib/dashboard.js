// Dashboard calculations (spec Section 6, L3). Pure functions, recomputed
// whenever the transactions change. All money is summed in integer cents so
// totals never drift (e.g. $364.34, not $364.33999999).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const cents = (amount) => Math.round(Number(amount) * 100);
const sumAmounts = (rows) => rows.reduce((total, row) => total + cents(row.amount), 0) / 100;
// Money going out. Income (salary, deposits) is positive too, but it is not spending.
const isCharge = (row) => Number(row.amount) > 0 && row.category !== 'Income';

export function computeMetrics(transactions) {
  const charges = transactions.filter(isCharge);
  return {
    count: transactions.length,
    income: sumAmounts(transactions.filter((row) => row.category === 'Income' && Number(row.amount) > 0)),
    uniqueMerchants: new Set(transactions.map((row) => row.merchant)).size,
    totalOutflow: sumAmounts(charges),
    subscriptionTotal: sumAmounts(charges.filter((row) => row.category === 'Subscriptions')),
  };
}

/** Positive, dated transactions grouped by YYYY-MM, oldest first. Labels like "Jun 26". */
export function monthlySeries(transactions) {
  const byMonth = new Map();
  for (const row of transactions) {
    if (!isCharge(row) || !row.date) continue;
    const key = row.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + cents(row.amount));
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, totalCents]) => ({ key, label: monthLabel(key), total: totalCents / 100 }));
}

/** Positive charges per category, largest first, top 6. Bar width has a 3% minimum. */
export function categoryTotals(transactions, limit = 6) {
  const byCategory = new Map();
  for (const row of transactions) {
    if (!isCharge(row)) continue;
    const category = row.category || 'Other';
    byCategory.set(category, (byCategory.get(category) ?? 0) + cents(row.amount));
  }
  const rows = [...byCategory.entries()]
    .map(([category, totalCents]) => ({ category, total: totalCents / 100 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
  const max = rows[0]?.total ?? 0;
  return rows.map((row) => ({ ...row, width: max > 0 ? Math.max(3, (row.total / max) * 100) : 3 }));
}

/** Newest first; rows without a date go last. Stable for equal dates. */
export function sortForTable(transactions) {
  return transactions
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const da = a.row.date;
      const db = b.row.date;
      if (da === db) return a.index - b.index;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? 1 : -1;
    })
    .map(({ row }) => row);
}

// ---------- formatting ----------

// Currency comes from client/.env (VITE_CURRENCY, e.g. INR). Defaults to USD.
const CURRENCY_ALIASES = { RUPEE: 'INR', RUPEES: 'INR', RS: 'INR', '₹': 'INR', DOLLAR: 'USD', DOLLARS: 'USD', '$': 'USD', EURO: 'EUR', POUND: 'GBP' };

// Accepts ISO codes (INR) and common words (RUPEE); anything invalid falls back to USD instead of crashing.
function resolveCurrency(raw) {
  const wanted = String(raw || 'USD').trim().toUpperCase();
  const code = CURRENCY_ALIASES[wanted] ?? wanted;
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    return code;
  } catch {
    return 'USD';
  }
}

export const CURRENCY = resolveCurrency(import.meta.env?.VITE_CURRENCY);
const money = new Intl.NumberFormat(CURRENCY === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: CURRENCY });

/** $1,234.56 (negative values as -$12.00). */
export const formatCurrency = (value) => money.format(Number(value) || 0);

/** Key for spotting the same transaction uploaded twice. */
export const transactionKey = (row) =>
  [row.merchant.trim().toLowerCase(), row.date ?? '', Math.round(Number(row.amount) * 100), row.raw_line ?? ''].join('|');

/** Appends `incoming` to `existing`, skipping exact duplicates. Returns { rows, added, skipped }. */
export function mergeTransactions(existing, incoming) {
  const seen = new Set(existing.map(transactionKey));
  const rows = [...existing];
  let added = 0;
  for (const row of incoming) {
    const key = transactionKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    added += 1;
  }
  return { rows, added, skipped: incoming.length - added };
}

/** "2026-06" → "Jun 26" */
export function monthLabel(yearMonth) {
  const [year, month] = yearMonth.split('-');
  return `${MONTHS[Number(month) - 1]} ${year.slice(2)}`;
}

/** "2026-06-05" → "Jun 5"; null → "Date unclear". Parsed as text, so no timezone shift. */
export function shortDate(isoDate) {
  if (!isoDate) return 'Date unclear';
  const [, month, day] = isoDate.split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

/** 30 → "30%", 12.5 → "12.5%" */
export const formatPct = (value) => `${Number.isInteger(value) ? value : Number(value).toFixed(1)}%`;

/** ISO timestamp → local "HH:MM" */
export function clockTime(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function fileSizeKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
