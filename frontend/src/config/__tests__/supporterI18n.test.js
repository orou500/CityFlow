import { describe, it, expect } from 'vitest';
import en from '../../i18n/en.json';
import he from '../../i18n/he.json';
import { KNOWN_OPTION_IDS, LABEL_FALLBACK_KEYS, BADGES } from '../../config/supporterCosmetics.js';

// Mozjibake patterns (UTF-8 decoded as CP1252) + replacement chars.
const MOJI_RE =
  /[\u0080-\u00FF\u0152\u0153\u0160\u0161\u017D\u017E\u20AC\u2018\u2019\u201C\u201D\u2026\u2013\u2014]{2,}|[\uFFFD]/;

// Canonical badge icons/symbols (single source of truth — BADGES).
const EXPECTED_BADGES = {
  supporter: { icon: '❤️', symbol: '★' },
  early_supporter: { icon: '💎', symbol: '◆' },
  founding_supporter: { icon: '⭐', symbol: '✨' },
};

// Validates that every canonical option id has a localized label key in BOTH
// locales with the SAME key name — the exact bug class that leaked
// `supporterIdentity.title.global_developer` (ids were snake_case, keys
// camelCase). Any future id added to the config must come with a key here.
describe('supporterIdentity i18n key coverage', () => {
  const enSI = en.supporterIdentity;
  const heSI = he.supporterIdentity;

  it('both locales expose the same supporterIdentity groups', () => {
    const groups = [
      'tier',
      'color',
      'gradient',
      'effect',
      'background',
      'backgroundEffect',
      'border',
      'avatarFrame',
      'badge',
      'title',
      'preset',
    ];
    for (const g of groups) {
      expect(enSI[g], `en missing group ${g}`).toBeTruthy();
      expect(heSI[g], `he missing group ${g}`).toBeTruthy();
    }
  });

  it('every known option id resolves in EN and HE', () => {
    for (const [group, ids] of Object.entries(KNOWN_OPTION_IDS)) {
      for (const id of ids) {
        const key = `supporterIdentity.${group}.${id}`;
        expect(enSI[group][id], `EN missing ${key}`).toBeTruthy();
        expect(heSI[group][id], `HE missing ${key}`).toBeTruthy();
      }
    }
  });

  it('every label fallback id used by the resolver exists in both locales', () => {
    for (const [group, fallbackId] of Object.entries(LABEL_FALLBACK_KEYS)) {
      expect(enSI[group][fallbackId], `EN missing fallback ${group}.${fallbackId}`).toBeTruthy();
      expect(heSI[group][fallbackId], `HE missing fallback ${group}.${fallbackId}`).toBeTruthy();
    }
  });

  it('no label value is a raw key (would leak into the UI)', () => {
    const namespaces = [
      'tier',
      'color',
      'gradient',
      'effect',
      'background',
      'backgroundEffect',
      'border',
      'avatarFrame',
      'badge',
      'title',
      'preset',
    ];
    for (const lang of [enSI, heSI]) {
      for (const g of namespaces) {
        for (const [id, value] of Object.entries(lang[g] || {})) {
          expect(value, `${g}.${id} value must not be a raw key`).not.toBe(`supporterIdentity.${g}.${id}`);
          expect(String(value)).not.toMatch(/supporterIdentity\./);
        }
      }
    }
  });

  it('no label value contains mojibake or replacement characters', () => {
    const all = JSON.stringify({ enSI, heSI });
    expect(all).not.toMatch(MOJI_RE);
  });

  it('canonical badge icons resolve to the expected Unicode (TEST 1/2)', () => {
    for (const [id, expected] of Object.entries(EXPECTED_BADGES)) {
      const def = BADGES[id];
      expect(def, `missing badge ${id}`).toBeTruthy();
      expect(def.icon).toBe(expected.icon);
      expect(def.symbol).toBe(expected.symbol);
    }
  });

  it('no badge icon/symbol contains mojibake (TEST 3)', () => {
    for (const [id, def] of Object.entries(BADGES)) {
      expect(def.icon, `badge ${id} icon`).not.toMatch(MOJI_RE);
      expect(def.symbol, `badge ${id} symbol`).not.toMatch(MOJI_RE);
      if (id !== 'none') {
        expect(def.icon.length).toBeGreaterThan(0);
        expect(def.symbol.length).toBeGreaterThan(0);
      }
    }
  });
});
