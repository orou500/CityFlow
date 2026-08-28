import { describe, it, expect } from 'vitest';
import { getAuctionProperty, isAuctionPropertyKnown } from '../auctionProperty';

describe('getAuctionProperty', () => {
  it('reads the normalized `property` field first (list payloads)', () => {
    const prop = { _id: 'p1', name: 'Skyline Tower' };
    const auction = { property: prop, propertyId: 'p1' };
    expect(getAuctionProperty(auction)).toBe(prop);
  });

  it('falls back to the object `propertyId` (detail/featured/my-bids payloads)', () => {
    const prop = { _id: 'p1', name: 'Skyline Tower' };
    expect(getAuctionProperty({ propertyId: prop })).toBe(prop);
  });

  it('returns null when nothing useful is attached', () => {
    expect(getAuctionProperty({})).toBeNull();
    expect(getAuctionProperty({ propertyId: 'p1' })).toBeNull();
    expect(getAuctionProperty({ property: null })).toBeNull();
    expect(getAuctionProperty({ property: 'p1' })).toBeNull();
  });
});

describe('isAuctionPropertyKnown', () => {
  it('treats a live property as known', () => {
    expect(isAuctionPropertyKnown({ property: { _id: 'p1', name: 'Tower' } })).toBe(true);
  });

  it('treats a snapshot object as known even though not propertyAvailable', () => {
    const auction = {
      propertyAvailable: false,
      property: { _id: 'p1', name: 'Tower', fromSnapshot: true },
    };
    expect(isAuctionPropertyKnown(auction)).toBe(true);
  });

  it('treats a legacy placeholder (unavailable, no name) as unknown', () => {
    const auction = {
      propertyAvailable: false,
      property: { _id: 'p1', name: null, unavailable: true },
    };
    expect(isAuctionPropertyKnown(auction)).toBe(false);
  });

  it('treats a nameless non-available record as unknown', () => {
    expect(isAuctionPropertyKnown({ propertyAvailable: false, property: { _id: 'p1' } })).toBe(false);
  });

  it('is unknown when no property object exists at all', () => {
    expect(isAuctionPropertyKnown({ propertyId: 'p1' })).toBe(false);
    expect(isAuctionPropertyKnown({})).toBe(false);
  });
});
