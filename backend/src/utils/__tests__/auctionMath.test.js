import { describe, it, expect } from 'vitest';
import { calculateMinimumNextBid, isReserveMet, calculateMinimumWinningBid } from '../auctionMath.js';

/**
 * Minimum Winning Bid unit tests.
 *
 * The Eco-Luxury Tower scenario that triggered this system:
 *   startingBid = 3,927,779
 *   reservePrice = 4,488,890
 *   bidIncrement = max(1000, floor(3,927,779 * 0.05)) = 196,388
 *   currentBid = 3,927,779
 *
 * The plain next-bid rule gives 4,124,167 ($196,388 above the current bid),
 * which is BELOW the reserve — so a bidder at that amount would win the
 * auction right now yet never receive the property (settlement requires
 * currentBid >= reservePrice). minimumWinningBid therefore pushes the floor up
 * to the reserve: $4,488,890.
 */
function ecoLuxuryAuction(overrides = {}) {
  return {
    auctionType: 'reserve',
    startingBid: 3927779,
    currentBid: 3927779,
    bidIncrement: 196388,
    reservePrice: 4488890,
    reserveMet: false,
    ...overrides,
  };
}

describe('calculateMinimumNextBid', () => {
  it('uses the starting bid when no bid has been placed yet', () => {
    expect(calculateMinimumNextBid({ startingBid: 5000, currentBid: 0, bidIncrement: 100 })).toBe(5000);
  });

  it('adds the bid increment to the current bid once bids exist', () => {
    expect(calculateMinimumNextBid({ startingBid: 5000, currentBid: 10000, bidIncrement: 500 })).toBe(10500);
  });

  it('treats a missing/NaN increment as 0', () => {
    expect(calculateMinimumNextBid({ startingBid: 5000, currentBid: 10000, bidIncrement: 'nope' })).toBe(10000);
  });
});

describe('isReserveMet', () => {
  it('always true for standard auctions', () => {
    expect(isReserveMet({ auctionType: 'standard', currentBid: 1, reservePrice: 999999 })).toBe(true);
  });

  it('true when currentBid >= reservePrice even if the persisted flag is stale', () => {
    expect(
      isReserveMet({ auctionType: 'reserve', currentBid: 4488890, reservePrice: 4488890, reserveMet: false }),
    ).toBe(true);
  });

  it('true when the persisted flag says met', () => {
    expect(isReserveMet({ auctionType: 'reserve', currentBid: 30000, reservePrice: 50000, reserveMet: true })).toBe(
      true,
    );
  });

  it('false when below the reserve and no met flag', () => {
    expect(isReserveMet({ auctionType: 'reserve', currentBid: 30000, reservePrice: 50000, reserveMet: false })).toBe(
      false,
    );
  });
});

describe('calculateMinimumWinningBid', () => {
  it('Eco-Luxury: minimum winning bid = the reserve when the next bid is below it', () => {
    expect(calculateMinimumWinningBid(ecoLuxuryAuction())).toBe(4488890);
  });

  it('the exact reserve bid is the legal minimum (>= semantics)', () => {
    expect(calculateMinimumWinningBid(ecoLuxuryAuction())).toBe(4488890);
    expect(ecoLuxuryAuction().currentBid).toBeLessThan(ecoLuxuryAuction().reservePrice);
  });

  it('for a fresh reserve auction with no bids, the floor is max(startingBid, reserve)', () => {
    expect(
      calculateMinimumWinningBid({ auctionType: 'reserve', startingBid: 5000, currentBid: 0, reservePrice: 8000 }),
    ).toBe(8000);
    // Reserve below the starting bid -> the starting bid governs.
    expect(
      calculateMinimumWinningBid({ auctionType: 'reserve', startingBid: 5000, currentBid: 0, reservePrice: 2000 }),
    ).toBe(5000);
  });

  it('once the reserve is met, the floor drops back to the normal next-bid rule', () => {
    expect(calculateMinimumWinningBid(ecoLuxuryAuction({ reserveMet: true, currentBid: 4488890 }))).toBe(
      4488890 + 196388,
    );
  });

  it('never allows a bid below what the current winner would need to outbid', () => {
    expect(
      calculateMinimumWinningBid({
        auctionType: 'reserve',
        startingBid: 1000,
        currentBid: 4400000,
        bidIncrement: 200000,
        reservePrice: 4500000,
        reserveMet: false,
      }),
    ).toBe(4600000);
  });

  it('standard auctions use the plain next-bid rule', () => {
    expect(
      calculateMinimumWinningBid({ auctionType: 'standard', startingBid: 1000, currentBid: 0, bidIncrement: 250 }),
    ).toBe(1000);
    expect(
      calculateMinimumWinningBid({ auctionType: 'standard', startingBid: 1000, currentBid: 5000, bidIncrement: 250 }),
    ).toBe(5250);
  });
});
