import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import Season from '../../models/Season.js';

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
