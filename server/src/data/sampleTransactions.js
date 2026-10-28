// Fictional workshop sample (USD). Served by GET /api/sample and reused by tests.
// Expected audit result: StreamBox Premium 37.69 → 49.00 (+30.0%), $588.00/year.

const SAMPLE_TRANSACTIONS = Object.freeze([
  { merchant: 'Campus Cafe', date: '2026-06-05', category: 'Dining', amount: 8.5, raw_line: 'SQ *CAMPUS CAFE 8.50' },
  { merchant: 'StreamBox Premium', date: '2026-06-03', category: 'Subscriptions', amount: 37.69, raw_line: 'STREAMBOX*PREM 37.69' },
  { merchant: 'Groceries Market', date: '2026-06-08', category: 'Shopping', amount: 42.1, raw_line: 'POS GROCERIES MARKET 42.10' },
  { merchant: 'Spotify', date: '2026-06-14', category: 'Subscriptions', amount: 11.99, raw_line: 'TST* SPOTIFY USA 11.99' },
  { merchant: 'StreamBox Premium', date: '2026-07-03', category: 'Subscriptions', amount: 37.69, raw_line: 'STREAMBOX*PREM 37.69' },
  { merchant: 'Campus Cafe', date: '2026-07-06', category: 'Dining', amount: 9.25, raw_line: 'SQ *CAMPUS CAFE 9.25' },
  { merchant: 'Spotify', date: '2026-07-14', category: 'Subscriptions', amount: 11.99, raw_line: 'TST* SPOTIFY USA 11.99' },
  { merchant: 'StreamBox Premium', date: '2026-08-03', category: 'Subscriptions', amount: 49.0, raw_line: 'STREAMBOX*PREM 49.00' },
  { merchant: 'Groceries Market', date: '2026-08-08', category: 'Shopping', amount: 39.4, raw_line: 'POS GROCERIES MARKET 39.40' },
  { merchant: 'Spotify', date: '2026-08-14', category: 'Subscriptions', amount: 11.99, raw_line: 'TST* SPOTIFY USA 11.99' },
  { merchant: 'Fuel Station', date: '2026-08-17', category: 'Fuel', amount: 25.0, raw_line: 'POS FUEL STATION 25.00' },
  { merchant: 'StreamBox Premium', date: '2026-09-03', category: 'Subscriptions', amount: 49.0, raw_line: 'STREAMBOX*PREM 49.00' },
  { merchant: 'Spotify', date: '2026-09-14', category: 'Subscriptions', amount: 11.99, raw_line: 'TST* SPOTIFY USA 11.99' },
  { merchant: 'Food Delivery', date: '2026-09-18', category: 'Food delivery', amount: 18.75, raw_line: 'UPI/FOOD DELIVERY/8231 18.75' },
]);

export const SAMPLE_CURRENCY = 'USD';
export const SAMPLE_SOURCE = 'fictional workshop sample';

// Always hand out copies so no caller can mutate the shared sample.
export function getSampleTransactions() {
  return SAMPLE_TRANSACTIONS.map((transaction) => ({ ...transaction }));
}
