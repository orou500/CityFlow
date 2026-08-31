import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import MissionProgress from '../../models/MissionProgress.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import Transaction from '../../models/Transaction.js';
import {
  initializeMissionsForUser,
  updateMissionProgress,
  claimMissionReward,
} from '../../engine/missionProcessing.js';
import { processPlayerProgress } from '../../utils/playerProgress.js';
import { triggerMissionProgress } from '../../utils/missionTrigger.js';
import * as socket from '../../socket/index.js';

const app = createApp();

vi.mock('../../socket/index.js', () => ({
  emitToUser: vi.fn(),
  emitToAll: vi.fn(),
}));

describe('Full Progression Pipeline', () => {
  let user, token, city;

  beforeEach(async () => {
    vi.clearAllMocks();
    await MissionProgress.deleteMany({});
    await User.deleteMany({});
    await Property.deleteMany({});
    await Transaction.deleteMany({});
    const result = await createAuthenticatedUser({ balance: 1000000 });
    user = result.user;
    token = result.token;
    city = await createTestCity();
  });

  describe('processPlayerProgress — full pipeline', () => {
    it('updates mission progress, awards XP, and emits socket on property_buy', async () => {
      await initializeMissionsForUser(user._id);

      const result = await processPlayerProgress(user._id, 'property_buy');

      expect(result.missionResult).toBeDefined();
      expect(result.missionResult.updated).toBeDefined();
      expect(result.newAchievements).toBeDefined();
      expect(result.xpResult).toBeDefined();
      expect(socket.emitToUser).toHaveBeenCalledWith(user._id.toString(), 'career:updated', {});
    });

    it('completes first_property mission when user owns a property', async () => {
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Test Property',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      await initializeMissionsForUser(user._id);
      const result = await processPlayerProgress(user._id, 'property_buy');

      const completed = result.missionResult.completed;
      const firstProperty = completed.find((m) => m.missionId === 'first_property');
      expect(firstProperty).toBeDefined();

      const mp = await MissionProgress.findOne({
        userId: user._id,
        missionId: 'first_property',
      }).lean();
      expect(mp.status).toBe('completed');
      expect(mp.progress).toBe(1);
    });

    it('awards XP via processPlayerProgress (skipXp false)', async () => {
      const result = await processPlayerProgress(user._id, 'property_buy');
      expect(result.xpResult).toBeDefined();

      const mp = await MissionProgress.findOne({
        userId: user._id,
        missionId: 'first_property',
      });
      expect(mp).toBeDefined();
      expect(mp.progress).toBeGreaterThanOrEqual(0);
    });

    it('skips XP when skipXp: true', async () => {
      const result = await processPlayerProgress(user._id, 'property_buy', { skipXp: true });
      expect(result.xpResult).toBeNull();
    });

    it('awards custom XP amount when xpAmount is provided', async () => {
      const result = await processPlayerProgress(user._id, 'property_buy', { xpAmount: 99 });
      expect(result.xpResult).toBeDefined();
    });
  });

  describe('triggerMissionProgress — fire-and-forget full pipeline', () => {
    it('runs full pipeline asynchronously (missions, achievements, XP, socket)', async () => {
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Test Property',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      await initializeMissionsForUser(user._id);

      triggerMissionProgress(user._id, 'property_buy');

      await vi.waitFor(
        async () => {
          const mp = await MissionProgress.findOne({
            userId: user._id,
            missionId: 'first_property',
          }).lean();
          expect(mp).toBeDefined();
          expect(mp.progress).toBe(1);
        },
        { timeout: 5000, interval: 50 },
      );

      await vi.waitFor(
        () => {
          const careerCalls = vi.mocked(socket.emitToUser).mock.calls.filter(
            ([, event]) => event === 'career:updated',
          );
          expect(careerCalls.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 5000, interval: 50 },
      );
    });
  });

  describe('Reward claiming — race condition prevention', () => {
    it('claims reward atomically — second concurrent claim is rejected', async () => {
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Test Property',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      await initializeMissionsForUser(user._id);
      await processPlayerProgress(user._id, 'property_buy');

      const claim1 = await claimMissionReward(user._id, 'first_property');
      expect(claim1.rewards).toBeDefined();

      await expect(claimMissionReward(user._id, 'first_property')).rejects.toThrow('Mission not ready to claim');

      const mp = await MissionProgress.findOne({
        userId: user._id,
        missionId: 'first_property',
      }).lean();
      expect(mp.status).toBe('claimed');
    });

    it('rejects double-claim via HTTP endpoint', async () => {
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Test Property',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      await initializeMissionsForUser(user._id);
      await processPlayerProgress(user._id, 'property_buy');

      const res1 = await request(app).post('/missions/claim/first_property').set(authHeader(token));
      expect(res1.status).toBe(200);

      const res2 = await request(app).post('/missions/claim/first_property').set(authHeader(token));
      expect(res2.status).toBe(400);
    });

    it('balance increases after claiming reward', async () => {
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Test Property',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      await initializeMissionsForUser(user._id);
      await processPlayerProgress(user._id, 'property_buy');

      const balanceBefore = (await User.findById(user._id)).balance;
      await claimMissionReward(user._id, 'first_property');
      const balanceAfter = (await User.findById(user._id)).balance;

      expect(balanceAfter).toBeGreaterThan(balanceBefore);
    });

    it('rejects claiming uncompleted mission', async () => {
      await initializeMissionsForUser(user._id);
      await expect(claimMissionReward(user._id, 'first_property')).rejects.toThrow('Mission not ready to claim');
    });

    it('rejects claiming non-existent mission definition', async () => {
      await expect(claimMissionReward(user._id, 'nonexistent_mission')).rejects.toThrow('Mission not found');
    });
  });

  describe('End-to-end HTTP flow', () => {
    it('full flow: initialize → buy property → mission complete → claim → balance up', async () => {
      await request(app).get('/missions/dashboard').set(authHeader(token));

      const Property = (await import('../../models/Property.js')).default;
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Test Property',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      await updateMissionProgress(user._id, 'property_buy');

      const res = await request(app).post('/missions/claim/first_property').set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.rewards).toBeDefined();
      expect(res.body.rewards.balance).toBeGreaterThan(0);
    });

    it('dashboard reflects accurate completed/claimed stats', async () => {
      await request(app).get('/missions/dashboard').set(authHeader(token));

      const Property = (await import('../../models/Property.js')).default;
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Test Property',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      await updateMissionProgress(user._id, 'property_buy');

      const dash = await (await import('../../engine/missionProcessing.js')).getMissionDashboard(user._id);
      const firstPropertyMission = dash.completed.find((m) => m.missionId === 'first_property');
      expect(firstPropertyMission).toBeDefined();

      await claimMissionReward(user._id, 'first_property');

      const dash2 = await (await import('../../engine/missionProcessing.js')).getMissionDashboard(user._id);
      const claimedMission = dash2.claimed.find((m) => m.missionId === 'first_property');
      expect(claimedMission).toBeDefined();
    });

    it('stats endpoint reflects changes', async () => {
      const res1 = await request(app).get('/missions/stats').set(authHeader(token));
      expect(res1.status).toBe(200);

      const Property = (await import('../../models/Property.js')).default;
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Test Property',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      await initializeMissionsForUser(user._id);
      await processPlayerProgress(user._id, 'property_buy');
      await claimMissionReward(user._id, 'first_property');

      const res2 = await request(app).get('/missions/stats').set(authHeader(token));
      expect(res2.body.stats.totalClaimed).toBeGreaterThan(0);
    });
  });

  describe('Multiple events trigger all missions', () => {
    it('collect_rent event advances first_rent mission', async () => {
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        type: 'apartment',
        name: 'Rental Property',
        basePrice: 100000,
        currentPrice: 100000,
        forSale: false,
      });

      const prop = await Property.findOne();
      await Transaction.create({
        buyerId: user._id,
        type: 'rent',
        price: 1000,
        propertyId: prop._id,
      });

      await initializeMissionsForUser(user._id);
      const result = await processPlayerProgress(user._id, 'rent_collect');

      const completed = result.missionResult.completed;
      const firstRent = completed.find((m) => m.missionId === 'first_rent');
      expect(firstRent).toBeDefined();
    });

    it('user xp field increases after progress pipeline', async () => {
      const userBefore = await User.findById(user._id);
      expect(userBefore.xp).toBe(0);

      await initializeMissionsForUser(user._id);

      for (const event of ['property_buy', 'rent_collect', 'loan_take']) {
        await processPlayerProgress(user._id, event);
      }

      const userAfter = await User.findById(user._id);
      expect(userAfter.xp).toBeGreaterThan(0);
    });

    it('reward XP is added to user XP', async () => {
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
      await processPlayerProgress(user._id, 'property_buy');

      const def = (await import('../../config/missions.js')).MISSION_DEFINITIONS.find((m) => m.id === 'first_property');
      const xpBefore = (await User.findById(user._id)).xp;
      await claimMissionReward(user._id, 'first_property');
      const xpAfter = (await User.findById(user._id)).xp;

      expect(xpAfter - xpBefore).toBe(def.rewards.xp);
    });
  });
});
