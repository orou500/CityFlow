import { describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestUser, authHeader, generateToken } from '../../test/helpers.js';
import Season from '../../models/Season.js';
import LeaderboardSnapshot from '../../models/LeaderboardSnapshot.js';
import CompetitiveEvent from '../../models/CompetitiveEvent.js';
import District from '../../models/District.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';

const app = createApp();

const COSMETICS = {
  usernameStyle: { type: 'gradient', color: 'cityflow_cyan', gradient: 'neon', animated: false },
  usernameEffect: 'soft_glow',
  profileBackground: 'ocean_city',
  profileBackgroundEffect: 'gradient',
  profileBorder: 'cyan',
  avatarFrame: 'gradient_ring',
  badge: 'supporter',
  title: 'city_builder',
};

async function makeSupporter(overrides = {}) {
  const { user, token } = await createAuthenticatedUser({
    supporter: { badge: 'supporter', title: 'Community Supporter', isAnonymous: false },
    donationStats: { totalDonated: 10, donorSince: new Date('2026-01-01'), donationCount: 1 },
    cosmetics: COSMETICS,
    ...overrides,
  });
  return { user, token };
}

async function seedActiveSeason() {
  await Season.deleteMany({});
  return Season.create({ number: 1, status: 'active' });
}

describe('Supporter identity resolution across ranked surfaces', () => {
  describe('GET /leaderboards/player/:userId', () => {
    it('includes cosmetics, supporterBadge and supporterSince', async () => {
      const { user, token } = await makeSupporter();
      const res = await request(app).get(`/leaderboards/player/${user._id}`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.user.cosmetics).toMatchObject({ usernameEffect: 'soft_glow' });
      expect(res.body.user.supporterBadge).toBe('supporter');
      expect(res.body.user.supporterSince).toBeTruthy();
    });

    it('omits supporter badge for a plain user (default cosmetics only)', async () => {
      const { user, token } = await createAuthenticatedUser();
      const res = await request(app).get(`/leaderboards/player/${user._id}`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.user.supporterBadge).toBeUndefined();
      expect(res.body.user.supporterSince).toBeUndefined();
      // The cosmetics subdoc exists with defaults; the avatar frame is 'none'
      // so no cosmetic is actually rendered.
      expect(res.body.user.cosmetics?.avatarFrame).toBe('none');
    });
  });

  describe('GET /leaderboards/rankings/:category', () => {
    it('resolves current cosmetics on entries without changing rank/value', async () => {
      const { user } = await makeSupporter();
      const other = await createTestUser({ displayName: 'Plain Player' });
      await seedActiveSeason();
      await LeaderboardSnapshot.create({
        category: 'netWorth',
        seasonNumber: 1,
        tickNumber: 10,
        rankings: [
          { userId: other._id, username: other.username, rank: 1, value: 900000 },
          { userId: user._id, username: user.username, rank: 2, value: 800000 },
        ],
      });

      const res = await request(app).get('/leaderboards/rankings/netWorth?season=1');
      expect(res.status).toBe(200);
      const entries = res.body.rankings || res.body.entries;
      expect(entries).toHaveLength(2);
      const supporterEntry = entries.find((e) => e.userId === user._id.toString());
      expect(supporterEntry.rank).toBe(2);
      expect(supporterEntry.value).toBe(800000);
      expect(supporterEntry.cosmetics).toBeTruthy();
      expect(supporterEntry.supporterBadge).toBe('supporter');
      const plainEntry = entries.find((e) => e.userId === other._id.toString());
      expect(plainEntry.supporterBadge).toBeUndefined();
      expect(plainEntry.supporterSince).toBeUndefined();
      // Default cosmetics exist but render nothing (avatarFrame 'none').
      expect(plainEntry.cosmetics?.avatarFrame).toBe('none');
    });
  });

  describe('GET /donations/top-supporters', () => {
    it('includes cosmetics on supporter entries', async () => {
      await makeSupporter();
      const res = await request(app).get('/donations/top-supporters');
      expect(res.status).toBe(200);
      const entry = res.body.supporters.find((s) => s.cosmetics);
      expect(entry).toBeTruthy();
      expect(entry.cosmetics.usernameEffect).toBe('soft_glow');
    });
  });

  describe('GET /stats (topPlayers)', () => {
    it('includes cosmetics and supporter badge for supporters', async () => {
      const { user } = await makeSupporter();
      const res = await request(app).get('/stats');
      expect(res.status).toBe(200);
      const entry = res.body.topPlayers.find((p) => p._id === user._id.toString());
      expect(entry).toBeTruthy();
      expect(entry.cosmetics).toBeTruthy();
      expect(entry.supporterBadge).toBe('supporter');
    });
  });

  describe('GET /districts/:id (top investors)', () => {
    it('resolves cosmetics in one bulk pass (no N+1 payloads)', async () => {
      const { user } = await makeSupporter();
      const district = await District.create({
        name: 'Test District',
        cityId: new mongoose.Types.ObjectId(),
        tier: 'commercial',
        influence: [{ userId: user._id, score: 0.5, tier: 'market_leader', propertyCount: 2, totalInvested: 500000 }],
        totalInfluencePoints: 120,
      });
      const res = await request(app).get(`/districts/${district._id}`);
      expect(res.status).toBe(200);
      const investor = res.body.topInvestors.find((i) => i.userId === user._id.toString());
      expect(investor).toBeTruthy();
      expect(investor.cosmetics).toBeTruthy();
      expect(investor.username).toBe(user.username);
      // Score/tier data is untouched.
      expect(investor.score).toBe(0.5);
    });

    it('resolves cosmetics on the influence rankings endpoint', async () => {
      const { user } = await makeSupporter();
      const district = await District.create({
        name: 'Influence District',
        cityId: new mongoose.Types.ObjectId(),
        tier: 'commercial',
        influence: [
          { userId: user._id, score: 0.3, tier: 'significant_investor', propertyCount: 1, totalInvested: 100000 },
        ],
        totalInfluencePoints: 80,
      });
      const res = await request(app).get(`/districts/${district._id}/influence`);
      expect(res.status).toBe(200);
      const row = (res.body.rankings || []).find((r) => r.userId === user._id.toString());
      expect(row).toBeTruthy();
      expect(row.cosmetics).toBeTruthy();
    });
  });

  describe('GET /real-estate-companies/:id (members)', () => {
    it('populates member cosmetics and displayName', async () => {
      const { user } = await makeSupporter({ displayName: 'Supporter Alias' });
      const founder = await createTestUser();
      const viewer = await createTestUser();
      const company = await RealEstateCompany.create({
        name: 'Test Company',
        founderId: founder._id,
        members: [{ userId: user._id, role: 'member', joinedAt: new Date(), shares: 1 }],
        totalShares: 100,
      });
      const res = await request(app)
        .get(`/real-estate-companies/${company._id}`)
        .set(authHeader(generateToken(viewer._id)));
      expect(res.status).toBe(200);
      const member = res.body.members.find((m) => m.userId?._id?.toString() === user._id.toString());
      expect(member).toBeTruthy();
      expect(member.userId.cosmetics).toBeTruthy();
      expect(member.userId.displayName).toBe('Supporter Alias');
    });
  });

  describe('GET /leaderboards/events (completed participants)', () => {
    it('resolves cosmetics for completed event participants too', async () => {
      const { user } = await makeSupporter();
      await CompetitiveEvent.create({
        name: 'Past Event',
        type: 'wealth',
        metric: 'netWorth',
        status: 'completed',
        startTick: 1,
        endTick: 40,
        participants: [{ userId: user._id, username: user.username, rank: 1, value: 5000 }],
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
      });
      const res = await request(app).get('/leaderboards/events?status=completed');
      expect(res.status).toBe(200);
      const event = res.body.events.find((e) => e.name === 'Past Event');
      expect(event).toBeTruthy();
      const participant = event.participants.find((p) => p.userId?.toString() === user._id.toString());
      expect(participant).toBeTruthy();
      expect(participant.cosmetics).toBeTruthy();
      expect(participant.rank).toBe(1);
      expect(participant.value).toBe(5000);
    });
  });

  describe('GET /seasons (archives)', () => {
    it('resolves the winner as an identity object and cosmetics on rankings', async () => {
      const { user } = await makeSupporter();
      await seedActiveSeason();
      await Season.create({
        number: 2,
        name: 'Season Two',
        status: 'completed',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-06-01'),
        archive: {
          winner: user._id,
          totalPlayers: 10,
          totalTransactions: 0,
          playerRankings: [
            {
              userId: user._id,
              username: user.username,
              rank: 1,
              netWorth: 500000,
              balance: 100000,
              portfolioValue: 400000,
              propertiesOwned: 3,
            },
          ],
        },
      });

      const res = await request(app).get('/seasons');
      expect(res.status).toBe(200);
      const season = res.body.completedSeasons.find((s) => s.number === 2);
      expect(season).toBeTruthy();
      expect(season.archive.winner).toBeTruthy();
      expect(season.archive.winner.username).toBe(user.username);
      expect(season.archive.winner.cosmetics).toBeTruthy();
      const row = season.archive.playerRankings.find((p) => p.userId?.toString() === user._id.toString());
      expect(row).toBeTruthy();
      expect(row.cosmetics).toBeTruthy();
      expect(row.rank).toBe(1);
      expect(row.netWorth).toBe(500000);
    });
  });
});
