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

  it('resolves an upcoming auction exactly at its start boundary as active', () => {
    const result = computeAuctionRemaining({ ...base, status: 'upcoming' }, 105);
    expect(result.status).toBe('active');
    expect(result.remainingMonths).toBe(8); // endTick 113 - currentTick 105
  });

  it('resolves an active auction exactly at its end boundary as ending (0 remaining)', () => {
    const result = computeAuctionRemaining({ ...base, status: 'active' }, 113);
    expect(result.status).toBe('ending');
    expect(result.remainingMonths).toBe(0);
  });

  it('resolves an active auction past its end boundary as ending (never negative)', () => {
    const result = computeAuctionRemaining({ ...base, status: 'active' }, 120);
    expect(result.status).toBe('ending');
    expect(result.remainingMonths).toBe(0);
  });

  it('keeps an upcoming auction with a future startTick as upcoming', () => {
    const result = computeAuctionRemaining({ ...base, status: 'upcoming' }, 100);
    expect(result.status).toBe('upcoming');
    expect(result.remainingMonths).toBe(5);
  });

  it('handles extended auctions (endTick moved out by anti-sniping)', () => {
    const extended = { startTick: 105, endTick: 120, originalEndTick: 113, status: 'active' };
    const result = computeAuctionRemaining(extended, 115);
    expect(result.remainingMonths).toBe(5);
    const stillActive = computeAuctionRemaining(extended, 113);
    expect(stillActive.status).toBe('active');
    expect(stillActive.remainingMonths).toBe(7);
  });

  it('handles newly created auctions (upcoming, starts next tick)', () => {
    const created = { startTick: 101, endTick: 109, status: 'upcoming' };
    const result = computeAuctionRemaining(created, 100);
    expect(result.status).toBe('upcoming');
    expect(result.remainingMonths).toBe(1);
  });

  it('produces the full consistent snapshot in every response', () => {
    const result = computeAuctionRemaining({ ...base, status: 'active' }, 110);
    expect(result).toEqual({
      currentTick: 110,
      startTick: 105,
      endTick: 113,
      status: 'active',
      remainingMonths: 3,
      ticksRemaining: 3,
    });
  });
});
