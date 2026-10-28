// Small, deterministic number helpers. All money maths in the app lives in
// application code — the LLM never computes totals or money values.

// Round half away from zero to `decimals` places, avoiding float artefacts
// such as 1.005 → 1.00.
export function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor + Number.EPSILON * factor)) / factor;
}

export const round2 = (value) => roundTo(value, 2);
export const round1 = (value) => roundTo(value, 1);

// Integer cents, so comparisons like "exactly +10%" are exact.
export const toCents = (value) => Math.round(value * 100);

// "37.69" — two decimals, no currency symbol, no thousands separator.
export const money = (value) => round2(value).toFixed(2);
