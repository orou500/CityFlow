import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, createTestCity, authHeader } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import {
  xpRequiredForLevel,
  xpRequiredForNextLevel,
  getLevelFromTotalXP,
  calculateXPReward,
  getCompanyLevelBenefits,
  LEVEL_UP_REWARDS,
  COMPANY_MILESTONES,
  checkMilestones,
  MAX_COMPANY_LEVEL,
} from '../../config/companyProgression.js';

const app = createApp();

describe('Company Progression System', () => {
  describe('XP Table', () => {
    it('returns 0 XP for level 1', () => {
      expect(xpRequiredForLevel(1)).toBe(0);
    });

    it('returns positive XP for level 2', () => {
      expect(xpRequiredForLevel(2)).toBeGreaterThan(0);
    });

    it('XP requirements increase with level', () => {
      for (let l = 2; l <= 10; l++) {
        expect(xpRequiredForLevel(l)).toBeGreaterThan(xpRequiredForLevel(l - 1));
      }
    });

    it('xpRequiredForNextLevel returns Infinity at max level', () => {
      expect(xpRequiredForNextLevel(MAX_COMPANY_LEVEL)).toBe(Infinity);
    });

    it('xpRequiredForNextLevel returns positive for lower levels', () => {
      expect(xpRequiredForNextLevel(1)).toBeGreaterThan(0);
      expect(xpRequiredForNextLevel(25)).toBeGreaterThan(0);
    });

    it('getLevelFromTotalXP returns 1 for 0 XP', () => {
      expect(getLevelFromTotalXP(0)).toBe(1);
    });

    it('getLevelFromTotalXP returns correct level for known XP', () => {
      const xp2 = xpRequiredForLevel(2);
      expect(getLevelFromTotalXP(xp2)).toBe(2);
    });

    it('getLevelFromTotalXP caps at MAX_COMPANY_LEVEL', () => {
      expect(getLevelFromTotalXP(999999999)).toBe(MAX_COMPANY_LEVEL);
    });
  });

  describe('XP Rewards', () => {
    it('calculates property_purchased XP', () => {
      const xp = calculateXPReward('property_purchased', 1_000_000);
      expect(xp).toBeGreaterThanOrEqual(50);
      expect(xp).toBe(500);
    });

    it('calculates property_sold XP', () => {
      const xp = calculateXPReward('property_sold', 1_000_000);
      expect(xp).toBeGreaterThanOrEqual(25);
    });

    it('calculates development_executed XP', () => {
      const xp = calculateXPReward('development_executed', 500_000);
      expect(xp).toBeGreaterThanOrEqual(40);
      expect(xp).toBe(2500);
    });

    it('calculates construction_completed XP', () => {
      const xp = calculateXPReward('construction_completed', 2_000_000);
      expect(xp).toBeGreaterThanOrEqual(60);
    });

    it('calculates loan_repaid XP', () => {
      const xp = calculateXPReward('loan_repaid', 100_000);
      expect(xp).toBeGreaterThanOrEqual(20);
    });

    it('calculates vote_completed XP', () => {
      const xp = calculateXPReward('vote_completed');
      expect(xp).toBe(3);
    });

    it('calculates rent_collected XP', () => {
      const xp = calculateXPReward('rent_collected', 10_000);
      expect(xp).toBeGreaterThanOrEqual(1);
    });

    it('calculates investment_matured XP', () => {
      const xp = calculateXPReward('investment_matured', 500_000);
      expect(xp).toBeGreaterThanOrEqual(15);
    });

    it('returns 0 for unknown activity', () => {
      expect(calculateXPReward('unknown_activity')).toBe(0);
    });

    it('enforces minimum XP thresholds', () => {
      expect(calculateXPReward('property_purchased', 1)).toBe(50);
      expect(calculateXPReward('property_sold', 1)).toBe(25);
      expect(calculateXPReward('development_executed', 1)).toBe(40);
      expect(calculateXPReward('loan_repaid', 1)).toBe(20);
    });
  });

  describe('Level Benefits', () => {
    it('returns benefits for level 1', () => {
      const b = getCompanyLevelBenefits(1);
      expect(b.maxMembers).toBe(10);
      expect(b.canTakeContracts).toBe(false);
      expect(b.canStartProjects).toBe(false);
    });

    it('unlocks contracts at level 3', () => {
      const b = getCompanyLevelBenefits(3);
      expect(b.canTakeContracts).toBe(true);
    });

    it('unlocks projects at level 5', () => {
      const b = getCompanyLevelBenefits(5);
      expect(b.canStartProjects).toBe(true);
    });

    it('maxMembers increases with level', () => {
      const b1 = getCompanyLevelBenefits(1);
      const b10 = getCompanyLevelBenefits(10);
      expect(b10.maxMembers).toBeGreaterThan(b1.maxMembers);
      expect(b10.maxMembers).toBeLessThanOrEqual(50);
    });

    it('loanInterestDiscount increases with level', () => {
      const b1 = getCompanyLevelBenefits(1);
      const b20 = getCompanyLevelBenefits(20);
      expect(b20.loanInterestDiscount).toBeGreaterThan(b1.loanInterestDiscount);
    });

    it('maxLoanAmount increases with level', () => {
      const b1 = getCompanyLevelBenefits(1);
      const b10 = getCompanyLevelBenefits(10);
      expect(b10.maxLoanAmount).toBeGreaterThan(b1.maxLoanAmount);
    });

    it('maxInvestmentAmount is 0 below level 5', () => {
      const b = getCompanyLevelBenefits(4);
      expect(b.maxInvestmentAmount).toBe(0);
    });

    it('maxInvestmentAmount increases above level 5', () => {
      const b5 = getCompanyLevelBenefits(5);
      const b10 = getCompanyLevelBenefits(10);
      expect(b5.maxInvestmentAmount).toBeGreaterThan(0);
      expect(b10.maxInvestmentAmount).toBeGreaterThan(b5.maxInvestmentAmount);
    });

    it('premiumContracts unlocks at level 10', () => {
      expect(getCompanyLevelBenefits(9).premiumContracts).toBe(false);
      expect(getCompanyLevelBenefits(10).premiumContracts).toBe(true);
    });

    it('advancedGovernance unlocks at level 15', () => {
      expect(getCompanyLevelBenefits(14).advancedGovernance).toBe(false);
      expect(getCompanyLevelBenefits(15).advancedGovernance).toBe(true);
    });

    it('maxActiveLoans increases with level', () => {
      const b1 = getCompanyLevelBenefits(1);
      const b20 = getCompanyLevelBenefits(20);
      expect(b20.maxActiveLoans).toBeGreaterThan(b1.maxActiveLoans);
    });

    it('maxConstructionProjects increases with level', () => {
      const b1 = getCompanyLevelBenefits(1);
      const b20 = getCompanyLevelBenefits(20);
      expect(b20.maxConstructionProjects).toBeGreaterThan(b1.maxConstructionProjects);
    });
  });

  describe('Level Up Rewards', () => {
    it('treasuryBonus increases with level', () => {
      expect(LEVEL_UP_REWARDS.treasuryBonus(10)).toBeGreaterThan(LEVEL_UP_REWARDS.treasuryBonus(1));
    });

    it('xpBonus increases with level', () => {
      expect(LEVEL_UP_REWARDS.xpBonus(10)).toBeGreaterThan(LEVEL_UP_REWARDS.xpBonus(1));
    });

    it('reputationBonus increases with level', () => {
      expect(LEVEL_UP_REWARDS.reputationBonus(10)).toBeGreaterThan(LEVEL_UP_REWARDS.reputationBonus(1));
    });
  });

  describe('Milestones', () => {
    it('has defined milestones', () => {
      expect(COMPANY_MILESTONES.length).toBeGreaterThan(0);
    });

    it('all milestones have required fields', () => {
      for (const m of COMPANY_MILESTONES) {
        expect(m.id).toBeTruthy();
        expect(m.name).toBeTruthy();
        expect(typeof m.check).toBe('function');
        expect(m.xpReward).toBeGreaterThan(0);
      }
    });

    it('checkMilestones returns empty for new company', () => {
      const company = {
        stats: { propertiesOwned: 0, totalRentalIncome: 0, netWorth: 0 },
        level: 1,
        members: [],
        milestones: [],
      };
      const result = checkMilestones(company);
      expect(result.length).toBe(0);
    });

    it('checkMilestones detects properties_5 milestone', () => {
      const company = {
        stats: { propertiesOwned: 5, totalRentalIncome: 0, netWorth: 0 },
        level: 1,
        members: [],
        milestones: [],
      };
      const result = checkMilestones(company);
      expect(result.some((m) => m.id === 'properties_5')).toBe(true);
    });

    it('checkMilestones skips prerequisite-locked milestones', () => {
      const company = {
        stats: { propertiesOwned: 10, totalRentalIncome: 0, netWorth: 0 },
        level: 1,
        members: [],
        milestones: [],
      };
      const result = checkMilestones(company);
      expect(result.some((m) => m.id === 'properties_5')).toBe(true);
      expect(result.some((m) => m.id === 'properties_10')).toBe(false);
    });

    it('checkMilestones allows prerequisite-locked when prerequisite met', () => {
      const company = {
        stats: { propertiesOwned: 10, totalRentalIncome: 0, netWorth: 0 },
        level: 1,
        members: [],
        milestones: [{ milestoneId: 'properties_5', name: 'Property Pioneer' }],
      };
      const result = checkMilestones(company);
      expect(result.some((m) => m.id === 'properties_10')).toBe(true);
    });

    it('checkMilestones skips already completed milestones', () => {
      const company = {
        stats: { propertiesOwned: 5, totalRentalIncome: 0, netWorth: 0 },
        level: 1,
        members: [],
        milestones: [{ milestoneId: 'properties_5', name: 'Property Pioneer' }],
      };
      const result = checkMilestones(company);
      expect(result.some((m) => m.id === 'properties_5')).toBe(false);
    });

    it('detects level-based milestones', () => {
      const company = {
        stats: { level: 5 },
        level: 5,
        members: [],
        milestones: [],
      };
      const result = checkMilestones(company);
      expect(result.some((m) => m.id === 'level_5')).toBe(true);
    });
  });

  describe('Progression Endpoints', () => {
    async function setupCompany() {
      const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const { user, token } = await createAuthenticatedUser({
        balance: 10_000_000,
        level: 20,
        createdAt,
      });
      await createTestProperty({ ownerId: user._id, currentPrice: 5_000_000, basePrice: 5_000_000 });
      const city = await createTestCity();
      const res = await request(app)
        .post('/real-estate-companies')
        .set(authHeader(token))
        .send({
          name: `ProgTest_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          description: 'Test',
          hqCityId: city._id,
        });
      expect(res.status).toBe(201);
      const company = await RealEstateCompany.findById(res.body._id);
      return { company, token, user };
    }

    it('GET /:id/progression returns progression data', async () => {
      const { company, token } = await setupCompany();
      const res = await request(app).get(`/real-estate-companies/${company._id}/progression`).set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.level).toBe(1);
      expect(res.body.xp).toBe(0);
      expect(res.body.xpToNextLevel).toBeGreaterThan(0);
      expect(res.body.xpProgress).toBe(0);
      expect(res.body.reputation).toBeDefined();
      expect(res.body.benefits).toBeDefined();
      expect(res.body.completedMilestones).toBe(0);
      expect(res.body.totalMilestones).toBeGreaterThan(0);
      expect(res.body.availableMilestones).toBeDefined();
      expect(Array.isArray(res.body.availableMilestones)).toBe(true);
      expect(res.body.maxLevel).toBe(MAX_COMPANY_LEVEL);
    });

    it('GET /:id/progression returns 403 for non-members', async () => {
      const { company } = await setupCompany();
      const outsider = await createAuthenticatedUser({ level: 15, balance: 5_000_000 });
      const res = await request(app)
        .get(`/real-estate-companies/${company._id}/progression`)
        .set(authHeader(outsider.token));

      expect(res.status).toBe(403);
    });

    it('GET /:id/milestones returns milestone data', async () => {
      const { company, token } = await setupCompany();
      const res = await request(app).get(`/real-estate-companies/${company._id}/milestones`).set(authHeader(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.milestones)).toBe(true);
      expect(res.body.completed).toBe(0);
      expect(res.body.total).toBeGreaterThan(0);

      const firstMilestone = res.body.milestones[0];
      expect(firstMilestone.id).toBeDefined();
      expect(firstMilestone.name).toBeDefined();
      expect(typeof firstMilestone.completed).toBe('boolean');
      expect(typeof firstMilestone.available).toBe('boolean');
    });

    it('purchasing property grants company XP', async () => {
      const { company, token } = await setupCompany();
      const testProperty = await createTestProperty({
        type: 'land',
        currentPrice: 50_000,
        basePrice: 50_000,
        forSale: true,
      });
      company.treasury.balance = 1_000_000;
      await company.save();
      const initialXp = company.xp;

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/properties/purchase`)
        .set(authHeader(token))
        .send({ propertyId: testProperty._id.toString() });

      expect(res.status).toBe(200);

      const updated = await RealEstateCompany.findById(company._id);
      expect(updated.xp).toBeGreaterThan(initialXp);
    });

    it('company creation sets correct xpToNextLevel', async () => {
      const { company } = await setupCompany();
      expect(company.xpToNextLevel).toBeGreaterThan(0);
      expect(company.level).toBe(1);
    });

    it('GET /:id/milestones returns 403 for non-members', async () => {
      const { company } = await setupCompany();
      const outsider = await createAuthenticatedUser({ level: 15, balance: 5_000_000 });
      const res = await request(app)
        .get(`/real-estate-companies/${company._id}/milestones`)
        .set(authHeader(outsider.token));

      expect(res.status).toBe(403);
    });
  });
});
