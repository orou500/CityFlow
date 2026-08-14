import { describe, it, expect } from 'vitest';
import { getAuctionRemainingMonths } from '../auctionTime';

describe('auction remaining time (never elapsed, never negative)', () => {
  it('active auction: endTick - currentTick', () => {
    expect(getAuctionRemainingMonths({ status: 'active', endTick: 100, currentTick: 60 })).toBe(40);
  });

  it('upcoming auction: time until start, not elapsed since creation', () => {
    expect(getAuctionRemainingMonths({ status: 'upcoming', startTick: 100, currentTick: 60 })).toBe(40);
  });

  it('ending auction uses endTick like active', () => {
    expect(getAuctionRemainingMonths({ status: 'ending', endTick: 100, currentTick: 98 })).toBe(2);
  });

  it('clamps negative values to zero (never shows negative time)', () => {
    expect(getAuctionRemainingMonths({ status: 'active', endTick: 100, currentTick: 150 })).toBe(0);
    expect(getAuctionRemainingMonths({ status: 'upcoming', startTick: 100, currentTick: 200 })).toBe(0);
  });

  it('prefers the server remainingMonths when present', () => {
    expect(getAuctionRemainingMonths({ status: 'active', remainingMonths: 3, endTick: 100, currentTick: 60 })).toBe(3);
    expect(getAuctionRemainingMonths({ status: 'active', remainingMonths: -2 })).toBe(0);
  });

  it('rounds to whole months (floor at zero)', () => {
    expect(getAuctionRemainingMonths({ status: 'active', endTick: 100, currentTick: 60.4 })).toBe(40);
  });
});
