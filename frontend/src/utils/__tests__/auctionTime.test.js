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

  it('returns null when currentTick is missing (never computes against 0)', () => {
    // The original intermittent bug: a payload without a tick made the client
    // compute the whole auction length (endTick - 0) instead of the countdown.
    expect(getAuctionRemainingMonths({ status: 'active', endTick: 100 })).toBeNull();
    expect(getAuctionRemainingMonths({ status: 'upcoming', startTick: 100 })).toBeNull();
    expect(getAuctionRemainingMonths({})).toBeNull();
  });

  it('prefers the server remainingMonths even when currentTick is missing', () => {
    expect(getAuctionRemainingMonths({ status: 'active', remainingMonths: 3 })).toBe(3);
  });

  it('resolves an upcoming auction at/past its start boundary as active', () => {
    expect(getAuctionRemainingMonths({ status: 'upcoming', startTick: 100, endTick: 113, currentTick: 100 })).toBe(13);
    expect(getAuctionRemainingMonths({ status: 'upcoming', startTick: 100, endTick: 113, currentTick: 105 })).toBe(8);
  });

  it('keeps an upcoming auction with a future startTick as upcoming', () => {
    expect(getAuctionRemainingMonths({ status: 'upcoming', startTick: 105, endTick: 113, currentTick: 100 })).toBe(5);
  });

  it('handles extended auctions via the endTick', () => {
    expect(getAuctionRemainingMonths({ status: 'active', endTick: 120, currentTick: 113 })).toBe(7);
    expect(getAuctionRemainingMonths({ status: 'active', endTick: 120, currentTick: 115 })).toBe(5);
  });
});
