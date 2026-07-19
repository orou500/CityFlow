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
