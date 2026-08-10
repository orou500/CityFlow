import { describe, it, expect } from 'vitest';
import { computeAuctionRemaining } from '../auctionTime.js';

describe('computeAuctionRemaining', () => {
  const base = { startTick: 105, endTick: 113 };

  it('uses startTick for upcoming auctions', () => {
    const result = computeAuctionRemaining({ ...base, status: 'upcoming' }, 100);
    expect(result.remainingMonths).toBe(5);
    expect(result.ticksRemaining).toBe(5);
    expect(result.currentTick).toBe(100);
    expect(result.startTick).toBe(105);
    expect(result.endTick).toBe(113);
    expect(result.status).toBe('upcoming');
  });

  it('counts down as ticks advance before the auction starts', () => {
    const result = computeAuctionRemaining({ ...base, status: 'upcoming' }, 103);
    expect(result.remainingMonths).toBe(2);
  });

  it('uses endTick for active auctions', () => {
    const result = computeAuctionRemaining({ ...base, status: 'active' }, 105);
    expect(result.remainingMonths).toBe(8);
  });

  it('counts down as ticks advance for active auctions', () => {
    const result = computeAuctionRemaining({ ...base, status: 'active' }, 112);
    expect(result.remainingMonths).toBe(1);
  });

  it('clamps to 0 once the end tick has passed', () => {
    const result = computeAuctionRemaining({ ...base, status: 'active' }, 113);
    expect(result.remainingMonths).toBe(0);
    const later = computeAuctionRemaining({ ...base, status: 'active' }, 120);
    expect(later.remainingMonths).toBe(0);
  });

  it('returns 0 for ending, ended and cancelled auctions', () => {
    expect(computeAuctionRemaining({ ...base, status: 'ending' }, 100).remainingMonths).toBe(0);
    expect(computeAuctionRemaining({ ...base, status: 'ended' }, 100).remainingMonths).toBe(0);
    expect(computeAuctionRemaining({ ...base, status: 'cancelled' }, 100).remainingMonths).toBe(0);
  });

  it('preserves ticksRemaining as a backward-compatible alias of remainingMonths', () => {
    const result = computeAuctionRemaining({ ...base, status: 'active' }, 105);
    expect(result.ticksRemaining).toBe(result.remainingMonths);
    expect(result.ticksRemaining).toBe(8);
  });

  it('treats missing ticks as 0', () => {
    const result = computeAuctionRemaining({ status: 'active', startTick: 0, endTick: 0 }, 0);
    expect(result.remainingMonths).toBe(0);
  });
});
