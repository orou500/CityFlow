import { describe, it, expect } from 'vitest';
import en from '../en.json';
import he from '../he.json';

const INFO_CATEGORIES = ['netWorth', 'properties', 'passiveIncome', 'dealVolume', 'cityInfluence'];

const REQUIRED_KEYS = [
  'how',
  'higher',
  'improveLabel',
  'updates',
  ...INFO_CATEGORIES.flatMap((c) => [`desc.${c}`, `improve.${c}`]),
];

describe('Leaderboard info translations (EN + HE parity)', () => {
  it.each([
    ['en', en],
    ['he', he],
  ])('%s has every leaderboard.info key with real text (no raw keys, no placeholders)', (_lang, dict) => {
    const info = dict.leaderboard?.info;
    expect(info, 'leaderboard.info namespace missing').toBeTruthy();
    for (const key of REQUIRED_KEYS) {
      const value = key.split('.').reduce((o, k) => o?.[k], info);
      expect(typeof value, `leaderboard.info.${key}`).toBe('string');
      expect(value.trim().length, `leaderboard.info.${key} empty`).toBeGreaterThan(0);
      expect(value, `leaderboard.info.${key} looks like a raw key`).not.toMatch(/^leaderboard\./);
    }
    // Category names exist too
    for (const cat of INFO_CATEGORIES) {
      expect(dict.leaderboard.categories[cat]).toBeTruthy();
    }
  });

  it('the updates-cadence copy is accurate (6 game months / 36 hours)', () => {
    expect(en.leaderboard.info.updates).toContain('36 hours');
    expect(en.leaderboard.info.updates).toContain('6 game months');
    expect(he.leaderboard.info.updates).toContain('36');
    expect(he.leaderboard.info.updates).toContain('6');
  });
});
