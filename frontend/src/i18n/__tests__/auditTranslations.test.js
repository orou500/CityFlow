import { describe, it, expect } from 'vitest';
import en from '../en.json';
import he from '../he.json';

describe('missions collect translation (Hebrew fix)', () => {
  it('he.json no longer uses the wrong word קבץ', () => {
    const raw = JSON.stringify(he);
    expect(raw).not.toContain('קבץ');
  });

  it('both languages have the Collect button key', () => {
    expect(en.missions.collect).toBe('Collect');
    expect(he.missions.collect).toBe('קבל');
  });

  it('claimReward exists in both languages', () => {
    expect(en.missions.claimReward).toBeTruthy();
    expect(he.missions.claimReward).toBeTruthy();
  });
});

describe('monthly increase / change semantics', () => {
  it('both languages have monthlyIncrease and monthlyChange keys', () => {
    expect(en.propertyManagement.monthlyIncrease).toBeTruthy();
    expect(en.propertyManagement.monthlyChange).toBeTruthy();
    expect(he.propertyManagement.monthlyIncrease).toBeTruthy();
    expect(he.propertyManagement.monthlyChange).toBeTruthy();
    expect(en.propertyManagement.monthlyChange).not.toBe(en.propertyManagement.monthlyIncrease);
  });
});

describe('property offers section keys', () => {
  const KEYS = [
    'offersTitle',
    'noOffers',
    'offerAccepted',
    'offerRejected',
    'offerCreated',
    'offerExpires',
    'offerPending',
    'offerExpired',
    'acceptOffer',
    'rejectOffer',
  ];
  it.each([
    ['en', en],
    ['he', he],
  ])('%s has every property offers key', (_lang, dict) => {
    for (const key of KEYS) {
      expect(dict.propertyDetail[key], `propertyDetail.${key}`).toBeTruthy();
    }
  });
});

describe('onboarding buy-property fallback keys', () => {
  it.each([
    ['en', en],
    ['he', he],
  ])('%s has the fallback keys', (_lang, dict) => {
    expect(dict.onboarding.tour.noCheapProperty).toBeTruthy();
    expect(dict.onboarding.tour.noCheapPropertyHint).toBeTruthy();
    expect(dict.onboarding.tour.browseProperties).toBeTruthy();
    expect(dict.onboarding.tour.refreshInventory).toBeTruthy();
  });
});
