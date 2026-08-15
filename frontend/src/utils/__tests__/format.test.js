import { describe, it, expect } from 'vitest';
import { formatSignedMoney, formatSignedPercent, formatMoney, formatDiff, formatCompact } from '../format';

const MINUS = '\u2212';

describe('formatSignedMoney', () => {
  it('formats positive values with a plus sign', () => {
    expect(formatSignedMoney(325)).toBe('+$325');
    expect(formatSignedMoney(1000)).toBe('+$1K');
    expect(formatSignedMoney(1234567)).toBe('+$1.2M');
  });

  it('formats negative values with a unicode minus sign (not ASCII hyphen)', () => {
    expect(formatSignedMoney(-325)).toBe(`${MINUS}$325`);
    expect(formatSignedMoney(-1000)).toBe(`${MINUS}$1K`);
  });

  it('formats zero without any sign', () => {
    expect(formatSignedMoney(0)).toBe('$0');
    expect(formatSignedMoney(-0)).toBe('$0');
  });

  it('handles very large values', () => {
    expect(formatSignedMoney(-1_000_000_000_000)).toBe(`${MINUS}$1T`);
    expect(formatSignedMoney(1_234_567_890_123)).toBe('+$1.2T');
  });

  it('supports exact (non-compact) formatting', () => {
    expect(formatSignedMoney(-325, { exact: true })).toBe(`${MINUS}$325`);
    expect(formatSignedMoney(12_345, { exact: true })).toBe('+$12,345');
  });
});

describe('formatSignedPercent', () => {
  it('formats positive, negative and zero percentages', () => {
    expect(formatSignedPercent(6.94)).toBe('+6.94%');
    expect(formatSignedPercent(-6.94)).toBe(`${MINUS}6.94%`);
    expect(formatSignedPercent(0)).toBe('0.00%');
  });

  it('supports custom decimals (small decimal percentages)', () => {
    expect(formatSignedPercent(-0.12, { decimals: 1 })).toBe(`${MINUS}0.1%`);
    expect(formatSignedPercent(0.1234, { decimals: 3 })).toBe('+0.123%');
  });
});

describe('existing formatters still behave', () => {
  it('formatMoney, formatDiff and formatCompact are unchanged', () => {
    expect(formatMoney(1234567)).toBe('$1.2M');
    expect(formatDiff(-325)).toBe('-$325');
    expect(formatCompact(2500)).toBe('2.5K');
  });
});
