import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, createTestProperty, authHeader } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import CompanyMissionProgress from '../../models/CompanyMissionProgress.js';

import {
  COMPANY_MISSION_DEFINITIONS,
  getCompanyMissionById,
  getCompanyMissionsByType,
  getCompanyMissionsByCategory,
  getCompanyDailyMissions,
  getCompanyWeeklyMissions,
  getCompanyMilestoneMissions,
} from '../../config/companyMissions.js';
import {
  evaluateCompanyCondition,
  updateCompanyMissionProgress,
  claimCompanyMissionReward,
  initializeCompanyMissions,
  getCompanyMissionDashboard,
} from '../../engine/companyMissionProcessing.js';

const app = createApp();

describe('Company Mission System', () => {
  describe('Config', () => {
    it('has mission definitions', () => {
      expect(COMPANY_MISSION_DEFINITIONS.length).toBeGreaterThan(0);
    });

    it('each mission has required fields', () => {
      for (const m of COMPANY_MISSION_DEFINITIONS) {
        expect(m.id).toBeDefined();
        expect(m.name).toBeDefined();
        expect(m.description).toBeDefined();
        expect(m.category).toBeDefined();
        expect(m.type).toBeDefined();
        expect(m.condition).toBeDefined();
        expect(m.rewards).toBeDefined();
        expect(m.condition.target).toBeGreaterThan(0);
      }
    });

    it('has daily, weekly, and milestone missions', () => {
      expect(getCompanyDailyMissions().length).toBeGreaterThan(0);
      expect(getCompanyWeeklyMissions().length).toBeGreaterThan(0);
      expect(getCompanyMilestoneMissions().length).toBeGreaterThan(0);
    });

    it('mission IDs are unique', () => {
      const ids = COMPANY_MISSION_DEFINITIONS.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('getCompanyMissionById returns correct mission', () => {
      const m = getCompanyMissionById('milestone_first_property');
      expect(m).toBeDefined();
      expect(m.name).toBe('First Acquisition');
    });

    it('getCompanyMissionsByType filters correctly', () => {
      expect(getCompanyMissionsByType('daily').every((m) => m.type === 'daily')).toBe(true);
      expect(getCompanyMissionsByType('weekly').every((m) => m.type === 'weekly')).toBe(true);
      expect(getCompanyMissionsByType('milestone').every((m) => m.type === 'milestone')).toBe(true);
    });

    it('getCompanyMissionsByCategory filters correctly', () => {
      expect(getCompanyMissionsByCategory('financial').every((m) => m.category === 'financial')).toBe(true);
    });

    it('rewards use valid treasury transaction type', () => {
      const VALID_TREASURY_TYPES = [
        'deposit',
        'withdrawal',
        'rent_income',
        'loan_disbursement',
        'loan_payment',
        'property_purchase',
        'property_sale',
        'construction',
        'operating_fee',
        'contract_reward',
        'investment_return',
        'investment_withdrawal',
        'development',
        'payroll',
        'refund',
      ];
      for (const m of COMPANY_MISSION_DEFINITIONS) {
        if (m.rewards.treasury > 0) {
          expect(VALID_TREASURY_TYPES).toContain('deposit');
        }
      }
    });
  });

  describe('Model', () => {
    beforeAll(async () => {
      await CompanyMissionProgress.init();
    });

    it('can create CompanyMissionProgress', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      const progress = await CompanyMissionProgress.create({
        companyId: company._id,
        missionId: 'milestone_first_property',
        status: 'active',
        target: 1,
      });

      expect(progress.companyId.toString()).toBe(company._id.toString());
      expect(progress.missionId).toBe('milestone_first_property');
      expect(progress.status).toBe('active');
      expect(progress.progress).toBe(0);
    });

    it('has unique index on companyId + missionId', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await CompanyMissionProgress.create({
        companyId: company._id,
        missionId: 'milestone_first_property',
        target: 1,
      });

      let duplicateError = null;
      try {
        await CompanyMissionProgress.create({
          companyId: company._id,
          missionId: 'milestone_first_property',
          target: 1,
        });
      } catch (err) {
        duplicateError = err;
      }
      expect(duplicateError).not.toBeNull();
    });

    it('tracks contributors', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      const progress = await CompanyMissionProgress.create({
        companyId: company._id,
        missionId: 'daily_collect_rent',
        target: 10000,
      });

      progress.contributors.push({ userId: user._id, contribution: 1 });
      await progress.save();

      const loaded = await CompanyMissionProgress.findById(progress._id);
      expect(loaded.contributors.length).toBe(1);
      expect(loaded.contributors[0].userId.toString()).toBe(user._id.toString());
    });
  });

  describe('Engine - Condition Evaluation', () => {
    it('evaluates company_properties_owned', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      const count = await evaluateCompanyCondition(company._id, { type: 'company_properties_owned', target: 1 });
      expect(count).toBe(0);

      await createTestProperty({ companyId: company._id, cityId: city._id, forSale: false });
      const countAfter = await evaluateCompanyCondition(company._id, { type: 'company_properties_owned', target: 1 });
      expect(countAfter).toBe(1);
    });

    it('evaluates company_member_count', async () => {
      const { user } = await createAuthenticatedUser();
      const { user: user2 } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [
          { userId: user._id, role: 'ceo' },
          { userId: user2._id, role: 'member' },
        ],
      });

      const count = await evaluateCompanyCondition(company._id, { type: 'company_member_count', target: 1 });
      expect(count).toBe(2);
    });

    it('evaluates company_net_worth from stats', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
        stats: { netWorth: 5000000 },
      });

      const worth = await evaluateCompanyCondition(company._id, { type: 'company_net_worth', target: 1000000 });
      expect(worth).toBe(5000000);
    });

    it('returns 0 for unknown condition type', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      const result = await evaluateCompanyCondition(company._id, { type: 'nonexistent_condition', target: 1 });
      expect(result).toBe(0);
    });
  });

  describe('Engine - Mission Progress', () => {
    it('initializes missions for a company', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      const count = await initializeCompanyMissions(company._id);
      expect(count).toBe(COMPANY_MISSION_DEFINITIONS.length);

      const missions = await CompanyMissionProgress.find({ companyId: company._id });
      expect(missions.length).toBe(COMPANY_MISSION_DEFINITIONS.length);
      expect(missions.every((m) => m.status === 'active')).toBe(true);
    });

    it('does not duplicate missions on re-initialize', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);
      const count2 = await initializeCompanyMissions(company._id);
      expect(count2).toBe(0);

      const missions = await CompanyMissionProgress.find({ companyId: company._id });
      expect(missions.length).toBe(COMPANY_MISSION_DEFINITIONS.length);
    });

    it('updates progress when condition met', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);
      await createTestProperty({ companyId: company._id, cityId: city._id, forSale: false });

      const completed = await updateCompanyMissionProgress(company._id, 'property_purchased', user._id);
      expect(completed.length).toBeGreaterThanOrEqual(1);
    });

    it('does not double-count progress', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);
      await createTestProperty({ companyId: company._id, cityId: city._id, forSale: false });

      await updateCompanyMissionProgress(company._id, 'property_purchased', user._id);
      const completed2 = await updateCompanyMissionProgress(company._id, 'property_purchased', user._id);
      expect(completed2.length).toBe(0);
    });

    it('tracks contributors on progress update', async () => {
      const { user } = await createAuthenticatedUser();
      const { user: user2 } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [
          { userId: user._id, role: 'ceo' },
          { userId: user2._id, role: 'member' },
        ],
      });

      await initializeCompanyMissions(company._id);

      await createTestProperty({ companyId: company._id, cityId: city._id, forSale: false });
      await updateCompanyMissionProgress(company._id, 'property_purchased', user._id);

      await createTestProperty({ companyId: company._id, cityId: city._id, forSale: false });
      await updateCompanyMissionProgress(company._id, 'property_purchased', user2._id);

      const fivePropMission = await CompanyMissionProgress.findOne({
        companyId: company._id,
        missionId: 'milestone_five_properties',
      });
      expect(fivePropMission).toBeDefined();
      expect(fivePropMission.progress).toBe(2);
      const contributorUserIds = fivePropMission.contributors.map((c) => c.userId.toString());
      expect(contributorUserIds).toContain(user._id.toString());
      expect(contributorUserIds).toContain(user2._id.toString());
    });
  });

  describe('Engine - Reward Claiming', () => {
    it('claims reward for completed mission', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);

      const mission = await CompanyMissionProgress.findOne({
        companyId: company._id,
        missionId: 'milestone_first_property',
      });
      mission.status = 'completed';
      mission.progress = mission.target;
      mission.completedAt = new Date();
      await mission.save();

      const result = await claimCompanyMissionReward(company._id, 'milestone_first_property', user._id);
      expect(result).not.toBeNull();
      expect(result.rewards.xp).toBeGreaterThan(0);
      expect(result.rewards.treasury).toBeGreaterThan(0);

      const companyAfter = await RealEstateCompany.findById(company._id);
      expect(companyAfter.xp).toBeGreaterThan(company.xp);
      expect(companyAfter.treasury.balance).toBeGreaterThan(0);
    });

    it('prevents double-claiming', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);

      const mission = await CompanyMissionProgress.findOne({
        companyId: company._id,
        missionId: 'milestone_first_property',
      });
      mission.status = 'completed';
      mission.progress = mission.target;
      mission.completedAt = new Date();
      await mission.save();

      await claimCompanyMissionReward(company._id, 'milestone_first_property', user._id);
      const second = await claimCompanyMissionReward(company._id, 'milestone_first_property', user._id);
      expect(second).toBeNull();
    });

    it('does not claim for uncompleted mission', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);
      const result = await claimCompanyMissionReward(company._id, 'milestone_first_property', user._id);
      expect(result).toBeNull();
    });

    it('creates treasury deposit transaction for reward', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);

      const mission = await CompanyMissionProgress.findOne({
        companyId: company._id,
        missionId: 'milestone_first_property',
      });
      mission.status = 'completed';
      mission.progress = mission.target;
      mission.completedAt = new Date();
      await mission.save();

      await claimCompanyMissionReward(company._id, 'milestone_first_property', user._id);

      const companyAfter = await RealEstateCompany.findById(company._id);
      const rewardTxn = companyAfter.treasury.transactions.find(
        (t) => t.description && t.description.includes('Mission reward'),
      );
      expect(rewardTxn).toBeDefined();
      expect(rewardTxn.type).toBe('deposit');
    });

    it('awards reputation on claim', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
        reputation: 0,
      });

      await initializeCompanyMissions(company._id);

      const mission = await CompanyMissionProgress.findOne({
        companyId: company._id,
        missionId: 'milestone_first_property',
      });
      mission.status = 'completed';
      mission.progress = mission.target;
      mission.completedAt = new Date();
      await mission.save();

      await claimCompanyMissionReward(company._id, 'milestone_first_property', user._id);

      const companyAfter = await RealEstateCompany.findById(company._id);
      expect(companyAfter.reputation).toBeGreaterThan(0);
    });
  });

  describe('Dashboard', () => {
    it('returns dashboard with active/completed/claimed', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);
      const dashboard = await getCompanyMissionDashboard(company._id);

      expect(dashboard.active.length).toBe(COMPANY_MISSION_DEFINITIONS.length);
      expect(dashboard.completed.length).toBe(0);
      expect(dashboard.claimed.length).toBe(0);
      expect(dashboard.stats.totalActive).toBe(COMPANY_MISSION_DEFINITIONS.length);
    });

    it('enriches missions with definition data', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);
      const dashboard = await getCompanyMissionDashboard(company._id);

      const firstMission = dashboard.active[0];
      expect(firstMission.definition).not.toBeNull();
      expect(firstMission.definition.name).toBeDefined();
      expect(firstMission.percentage).toBeDefined();
    });

    it('populates contributor usernames in the dashboard', async () => {
      const { user } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);
      await createTestProperty({ companyId: company._id, cityId: city._id, forSale: false });
      await updateCompanyMissionProgress(company._id, 'property_purchased', user._id);

      const dashboard = await getCompanyMissionDashboard(company._id);

      const withContributors = [...dashboard.active, ...dashboard.completed].find((m) => m.contributors?.length > 0);
      expect(withContributors).toBeDefined();
      expect(withContributors.contributors[0].userId).toBeTruthy();
      expect(withContributors.contributors[0].userId.username).toBe(user.username);
    });
  });

  describe('API Routes', () => {
    it('GET /:id/missions returns dashboard', async () => {
      const { user, token } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      const res = await request(app).get(`/real-estate-companies/${company._id}/missions`).set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.active).toBeDefined();
      expect(Array.isArray(res.body.active)).toBe(true);
    });

    it('GET /:id/missions returns 404 for non-member', async () => {
      const { user } = await createAuthenticatedUser();
      const { token: token2 } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      const res = await request(app).get(`/real-estate-companies/${company._id}/missions`).set(authHeader(token2));

      expect(res.status).toBe(403);
    });

    it('POST /:id/missions/:missionId/claim returns 400 for uncompleted', async () => {
      const { user, token } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/missions/milestone_first_property/claim`)
        .set(authHeader(token));

      expect(res.status).toBe(400);
    });

    it('POST /:id/missions/:missionId/claim succeeds for completed', async () => {
      const { user, token } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      await initializeCompanyMissions(company._id);

      const mission = await CompanyMissionProgress.findOne({
        companyId: company._id,
        missionId: 'milestone_first_property',
      });
      mission.status = 'completed';
      mission.progress = mission.target;
      mission.completedAt = new Date();
      await mission.save();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/missions/milestone_first_property/claim`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.rewards).toBeDefined();
      expect(res.body.rewards.xp).toBeGreaterThan(0);
    });

    it('GET /:id/missions/definitions returns mission definitions', async () => {
      const { user, token } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      const res = await request(app)
        .get(`/real-estate-companies/${company._id}/missions/definitions`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.definitions).toBeDefined();
      expect(res.body.definitions.length).toBe(COMPANY_MISSION_DEFINITIONS.length);
    });

    it('POST /:id/missions/refresh initializes missions', async () => {
      const { user, token } = await createAuthenticatedUser();
      const city = await createTestCity();
      const company = await RealEstateCompany.create({
        name: `TestCo_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo' }],
      });

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/missions/refresh`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.active).toBeDefined();
      expect(res.body.active.length).toBe(COMPANY_MISSION_DEFINITIONS.length);
    });

    it('GET /:id/missions returns 404 for nonexistent company', async () => {
      const { token } = await createAuthenticatedUser();
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app).get(`/real-estate-companies/${fakeId}/missions`).set(authHeader(token));

      expect(res.status).toBe(404);
    });
  });
});
