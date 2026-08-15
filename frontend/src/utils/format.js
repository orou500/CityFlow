const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Q'];

export function formatCompact(value) {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  if (abs < 1000) return num.toLocaleString('en-US');

  const tier = Math.min(Math.floor(Math.log10(abs) / 3), SUFFIXES.length - 1);
  const suffix = SUFFIXES[tier];
  const scale = Math.pow(10, tier * 3);
  const scaled = num / scale;

  return scaled % 1 === 0 ? `${scaled}${suffix}` : `${scaled.toFixed(1)}${suffix}`;
}

export function formatMoney(value) {
  const num = Math.round(Number(value) || 0);
  const abs = Math.abs(num);
  if (abs < 1000) return `$${num.toLocaleString('en-US')}`;
  return `$${formatCompact(num)}`;
}

export function formatMoneyExact(value) {
  const num = Math.round(Number(value) || 0);
  return `$${num.toLocaleString('en-US')}`;
}

export function formatPercent(value, decimals = 1) {
  const num = Number(value) || 0;
  return `${(num * 100).toFixed(decimals)}%`;
}

export function formatDiff(value, prefix = '+') {
  const num = Math.round(Number(value) || 0);
  const sign = num < 0 ? '-' : prefix;
  return `${sign}$${formatCompact(Math.abs(num))}`;
}

export function formatDiffExact(value, prefix = '+') {
  const num = Math.round(Number(value) || 0);
  const sign = num < 0 ? '-' : prefix;
  return `${sign}$${Math.abs(num).toLocaleString('en-US')}`;
}

const MINUS_SIGN = '\u2212'; // U+2212 MINUS SIGN, not an ASCII hyphen

function signFor(value) {
  if (value < 0) return MINUS_SIGN;
  if (value > 0) return '+';
  return '';
}

/**
 * Signed money, e.g. `+$325` / `−$325` / `$0`. Uses the Unicode minus sign
 * and omits the sign for zero.
 */
export function formatSignedMoney(value, { exact = false } = {}) {
  const num = Math.round(Number(value) || 0);
  const sign = signFor(num);
  const body = exact ? Math.abs(num).toLocaleString('en-US') : formatCompact(Math.abs(num));
  return `${sign}$${body}`;
}

/**
 * Signed percentage, e.g. `+6.94%` / `−6.94%` / `0%`. The value is already a
 * percentage number (not a 0-1 fraction), so it is never multiplied by 100.
 */
export function formatSignedPercent(value, { decimals = 2 } = {}) {
  const num = Number(value) || 0;
  const sign = signFor(num);
  return `${sign}${Math.abs(num).toFixed(decimals)}%`;
}

export function formatPrice(value) {
  const num = Number(value) || 0;
  if (Math.abs(num) < 1000) return `$${num.toFixed(2)}`;
  return `$${formatCompact(Math.round(num))}`;
}

export function formatCount(value) {
  const num = Number(value) || 0;
  if (Math.abs(num) < 1000) return num.toLocaleString('en-US');
  return formatCompact(num);
}

export { formatCompact as formatNumber };
