const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Q'];

export function formatCompact(value) {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  if (abs < 1000) return num.toLocaleString();

  const tier = Math.min(Math.floor(Math.log10(abs) / 3), SUFFIXES.length - 1);
  const suffix = SUFFIXES[tier];
  const scale = Math.pow(10, tier * 3);
  const scaled = num / scale;

  return scaled % 1 === 0 ? `${scaled}${suffix}` : `${scaled.toFixed(1)}${suffix}`;
}

export function formatMoney(value) {
  const num = Math.round(Number(value) || 0);
  return `$${num.toLocaleString('en-US')}`;
}
