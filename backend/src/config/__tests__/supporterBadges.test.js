import { describe, it, expect } from 'vitest';
import { BADGES, TIERS } from '../../config/supporterCosmetics.js';
import { getOptionsPayload } from '../../config/supporterCosmetics.js';

// Mozjibake patterns for UTF-8 emoji decoded as CP1252 (âœ¦/ðŸŽ¨/â¤ï¸/âï¸
// etc.) plus replacement chars — must NEVER appear in badge definitions.
const MOJI_RE =
  /[\u0080-\u00FF\u0152\u0153\u0160\u0161\u017D\u017E\u20AC\u2018\u2019\u201C\u201D\u2026\u2013\u2014]{2,}|[\uFFFD]/;

const EXPECTED = {
  supporter: { icon: '❤️', symbol: '★' },
  early_supporter: { icon: '💎', symbol: '◆' },
  founding_supporter: { icon: '⭐', symbol: '✨' },
};

describe('Supporter badge icon definitions (canonical, UTF-8)', () => {
  it('every badge id resolves to the expected canonical icons', () => {
    for (const [id, expected] of Object.entries(EXPECTED)) {
      const def = BADGES[id];
      expect(def, `missing badge def ${id}`).toBeTruthy();
      expect(def.icon).toBe(expected.icon);
      expect(def.symbol).toBe(expected.symbol);
    }
  });

  it('no badge icon/symbol contains mojibake or replacement characters', () => {
    for (const [id, def] of Object.entries(BADGES)) {
      expect(def.icon, `badge ${id} icon`).not.toMatch(MOJI_RE);
      if (def.symbol !== undefined) {
        expect(def.symbol, `badge ${id} symbol`).not.toMatch(MOJI_RE);
      }
      // Icons must be real presentation strings (never empty for real badges).
      if (id !== 'none') {
        expect(def.icon.length).toBeGreaterThan(0);
        expect((def.symbol || '').length).toBeGreaterThan(0);
      }
    }
  });

  it('the options API payload exposes badge ids only (no raw emoji transmission)', () => {
    const payload = getOptionsPayload();
    expect(payload.badges).toBeTruthy();
    for (const [id, minTier] of Object.entries(payload.badges)) {
      expect(Object.keys(TIERS).map((k) => TIERS[k])).toContain(minTier);
      expect(id).toMatch(/^(none|supporter|early_supporter|founding_supporter)$/);
    }
  });
});
