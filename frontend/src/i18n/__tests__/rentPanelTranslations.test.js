import { describe, it, expect } from 'vitest';
import en from '../en.json';
import he from '../he.json';

const RENT_PANEL_KEYS = [
  'rentSummary',
  'marketRentPerUnit',
  'maximumRentPerUnit',
  'grandfatheredRentNote',
  'nextAvailableIncrease',
  'noIncreaseAvailable',
  'netMonthlyIncome',
];

describe('Rent panel translations', () => {
  it.each([
    ['en', en],
    ['he', he],
  ])('%s has every rent panel key and no placeholders are missing', (_lang, dict) => {
    for (const key of RENT_PANEL_KEYS) {
      expect(dict.propertyManagement[key], `missing propertyManagement.${key}`).toBeTruthy();
    }
  });

  it('grandfatheredRentNote and noIncreaseAvailable have the required interpolation/placeholders', () => {
    expect(en.propertyManagement.grandfatheredRentNote).toContain('{{amount}}');
    expect(he.propertyManagement.grandfatheredRentNote).toContain('{{amount}}');
  });
});
