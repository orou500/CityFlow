import { describe, it, expect } from 'vitest';
import { getXpForLevel, getLevelFromXp } from '../leveling.js';

describe('getXpForLevel', () => {
  it('returns 100 for level 1', () => {
    expect(getXpForLevel(1)).toBe(100);
  });

  it('returns 150 for level 2', () => {
    expect(getXpForLevel(2)).toBe(150);
  });

  it('increases exponentially', () => {
    expect(getXpForLevel(5)).toBeGreaterThan(getXpForLevel(4));
    expect(getXpForLevel(4)).toBeGreaterThan(getXpForLevel(3));
  });

  it('returns 225 for level 3 (100 * 1.5^2)', () => {
    expect(getXpForLevel(3)).toBe(225);
  });
});

describe('getLevelFromXp', () => {
  it('returns level 1 with 0 xp at level 1', () => {
    const result = getLevelFromXp(0);
    expect(result.level).toBe(1);
    expect(result.xpInCurrentLevel).toBe(0);
    expect(result.xpToNextLevel).toBe(100);
  });

  it('returns level 1 with 50 xp at level 1', () => {
    const result = getLevelFromXp(50);
    expect(result.level).toBe(1);
    expect(result.xpInCurrentLevel).toBe(50);
    expect(result.xpToNextLevel).toBe(100);
  });

  it('returns level 2 with exactly 100 xp', () => {
    const result = getLevelFromXp(100);
    expect(result.level).toBe(2);
    expect(result.xpInCurrentLevel).toBe(0);
    expect(result.xpToNextLevel).toBe(150);
  });

  it('returns level 2 with 200 xp (100 l1 + 100 l2)', () => {
    const result = getLevelFromXp(250);
    expect(result.level).toBe(3);
    expect(result.xpInCurrentLevel).toBe(0);
    expect(result.xpToNextLevel).toBe(225);
  });

  it('handles large XP values', () => {
    const result = getLevelFromXp(10000);
    expect(result.level).toBeGreaterThan(5);
    expect(result.xpInCurrentLevel).toBeGreaterThanOrEqual(0);
    expect(result.xpInCurrentLevel).toBeLessThan(result.xpToNextLevel);
  });
});
