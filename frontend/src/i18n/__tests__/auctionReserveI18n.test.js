import { describe, it, expect } from 'vitest';
import en from '../en.json';
import he from '../he.json';

// Every new key introduced by the "Minimum Winning Bid" reserve-auction work
// must exist in BOTH locales with the SAME key name, and no value may be a raw
// key (which would leak into the UI) or contain mojibake.
const NEW_AUCTION_KEYS = [
  'auctions.reserveNotMet',
  'auctions.reserveMet',
  'auctions.minimumWinningBid',
  'auctions.needMoreToReserve',
  'auctions.gapToReserve',
  'auctions.endedReserveNotMet',
  'errors.reserveMinimumBid',
];

const MOJI_RE = /[\u0080-\u00FF\u0152\u0153\u0160\u0161\u017D\u017E\u20AC\u2018\u2019\u201C\u201D\u2026\u2013\u2014]{2,}|[\uFFFD]/;

function lookup(dict, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), dict);
}

describe('reserve minimum-bid i18n key coverage', () => {
  for (const key of NEW_AUCTION_KEYS) {
    it(`EN exposes ${key}`, () => {
      const v = lookup(en, key);
      expect(v, `EN missing ${key}`).toBeTruthy();
      expect(v, `${key} must not be a raw key`).not.toBe(key);
    });
    it(`HE exposes ${key}`, () => {
      const v = lookup(he, key);
      expect(v, `HE missing ${key}`).toBeTruthy();
      expect(v, `${key} must not be a raw key`).not.toBe(key);
    });
  }

  it('interpolation placeholders are consistent across locales', () => {
    const enPlaces = (k) => [...String(lookup(en, k)).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const hePlaces = (k) => [...String(lookup(he, k)).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const key of ['auctions.needMoreToReserve', 'auctions.gapToReserve', 'errors.reserveMinimumBid']) {
      expect(hePlaces(key), `HE placeholder mismatch for ${key}`).toEqual(enPlaces(key));
    }
  });

  it('no new value contains mojibake or replacement characters', () => {
    const all = JSON.stringify(NEW_AUCTION_KEYS.map((k) => lookup(en, k)).concat(NEW_AUCTION_KEYS.map((k) => lookup(he, k))));
    expect(all).not.toMatch(MOJI_RE);
  });
});
