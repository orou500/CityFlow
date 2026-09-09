import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import Season from '../../models/Season.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import Loan from '../../models/Loan.js';
import Transaction from '../../models/Transaction.js';
import LeaderboardSnapshot from '../../models/LeaderboardSnapshot.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import { computeLeaderboards } from '../../engine/leaderboard.js';

const cacheMock = vi.hoisted(() => ({ delPattern: vi.fn((...args) => args) }));

vi.mock('../../utils/cache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cacheDelPattern: (...args) => {
      cacheMock.delPattern(...args);
      return actual.cacheDelPattern(...args);
    },
  };
});

const app = createApp();

describe('GET /leaderboards/rewards', () => {
  beforeEach(async () => {
    await Season.deleteMany({});
  });

  it('returns the configurable reward tiers and active season', async () => {
    await Season.create({ number: 3, status: 'active' });
    const res = await request(app).get('/leaderboards/rewards');

    expect(res.status).toBe(200);
    expect(res.body.seasonNumber).toBe(3);
    expect(res.body.rewards).toEqual([
      { rank: 1, reward: 100000 },
      { rank: 2, reward: 75000 },
      { rank: 3, reward: 50000 },
      { minRank: 4, maxRank: 10, reward: 25000 },
      { minRank: 11, maxRank: 25, reward: 10000 },
    ]);
  });

  it('falls back to season 1 when no active season exists', async () => {
    const res = await request(app).get('/leaderboards/rewards');
    expect(res.status).toBe(200);
    expect(res.body.seasonNumber).toBe(1);
    expect(res.body.rewards.length).toBeGreaterThan(0);
  });
});

describe('GET /leaderboards/my-rank', () => {
  beforeEach(async () => {
    await Season.deleteMany({});
    await User.deleteMany({});
    await Property.deleteMany({});
    await Loan.deleteMany({});
    await Transaction.deleteMany({});
    await LeaderboardSnapshot.deleteMany({});
    await RealEstateCompany.deleteMany({});
    await Season.create({ number: 1, status: 'active' });
  });

  it('reports a real rank and live value for a player missing from the snapshot', async () => {
    await createAuthenticatedUser({ balance: 100000 });
    const newbie = await createAuthenticatedUser({ balance: 1000 });

    await computeLeaderboards(6);

    // rich is in the snapshot; newbie has no ranking yet (snapshot exists)
    const res = await request(app).get('/leaderboards/my-rank?category=netWorth').set(authHeader(newbie.token));

    expect(res.status).toBe(200);
    expect(res.body.netWorth).toBeDefined();
    // newbie ranks below the rich player with their authoritative balance
    expect(res.body.netWorth.value).toBe(1000);
    expect(res.body.netWorth.rank).toBeGreaterThan(1);
    expect(res.body.netWorth.total).toBeGreaterThan(0);
  });

  it("resolves the player's company entry for company categories", async () => {
    const founder = await createAuthenticatedUser({ balance: 0 });
    const company = await RealEstateCompany.create({
      name: `MyCo_${Date.now()}`,
      founderId: founder.user._id,
      members: [{ userId: founder.user._id, role: 'ceo' }],
      treasury: { balance: 250000, transactions: [] },
      stats: { propertiesOwned: 1 },
      active: true,
    });
    await User.updateOne({ _id: founder.user._id }, { $set: { companyId: company._id } });

    await computeLeaderboards(6);

    const res = await request(app).get('/leaderboards/my-rank?category=companyNetWorth').set(authHeader(founder.token));

    expect(res.status).toBe(200);
    expect(res.body.companyNetWorth.rank).toBe(1);
    expect(res.body.companyNetWorth.value).toBe(250000);
  });
});

describe('leaderboard cache invalidation', () => {
  beforeEach(() => {
    cacheMock.delPattern.mockClear();
  });

  it('invalidates every leaderboard cache key pattern (rankings, summary, myrank, history, player)', async () => {
    const { invalidateLeaderboardCache } = await import('../../routes/leaderboards.js');
    await invalidateLeaderboardCache();

    expect(cacheMock.delPattern).toHaveBeenCalledWith('lb:*');
  });
});

describe('GET /leaderboards/rankings/:category pagination', () => {
  beforeEach(async () => {
    await Season.deleteMany({});
    await LeaderboardSnapshot.deleteMany({});
    await Season.create({ number: 1, status: 'active' });
  });

  it('preserves global ranks across pages (page 3 shows ranks 41-60, not 1-20)', async () => {
    const mongoose = (await import('mongoose')).default;
    const rankings = [];
    for (let i = 1; i <= 60; i += 1) {
      rankings.push({
        userId: new mongoose.Types.ObjectId(),
        username: `p${i}`,
        displayName: `P${i}`,
        avatar: '',
        value: 60000 - i,
        rank: i,
        previousRank: null,
        rankChange: 0,
      });
    }
    await LeaderboardSnapshot.create({
      category: 'netWorth',
      seasonNumber: 1,
      tickNumber: 6,
      rankings,
      computedAt: new Date(),
    });

    const res = await request(app).get('/leaderboards/rankings/netWorth?limit=20&offset=40');
    expect(res.status).toBe(200);
    expect(res.body.rankings).toHaveLength(20);
    expect(res.body.rankings[0].rank).toBe(41);
    expect(res.body.rankings[19].rank).toBe(60);
    expect(res.body.total).toBe(60);
  });
});
