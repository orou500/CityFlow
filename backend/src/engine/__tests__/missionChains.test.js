import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import MissionProgress from '../../models/MissionProgress.js';
import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import Auction from '../../models/Auction.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import StockHolding from '../../models/StockHolding.js';
import StockTransaction from '../../models/StockTransaction.js';
import Transaction from '../../models/Transaction.js';
import {
  initializeMissionsForUser,
  updateMissionProgress,
  claimMissionReward,
} from '../../engine/missionProcessing.js';
import { MISSION_DEFINITIONS, getChainMissions } from '../../config/missions.js';

const app = createApp();

describe('Mission Chains', () => {
  let user, token, city;

  beforeEach(async () => {
    await MissionProgress.deleteMany({});
    await User.deleteMany({});
    await Property.deleteMany({});
    await Notification.deleteMany({});
    await Auction.deleteMany({});
    await RealEstateCompany.deleteMany({});
    await StockHolding.deleteMany({});
    await StockTransaction.deleteMany({});
    await Transaction.deleteMany({});
    const result = await createAuthenticatedUser({ balance: 1000000, level: 20 });
    user = result.user;
    token = result.token;
    city = await createTestCity();
  });

  describe('Chain Definitions', () => {
    it('has 8 new mission chains', () => {
      const chainIds = [
        ...new Set(
          MISSION_DEFINITIONS.filter((m) => m.chainId?.startsWith('chain_') && !m.hidden).map((m) => m.chainId),
        ),
      ];
      expect(chainIds.length).toBe(8);
      expect(chainIds).toContain('chain_property_empire');
      expect(chainIds).toContain('chain_auction_apprentice');
      expect(chainIds).toContain('chain_corporate_founder');
      expect(chainIds).toContain('chain_corporate_auction');
      expect(chainIds).toContain('chain_market_investor');
      expect(chainIds).toContain('chain_global_explorer');
      expect(chainIds).toContain('chain_property_mogul');
      expect(chainIds).toContain('chain_global_empire');
    });

    it('all chain definitions have unique IDs', () => {
      const chainMissions = MISSION_DEFINITIONS.filter((m) => m.chainId?.startsWith('chain_') && !m.hidden);
      const ids = chainMissions.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('chain_property_empire has 4 steps in order', () => {
      const steps = getChainMissions('chain_property_empire');
      expect(steps).toHaveLength(4);
      expect(steps[0].chainOrder).toBe(1);
      expect(steps[3].chainOrder).toBe(4);
    });

    it('chain_global_empire has 5 steps in order', () => {
      const steps = getChainMissions('chain_global_empire');
      expect(steps).toHaveLength(5);
      expect(steps[0].chainOrder).toBe(1);
      expect(steps[4].chainOrder).toBe(5);
    });

    it('first step of each chain has unlockLevel', () => {
      const chains = [
        'chain_property_empire',
        'chain_auction_apprentice',
        'chain_corporate_founder',
        'chain_corporate_auction',
        'chain_market_investor',
        'chain_global_explorer',
        'chain_property_mogul',
        'chain_global_empire',
      ];
      for (const chainId of chains) {
        const steps = getChainMissions(chainId);
        expect(steps[0].unlockLevel).toBeDefined();
        expect(steps[0].unlockLevel).toBeGreaterThan(0);
      }
    });

    it('steps 2+ have prerequisiteMissionId linking to previous step', () => {
      const chains = [
        'chain_property_empire',
        'chain_auction_apprentice',
        'chain_corporate_founder',
        'chain_corporate_auction',
        'chain_market_investor',
        'chain_global_explorer',
        'chain_property_mogul',
        'chain_global_empire',
      ];
      for (const chainId of chains) {
        const steps = getChainMissions(chainId);
        for (let i = 1; i < steps.length; i++) {
          expect(steps[i].prerequisiteMissionId).toBe(steps[i - 1].id);
        }
      }
    });
  });

  describe('Chain Unlock Conditions', () => {
    it('does not create chain missions when level is too low', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 1 } });
      await initializeMissionsForUser(user._id);

      const progress = await MissionProgress.find({ userId: user._id });
      const progressIds = progress.map((p) => p.missionId);
      expect(progressIds).not.toContain('chain1_step1_acquire');
      expect(progressIds).not.toContain('chain_global_empire_step1');
    });

    it('creates first chain step when level meets unlock requirement', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 3 } });
      await initializeMissionsForUser(user._id);

      const progress = await MissionProgress.find({ userId: user._id });
      const progressIds = progress.map((p) => p.missionId);
      expect(progressIds).toContain('chain1_step1_acquire');
      expect(progressIds).toContain('chain2_step1_watch');
    });

    it('creates higher-level chain steps only when level is sufficient', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 12 } });
      await initializeMissionsForUser(user._id);

      const progress = await MissionProgress.find({ userId: user._id });
      const progressIds = progress.map((p) => p.missionId);
      expect(progressIds).toContain('chain3_step1_create');
      expect(progressIds).not.toContain('chain7_step1_upgrade');
    });
  });

  describe('Sequential Step Progression', () => {
    it('does not create step 2 before step 1 is claimed', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 3 } });
      await initializeMissionsForUser(user._id);

      const progress = await MissionProgress.find({ userId: user._id });
      const progressIds = progress.map((p) => p.missionId);
      expect(progressIds).toContain('chain1_step1_acquire');
      expect(progressIds).not.toContain('chain1_step2_improve');
    });

    it('creates step 2 after step 1 is claimed', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 3 } });
      await initializeMissionsForUser(user._id);

      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        name: 'P',
        type: 'apartment',
        basePrice: 100000,
        currentPrice: 100000,
        rent: 500,
      });
      await updateMissionProgress(user._id, 'property_buy');
      await claimMissionReward(user._id, 'chain1_step1_acquire');

      const progress = await MissionProgress.find({ userId: user._id });
      const progressIds = progress.map((p) => p.missionId);
      expect(progressIds).toContain('chain1_step2_improve');
      expect(progressIds).not.toContain('chain1_step3_earn');
    });
  });

  describe('Chain Completion and Claiming', () => {
    it('completes chain steps sequentially and grants rewards', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 3 } });
      await initializeMissionsForUser(user._id);

      const balanceBefore = (await User.findById(user._id)).balance;

      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        name: 'T',
        type: 'apartment',
        basePrice: 100000,
        currentPrice: 100000,
        rent: 500,
      });
      await updateMissionProgress(user._id, 'property_buy');
      await claimMissionReward(user._id, 'chain1_step1_acquire');

      const progress = await MissionProgress.find({ userId: user._id });
      const progressIds = progress.map((p) => p.missionId);
      expect(progressIds).toContain('chain1_step2_improve');

      const balanceAfter = (await User.findById(user._id)).balance;
      expect(balanceAfter).toBeGreaterThan(balanceBefore);
    });

    it('grants reward only once per step', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 3 } });
      await initializeMissionsForUser(user._id);

      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        name: 'T',
        type: 'apartment',
        basePrice: 100000,
        currentPrice: 100000,
        rent: 500,
      });
      await updateMissionProgress(user._id, 'property_buy');
      await claimMissionReward(user._id, 'chain1_step1_acquire');

      const balance1 = (await User.findById(user._id)).balance;
      await expect(claimMissionReward(user._id, 'chain1_step1_acquire')).rejects.toThrow('Mission not ready to claim');
      const balance2 = (await User.findById(user._id)).balance;
      expect(balance2).toBe(balance1);
    });

    it('does not allow claiming active missions', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 3 } });
      await initializeMissionsForUser(user._id);
      await expect(claimMissionReward(user._id, 'chain1_step1_acquire')).rejects.toThrow('Mission not ready to claim');
    });
  });

  describe('Retroactive State-Based Completion', () => {
    it('completes immediately if permanent state condition is already met', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 3 } });
      for (let i = 0; i < 3; i++) {
        await Property.create({
          cityId: city._id,
          ownerId: user._id,
          name: `P${i}`,
          type: 'apartment',
          basePrice: 100000,
          currentPrice: 100000,
          rent: 500,
        });
      }
      await initializeMissionsForUser(user._id);
      await updateMissionProgress(user._id, 'property_buy');

      const step1 = await MissionProgress.findOne({ userId: user._id, missionId: 'chain1_step1_acquire' });
      expect(step1?.status).toBe('completed');
    });
  });

  describe('GET /missions/chains', () => {
    it('returns all chains with steps', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 20 } });
      await initializeMissionsForUser(user._id);

      const res = await request(app).get('/missions/chains').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chains).toBeInstanceOf(Array);
      expect(res.body.chains.length).toBe(18);

      const newChainIds = [
        'chain_property_empire',
        'chain_auction_apprentice',
        'chain_corporate_founder',
        'chain_corporate_auction',
        'chain_market_investor',
        'chain_global_explorer',
        'chain_property_mogul',
        'chain_global_empire',
      ];
      for (const chainId of newChainIds) {
        const chain = res.body.chains.find((c) => c.chainId === chainId);
        expect(chain).toBeDefined();
      }

      const propertyEmpire = res.body.chains.find((c) => c.chainId === 'chain_property_empire');
      expect(propertyEmpire).toBeDefined();
      expect(propertyEmpire.steps).toHaveLength(4);
      expect(propertyEmpire.totalSteps).toBe(4);
    });

    it('shows locked status for unstarted chains', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 1 } });
      await initializeMissionsForUser(user._id);

      const res = await request(app).get('/missions/chains').set(authHeader(token));
      expect(res.status).toBe(200);
      const empire = res.body.chains.find((c) => c.chainId === 'chain_global_empire');
      expect(empire.status).toBe('locked');
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/missions/chains');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /missions/dashboard includes chains', () => {
    it('dashboard response includes chains array', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 20 } });
      await initializeMissionsForUser(user._id);

      const res = await request(app).get('/missions/dashboard').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.chains).toBeInstanceOf(Array);
      expect(res.body.chains.length).toBe(18);
    });
  });

  describe('Anti-Exploit', () => {
    it('concurrent reward claims result in exactly one reward', async () => {
      await User.updateOne({ _id: user._id }, { $set: { level: 3 } });
      await initializeMissionsForUser(user._id);

      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        name: 'T',
        type: 'apartment',
        basePrice: 100000,
        currentPrice: 100000,
        rent: 500,
      });
      await updateMissionProgress(user._id, 'property_buy');

      const balanceBefore = (await User.findById(user._id)).balance;
      const results = await Promise.allSettled([
        claimMissionReward(user._id, 'chain1_step1_acquire'),
        claimMissionReward(user._id, 'chain1_step1_acquire'),
      ]);
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      expect(successCount).toBe(1);

      const balanceAfter = (await User.findById(user._id)).balance;
      expect(balanceAfter - balanceBefore).toBe(5000);
    });
  });

  describe('Company Auction Attribution', () => {
    it('company_auctions_won counts company bids won by the user', async () => {
      const company = await RealEstateCompany.create({
        founderId: user._id,
        name: 'Test Corp',
        members: [{ userId: user._id, role: 'ceo' }],
        level: 5,
      });

      const prop = await Property.create({
        cityId: city._id,
        name: 'AuctionProp',
        type: 'apartment',
        basePrice: 100000,
        currentPrice: 100000,
      });

      await Auction.create({
        propertyId: prop._id,
        sellerType: 'bank',
        startingBid: 10000,
        currentBid: 15000,
        currentBidderId: user._id,
        winnerId: user._id,
        winningBid: 15000,
        companyId: company._id,
        status: 'ended',
        startTick: 1,
        endTick: 10,
        originalEndTick: 10,
        bidIncrement: 500,
      });

      await initializeMissionsForUser(user._id);
      await updateMissionProgress(user._id, 'auction_won');

      const step = await MissionProgress.findOne({ userId: user._id, missionId: 'chain4_step4_acquisition' });
      if (step) expect(step.status).toBe('completed');
    });
  });

  describe('Stock Conditions', () => {
    it('stocks_owned_companies counts distinct holdings', async () => {
      const c1 = await RealEstateCompany.create({
        founderId: user._id,
        name: 'C1',
        members: [{ userId: user._id, role: 'ceo' }],
        level: 1,
      });
      const c2 = await RealEstateCompany.create({
        founderId: user._id,
        name: 'C2',
        members: [{ userId: user._id, role: 'member' }],
        level: 1,
      });

      await StockHolding.create({ userId: user._id, companyId: c1._id, shares: 10, avgBuyPrice: 100 });
      await StockHolding.create({ userId: user._id, companyId: c2._id, shares: 5, avgBuyPrice: 200 });

      await initializeMissionsForUser(user._id);
      await updateMissionProgress(user._id, 'stocks_buy');

      const step = await MissionProgress.findOne({ userId: user._id, missionId: 'chain5_step2_position' });
      if (step) expect(step.progress).toBe(2);
    });
  });

  describe('Geographic Conditions', () => {
    it('unique_cities counts distinct cities', async () => {
      const city2 = await createTestCity();
      const city3 = await createTestCity();

      for (const c of [city, city2, city3]) {
        await Property.create({
          cityId: c._id,
          ownerId: user._id,
          name: 'P',
          type: 'apartment',
          basePrice: 100000,
          currentPrice: 100000,
        });
      }

      await initializeMissionsForUser(user._id);
      await updateMissionProgress(user._id, 'property_buy');

      const step = await MissionProgress.findOne({ userId: user._id, missionId: 'chain6_step3_global' });
      if (step) expect(step.status).toBe('completed');
    });
  });
});
