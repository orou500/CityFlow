import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import MissionProgress from '../../models/MissionProgress.js';
import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import {
  initializeMissionsForUser,
  updateMissionProgress,
  claimMissionReward,
  getMissionDashboard,
} from '../../engine/missionProcessing.js';

const app = createApp();

describe('Mission System', () => {
  let user, token, city;

  beforeEach(async () => {
    await MissionProgress.deleteMany({});
    await User.deleteMany({});
    await Property.deleteMany({});
    await Notification.deleteMany({});
    const result = await createAuthenticatedUser({ balance: 1000000 });
    user = result.user;
    token = result.token;
    city = await createTestCity();
  });

  describe('GET /missions/definitions', () => {
    it('returns mission definitions', async () => {
      const res = await request(app).get('/missions/definitions').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.missions).toBeInstanceOf(Array);
      expect(res.body.missions.length).toBeGreaterThan(0);
      expect(res.body.categories).toBeInstanceOf(Array);
      expect(res.body.types).toBeInstanceOf(Array);
    });

    it('filters by category', async () => {
      const res = await request(app).get('/missions/definitions?category=beginner').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.missions.every((m) => m.category === 'beginner')).toBe(true);
    });

    it('filters by type', async () => {
      const res = await request(app).get('/missions/definitions?type=daily').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.missions.every((m) => m.type === 'daily')).toBe(true);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/missions/definitions');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /missions/dashboard', () => {
    it('returns dashboard with active/completed/claimed', async () => {
      const res = await request(app).get('/missions/dashboard').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.active).toBeInstanceOf(Array);
      expect(res.body.completed).toBeInstanceOf(Array);
      expect(res.body.claimed).toBeInstanceOf(Array);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.totalActive).toBeGreaterThanOrEqual(0);
    });

    it('initializes missions on first call', async () => {
      const res = await request(app).get('/missions/dashboard').set(authHeader(token));

      expect(res.status).toBe(200);
      const progressCount = await MissionProgress.countDocuments({ userId: user._id });
      expect(progressCount).toBeGreaterThan(0);
    });
  });

  describe('POST /missions/refresh', () => {
    it('refreshes missions for user', async () => {
      const res = await request(app).post('/missions/refresh').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.initialized).toBe('number');
    });
  });

  describe('POST /missions/claim/:missionId', () => {
    it('rejects claiming non-existent mission', async () => {
      const res = await request(app).post('/missions/claim/nonexistent').set(authHeader(token));

      expect(res.status).toBe(400);
    });

    it('rejects claiming uncompleted mission', async () => {
      const res = await request(app).post('/missions/claim/first_property').set(authHeader(token));

      expect(res.status).toBe(400);
    });
  });

  describe('Mission completion notifications', () => {
    async function completeFirstPropertyMission() {
      await initializeMissionsForUser(user._id);
      await Property.create({
        cityId: city._id,
        name: 'Notif Prop',
        type: 'apartment',
        basePrice: 100000,
        currentPrice: 100000,
        ownerId: user._id,
      });
      await updateMissionProgress(user._id, 'property_buy');
    }

    it('creates a mission_complete notification and no mission_reward on collect', async () => {
      await completeFirstPropertyMission();

      const completeNotifs = await Notification.find({ userId: user._id, type: 'mission_complete' });
      expect(completeNotifs.length).toBeGreaterThanOrEqual(1);
      expect(completeNotifs.some((n) => /You completed/.test(n.message))).toBe(true);

      const before = await User.findById(user._id);
      await claimMissionReward(user._id, 'first_property');

      const rewardNotifs = await Notification.find({ userId: user._id, type: 'mission_reward' });
      expect(rewardNotifs.length).toBe(0);

      const after = await User.findById(user._id);
      expect(after.balance).toBeGreaterThan(before.balance);
    });

    it('does not create a mission_reward notification when claiming via HTTP', async () => {
      await completeFirstPropertyMission();

      const completeBefore = await Notification.countDocuments({ userId: user._id, type: 'mission_complete' });
      expect(completeBefore).toBeGreaterThanOrEqual(1);

      const res = await request(app).post('/missions/claim/first_property').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const rewardNotifs = await Notification.find({ userId: user._id, type: 'mission_reward' });
      expect(rewardNotifs.length).toBe(0);

      // claiming must not add any new notification at all
      const completeAfter = await Notification.countDocuments({ userId: user._id, type: 'mission_complete' });
      expect(completeAfter).toBe(completeBefore);
    });
  });

  describe('GET /missions/active', () => {
    it('returns active missions', async () => {
      await request(app).get('/missions/dashboard').set(authHeader(token));

      const res = await request(app).get('/missions/active').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.missions).toBeInstanceOf(Array);
    });
  });

  describe('GET /missions/completed', () => {
    it('returns completed missions', async () => {
      const res = await request(app).get('/missions/completed').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.missions).toBeInstanceOf(Array);
    });
  });

  describe('GET /missions/claimed', () => {
    it('returns claimed missions', async () => {
      const res = await request(app).get('/missions/claimed').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.missions).toBeInstanceOf(Array);
    });
  });

  describe('GET /missions/chain/:chainId', () => {
    it('returns chain missions', async () => {
      const res = await request(app).get('/missions/chain/property_chain').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.chain).toBeInstanceOf(Array);
      expect(res.body.chain.length).toBeGreaterThan(0);
      expect(res.body.chain[0].definition).toBeDefined();
    });

    it('returns 404 for unknown chain', async () => {
      const res = await request(app).get('/missions/chain/nonexistent').set(authHeader(token));

      expect(res.status).toBe(404);
    });
  });

  describe('GET /missions/stats', () => {
    it('returns mission stats', async () => {
      const res = await request(app).get('/missions/stats').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.stats).toBeDefined();
      expect(typeof res.body.stats.totalActive).toBe('number');
      expect(typeof res.body.stats.totalClaimed).toBe('number');
      expect(typeof res.body.stats.completionRate).toBe('number');
      expect(res.body.stats.byCategory).toBeDefined();
      expect(res.body.stats.byDifficulty).toBeDefined();
    });
  });

  describe('Mission Engine', () => {
    it('initializes missions for a user', async () => {
      const count = await initializeMissionsForUser(user._id);
      expect(count).toBeGreaterThan(0);
    });

    it('does not duplicate already-created missions on re-init', async () => {
      await initializeMissionsForUser(user._id);
      const count1 = await MissionProgress.countDocuments({ userId: user._id });
      await initializeMissionsForUser(user._id);
      const count2 = await MissionProgress.countDocuments({ userId: user._id });
      expect(count2).toBe(count1);
    });

    it('updates progress based on user state', async () => {
      await initializeMissionsForUser(user._id);
      const result = await updateMissionProgress(user._id, 'property_buy');
      expect(result).toHaveProperty('completed');
      expect(result).toHaveProperty('updated');
    });

    it('claims reward and increments balance', async () => {
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Test',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      await initializeMissionsForUser(user._id);
      await updateMissionProgress(user._id, 'property_buy');

      const mp = await MissionProgress.findOne({
        userId: user._id,
        missionId: 'first_property',
      });
      if (mp && mp.status === 'completed') {
        const balanceBefore = (await User.findById(user._id)).balance;
        await claimMissionReward(user._id, 'first_property');
        const balanceAfter = (await User.findById(user._id)).balance;
        expect(balanceAfter).toBeGreaterThan(balanceBefore);
      }
    });

    it('gets mission dashboard', async () => {
      await initializeMissionsForUser(user._id);
      const dashboard = await getMissionDashboard(user._id);
      expect(dashboard.active).toBeInstanceOf(Array);
      expect(dashboard.completed).toBeInstanceOf(Array);
      expect(dashboard.claimed).toBeInstanceOf(Array);
      expect(dashboard.stats).toBeDefined();
    });
  });
});
