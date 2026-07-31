import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import Loan from '../../models/Loan.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import Notification from '../../models/Notification.js';
import CompanyAuditLog from '../../models/CompanyAuditLog.js';
import { processCompanyLoanRequests } from '../companyProcessing.js';

beforeEach(async () => {
  await RealEstateCompany.deleteMany({});
  await Loan.deleteMany({});
  await User.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
  await Notification.deleteMany({});
  await CompanyAuditLog.deleteMany({});
});

describe('Company Loan Voting - Tick-Based Timing', () => {
  const createTestCompany = async (members) => {
    return RealEstateCompany.create({
      name: `TestCompany_${Date.now()}_${Math.random()}`,
      founderId: members[0].userId,
      members,
      treasury: { balance: 1000000 },
      active: true,
    });
  };

  const createTestUser = async (overrides = {}) => {
    return User.create({
      username: `testuser_${Date.now()}_${Math.random()}`,
      email: `test_${Date.now()}_${Math.random()}@example.com`,
      password: 'Password123',
      ...overrides,
    });
  };

  describe('Founder Auto-Vote (4 ticks = 24 hours)', () => {
    it('should auto-vote YES for founder after 4 ticks', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();

      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
        { userId: member2._id, role: 'member' },
      ];

      const company = await createTestCompany(members);
      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000,
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
          },
        },
      });

      const currentTick = 104; // 4 ticks after creation
      const result = await processCompanyLoanRequests(currentTick);

      expect(result.autoVoted).toBe(1);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      const updatedLR = updatedCompany.loanRequests[0];

      const founderVote = updatedLR.votes.find((v) => v.userId.toString() === founder._id.toString());
      expect(founderVote).toBeTruthy();
      expect(founderVote.vote).toBe('yes');
    });

    it('should NOT auto-vote before 4 ticks', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();

      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
      ];

      const company = await createTestCompany(members);
      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000,
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
          },
        },
      });

      const currentTick = 102; // Only 2 ticks after creation
      const result = await processCompanyLoanRequests(currentTick);

      expect(result.autoVoted).toBe(0);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      expect(updatedCompany.loanRequests[0].votes.length).toBe(0);
    });

    it('should NOT auto-vote if founder already voted', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();

      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
      ];

      const company = await createTestCompany(members);
      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000,
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
            votes: [{ userId: founder._id, vote: 'no', votedAt: new Date() }],
          },
        },
      });

      const currentTick = 104;
      const result = await processCompanyLoanRequests(currentTick);

      expect(result.autoVoted).toBe(0);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      const founderVote = updatedCompany.loanRequests[0].votes.find(
        (v) => v.userId.toString() === founder._id.toString(),
      );
      expect(founderVote.vote).toBe('no');
    });
  });

  describe('Request Expiration (8 ticks = 48 hours)', () => {
    it('should auto-count inactive members as YES after expiration and approve', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();

      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
        { userId: member2._id, role: 'member' },
      ];

      const company = await createTestCompany(members);
      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000,
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
            votes: [{ userId: founder._id, vote: 'no', votedAt: new Date() }],
          },
        },
      });

      // 8 ticks: founder NO, member2 inactive → auto-counted as YES
      // YES=1 (member2 auto), NO=1 (founder), totalVoters=2 → 1/2 >= 50% → approved → executed
      const currentTick = 108;
      const result = await processCompanyLoanRequests(currentTick);

      expect(result.expired).toBe(1);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      const lr = updatedCompany.loanRequests[0];
      expect(lr.status).toBe('executed');
      expect(lr.loanId).toBeTruthy();
      // member2 was auto-counted as YES
      const member2Vote = lr.votes.find((v) => v.userId.toString() === member2._id.toString());
      expect(member2Vote).toBeTruthy();
      expect(member2Vote.vote).toBe('yes');
    });

    it('should NOT expire before 8 ticks', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();

      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
        { userId: member2._id, role: 'member' },
      ];

      const company = await createTestCompany(members);
      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000,
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
            votes: [{ userId: founder._id, vote: 'no', votedAt: new Date() }],
          },
        },
      });

      // Only 6 ticks - should still be pending
      const currentTick = 106;
      const result = await processCompanyLoanRequests(currentTick);

      expect(result.expired).toBe(0);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      expect(updatedCompany.loanRequests[0].status).toBe('pending');
    });
  });

  describe('Auto-Approval and Execution', () => {
    it('should approve when founder auto-vote meets 50% threshold and auto-execute', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();

      // 2 members: founder (ceo) + member1 (requester)
      // totalVoters = 2 - 1 = 1 (requester excluded)
      // After founder auto-vote YES: 1/1 = 100% >= 50% → approved
      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
      ];

      const company = await createTestCompany(members);
      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000,
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
          },
        },
      });

      // 4 ticks: founder auto-votes YES, threshold met → approved → auto-executed
      const currentTick = 104;
      const result = await processCompanyLoanRequests(currentTick);

      expect(result.autoVoted).toBe(1);
      expect(result.autoExecuted).toBe(1);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      const lr = updatedCompany.loanRequests[0];
      expect(lr.status).toBe('executed');
      expect(lr.loanId).toBeTruthy();

      const loan = await Loan.findById(lr.loanId);
      expect(loan).toBeTruthy();
      expect(loan.companyId.toString()).toBe(company._id.toString());
      expect(loan.principal).toBe(100000);
      expect(loan.active).toBe(true);
    });

    it('should reject execution when company already has 5 active loans', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();

      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
      ];

      const company = await createTestCompany(members);

      // Create 5 active loans
      for (let i = 0; i < 5; i++) {
        await Loan.create({
          userId: founder._id,
          companyId: company._id,
          type: 'business',
          principal: 50000,
          remainingBalance: 50000,
          interestRate: 0.05,
          durationTicks: 12,
          ticksRemaining: 12,
          paymentPerTick: 5000,
          active: true,
        });
      }

      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000,
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
          },
        },
      });

      const currentTick = 104;
      const result = await processCompanyLoanRequests(currentTick);

      expect(result.autoVoted).toBe(1);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      expect(updatedCompany.loanRequests[0].status).toBe('rejected');
    });

    it('should reject execution when debt would exceed net worth', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();

      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
      ];

      // Low treasury, no properties → net worth is small
      const company = await createTestCompany(members);
      company.treasury.balance = 10000;
      await company.save();

      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000, // Way more than net worth
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
          },
        },
      });

      const currentTick = 104;
      const result = await processCompanyLoanRequests(currentTick);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      expect(updatedCompany.loanRequests[0].status).toBe('rejected');
    });
  });

  describe('Tick-Based Timing Accuracy', () => {
    it('should use tickNumber parameter, not Date.now()', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();

      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
      ];

      const company = await createTestCompany(members);
      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000,
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
          },
        },
      });

      // Only 2 ticks after creation - should NOT auto-vote
      // Even if real wall-clock time has passed
      const currentTick = 102;
      const result = await processCompanyLoanRequests(currentTick);

      expect(result.autoVoted).toBe(0);
    });

    it('correctly calculates 4 ticks = 24 hours and 8 ticks = 48 hours', async () => {
      const founder = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();

      const members = [
        { userId: founder._id, role: 'ceo' },
        { userId: member1._id, role: 'member' },
        { userId: member2._id, role: 'member' },
      ];

      const company = await createTestCompany(members);
      await company.updateOne({
        $push: {
          loanRequests: {
            requestedBy: member1._id,
            principal: 100000,
            durationTicks: 12,
            loanType: 'business',
            createdTick: 100,
            votes: [{ userId: founder._id, vote: 'no', votedAt: new Date() }],
          },
        },
      });

      // At tick 103 (3 ticks) - still pending, no auto-vote
      let result = await processCompanyLoanRequests(103);
      expect(result.autoVoted).toBe(0);
      expect(result.expired).toBe(0);

      // At tick 104 (4 ticks) - founder already voted, still pending
      result = await processCompanyLoanRequests(104);
      expect(result.autoVoted).toBe(0);
      expect(result.expired).toBe(0);

      // At tick 107 (7 ticks) - still pending, no auto-vote for CEO (already voted)
      const company2 = await RealEstateCompany.findById(company._id);
      company2.loanRequests[0].status = 'pending';
      company2.loanRequests[0].votes = [{ userId: founder._id, vote: 'no', votedAt: new Date() }];
      await company2.save();

      result = await processCompanyLoanRequests(107);
      expect(result.expired).toBe(0);

      // At tick 108 (8 ticks) - expired, member2 auto-counted as YES → approved & executed
      const company3 = await RealEstateCompany.findById(company._id);
      company3.loanRequests[0].status = 'pending';
      company3.loanRequests[0].votes = [{ userId: founder._id, vote: 'no', votedAt: new Date() }];
      await company3.save();

      result = await processCompanyLoanRequests(108);
      expect(result.expired).toBe(1);
      const updated = await RealEstateCompany.findById(company._id);
      expect(updated.loanRequests[0].status).toBe('executed');
    });
  });
});
