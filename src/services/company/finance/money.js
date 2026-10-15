// Stripe charge/refund units; do not apply this to payout-specific rounding rules.
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
export function stripeMinorUnits(amount, currency) {
  const code = String(currency || '').toLowerCase();
  if (!/^[a-z]{3}$/.test(code)) throw new Error('An explicit three-letter currency is required');
  if (['bhd', 'jod', 'kwd', 'omr', 'tnd'].includes(code)) throw new Error('Three-decimal currencies require a dedicated payment integration');
  const text = String(amount ?? '');
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('A positive explicit payment amount is required');
  const [whole, fraction = ''] = text.split('.');
  const digits = ZERO_DECIMAL.has(code) ? 0 : 2;
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) throw new Error('Amount has unsupported fractional precision');
  if (['isk', 'ugx'].includes(code) && /[1-9]/.test(fraction)) throw new Error('This currency cannot have fractional charges');
  const result = Number(whole) * 10 ** digits + Number(fraction.slice(0, digits).padEnd(digits, '0'));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Payment amount must be positive and within safe integer bounds');
  return result;
}
