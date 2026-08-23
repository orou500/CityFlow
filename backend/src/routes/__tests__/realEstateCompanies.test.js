import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, createTestCity, authHeader } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import CompanyAuditLog from '../../models/CompanyAuditLog.js';
import GameState from '../../models/GameState.js';
import Property from '../../models/Property.js';
import Notification from '../../models/Notification.js';
import ConstructionProject from '../../models/ConstructionProject.js';
import User from '../../models/User.js';
import Loan from '../../models/Loan.js';
import { xpRequiredForLevel } from '../../config/companyProgression.js';

const app = createApp();

async function createFounder(overrides = {}) {
  const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { user, token } = await createAuthenticatedUser({
    balance: 10_000_000,
    level: 20,
    createdAt,
    ...overrides,
  });
  const property = await createTestProperty({
    ownerId: user._id,
    currentPrice: 5_000_000,
    basePrice: 5_000_000,
  });
  return { user, token, property };
}

async function createTestCompany(founderData, overrides = {}) {
  const { token } = founderData;
  if (!overrides.hqCityId) {
    const city = await createTestCity();
    overrides.hqCityId = city._id;
  }
  const res = await request(app)
    .post('/real-estate-companies')
    .set(authHeader(token))
    .send({ name: `TestCompany_${Date.now()}`, description: 'A test company', ...overrides });
  expect(res.status).toBe(201);
  const company = await RealEstateCompany.findById(res.body._id);
  return { company, res, token };
}

async function addMemberToCompany(companyId, founderToken, applicantData) {
  const { user, token } = applicantData;
  const applyRes = await request(app)
    .post(`/real-estate-companies/${companyId}/apply`)
    .set(authHeader(token))
    .send({ message: 'I want to join' });
  expect(applyRes.status).toBe(201);

  const refreshedCompany = await RealEstateCompany.findById(companyId);
  const application = refreshedCompany.applications.find(
    (a) => a.userId?.toString() === user._id.toString() && a.status === 'pending',
  );
  expect(application).toBeTruthy();

  const approveRes = await request(app)
    .post(`/real-estate-companies/${companyId}/applications/${application._id}/approve`)
    .set(authHeader(founderToken))
    .send({});
  expect(approveRes.status).toBe(200);

  return { user, token };
}

describe('Real Estate Companies', () => {
  beforeEach(async () => {
    await GameState.findOneAndUpdate({}, { tickNumber: 100, $setOnInsert: { season: 1 } }, { upsert: true, new: true });
  });

  describe('POST /real-estate-companies', () => {
    let testCityId;

    beforeEach(async () => {
      const city = await createTestCity();
      testCityId = city._id;
    });

    it('creates a company for a qualified founder', async () => {
      const founder = await createFounder();
      const res = await request(app)
        .post('/real-estate-companies')
        .set(authHeader(founder.token))
        .send({ name: `NewCompany_${Date.now()}`, description: 'Test', hqCityId: testCityId });

      expect(res.status).toBe(201);
      expect(res.body.name).toMatch(/NewCompany_/);
      expect(res.body.members[0].role).toBe('ceo');
      expect(res.body.members[0].shares).toBe(700);
      expect(res.body.shares.treasuryShares).toBe(300);
      const updatedUser = await request(app).get('/auth/me').set(authHeader(founder.token));
      expect(updatedUser.body.balance).toBeLessThan(founder.user.balance);
    });

    it('rejects company creation for under-leveled users', async () => {
      const { token } = await createFounder({ level: 1 });
      const res = await request(app)
        .post('/real-estate-companies')
        .set(authHeader(token))
        .send({ name: `LowLevel_${Date.now()}`, hqCityId: testCityId });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Level 12/);
    });

    it('rejects company creation at level 11, accepts at level 12+ (authoritative requirement)', async () => {
      const eleven = await createFounder({ level: 11 });
      const rejected = await request(app)
        .post('/real-estate-companies')
        .set(authHeader(eleven.token))
        .send({ name: `Level11_${Date.now()}`, hqCityId: testCityId });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error).toContain('Level 12');

      const twelve = await createFounder({ level: 12 });
      const accepted = await request(app)
        .post('/real-estate-companies')
        .set(authHeader(twelve.token))
        .send({ name: `Level12_${Date.now()}`, hqCityId: testCityId });
      expect(accepted.status).toBe(201);
    });

    it('rejects duplicate company names', async () => {
      const founder = await createFounder();
      const name = `DupeCompany_${Date.now()}`;
      await request(app)
        .post('/real-estate-companies')
        .set(authHeader(founder.token))
        .send({ name, hqCityId: testCityId });

      const res = await request(app)
        .post('/real-estate-companies')
        .set(authHeader(founder.token))
        .send({ name, hqCityId: testCityId });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already exists/i);
    });
  });

  describe('Treasury', () => {
    it('allows members to deposit and directors to withdraw', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);

      const depositRes = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 1_000_000 });

      expect(depositRes.status).toBe(200);
      expect(depositRes.body.treasury.balance).toBe(1_000_000);

      const withdrawRes = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/withdraw`)
        .set(authHeader(token))
        .send({ amount: 500_000, recipientId: founder.user._id.toString() });

      expect(withdrawRes.status).toBe(200);
      expect(withdrawRes.body.treasury.balance).toBe(500_000);
    });

    it('rejects non-members from depositing', async () => {
      const founder = await createFounder();
      const { company } = await createTestCompany(founder);
      const other = await createAuthenticatedUser();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(other.token))
        .send({ amount: 100_000 });

      expect(res.status).toBe(403);
    });

    it('rejects deposit with zero amount', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid/i);
    });

    it('rejects deposit with negative amount', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: -5000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid/i);
    });

    it('rejects deposit when player has insufficient balance', async () => {
      const founder = await createFounder();
      const { company } = await createTestCompany(founder);

      const member = await createAuthenticatedUser({ balance: 5000, level: 1 });
      await addMemberToCompany(company._id, founder.token, member);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(member.token))
        .send({ amount: 10_000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/insufficient/i);

      const userAfter = await User.findById(member.user._id);
      expect(userAfter.balance).toBe(5000);

      const companyAfter = await RealEstateCompany.findById(company._id);
      expect(companyAfter.treasury.balance).toBe(0);
    });

    it('deducts from player balance and increases treasury atomically', async () => {
      const founder = await createFounder({ balance: 10_100_000 });
      const { company, token } = await createTestCompany(founder);

      const balanceBefore = (await User.findById(founder.user._id)).balance;
      const treasuryBefore = company.treasury.balance;

      const depositAmount = 30_000;
      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: depositAmount });

      expect(res.status).toBe(200);
      expect(res.body.treasury.balance).toBe(treasuryBefore + depositAmount);

      const userAfter = await User.findById(founder.user._id);
      expect(userAfter.balance).toBe(balanceBefore - depositAmount);

      const companyAfter = await RealEstateCompany.findById(company._id);
      expect(companyAfter.treasury.balance).toBe(treasuryBefore + depositAmount);
    });

    it('persists balances after deposit (re-read from DB)', async () => {
      const founder = await createFounder({ balance: 10_200_000 });
      const { company, token } = await createTestCompany(founder);

      const balanceBefore = (await User.findById(founder.user._id)).balance;

      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 50_000 });

      const userFresh = await User.findById(founder.user._id);
      expect(userFresh.balance).toBe(balanceBefore - 50_000);

      const companyFresh = await RealEstateCompany.findById(company._id);
      expect(companyFresh.treasury.balance).toBe(50_000);
    });

    it('allows multiple deposits that accumulate correctly', async () => {
      const founder = await createFounder({ balance: 10_500_000 });
      const { company, token } = await createTestCompany(founder);

      const balanceBefore = (await User.findById(founder.user._id)).balance;

      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 100_000 });

      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 200_000 });

      const userAfter = await User.findById(founder.user._id);
      expect(userAfter.balance).toBe(balanceBefore - 300_000);

      const companyAfter = await RealEstateCompany.findById(company._id);
      expect(companyAfter.treasury.balance).toBe(300_000);
    });

    it('rejects unauthenticated deposit', async () => {
      const founder = await createFounder();
      const { company } = await createTestCompany(founder);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .send({ amount: 10_000 });

      expect(res.status).toBe(401);
    });

    it('prevents deposit into another company treasury', async () => {
      const founder = await createFounder();
      const { company: company1, token: token1 } = await createTestCompany(founder);

      const otherFounder = await createFounder();
      const { company: company2 } = await createTestCompany(otherFounder);

      const res = await request(app)
        .post(`/real-estate-companies/${company2._id}/treasury/deposit`)
        .set(authHeader(token1))
        .send({ amount: 10_000 });

      expect(res.status).toBe(403);

      const company2After = await RealEstateCompany.findById(company2._id);
      expect(company2After.treasury.balance).toBe(0);
    });

    it('member without funds cannot deposit even $1', async () => {
      const founder = await createFounder();
      const { company } = await createTestCompany(founder);

      const member = await createAuthenticatedUser({ balance: 0, level: 1 });
      await addMemberToCompany(company._id, founder.token, member);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(member.token))
        .send({ amount: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/insufficient/i);
    });
  });

  describe('Applications', () => {
    it('allows a player to apply and the CEO to approve', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const applicant = await createAuthenticatedUser({ balance: 1_000_000 });

      const applyRes = await request(app)
        .post(`/real-estate-companies/${company._id}/apply`)
        .set(authHeader(applicant.token))
        .send({ message: 'I want to join' });

      expect(applyRes.status).toBe(201);

      const refreshedCompany = await RealEstateCompany.findById(company._id);
      const applicationId = refreshedCompany.applications[0]._id;

      const approveRes = await request(app)
        .post(`/real-estate-companies/${company._id}/applications/${applicationId}/approve`)
        .set(authHeader(token))
        .send({});

      expect(approveRes.status).toBe(200);

      const approvedCompany = await RealEstateCompany.findById(company._id);
      expect(approvedCompany.members.length).toBe(2);

      const updatedApplicant = await request(app).get('/auth/me').set(authHeader(applicant.token));
      expect(updatedApplicant.body.companyId).toBe(company._id.toString());
    });
  });

  describe('Direct loans', () => {
    it('returns loan options and allows the CEO to take a direct loan', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 5_000_000 });

      const optionsRes = await request(app)
        .get(`/real-estate-companies/${company._id}/loan-options`)
        .set(authHeader(token));

      expect(optionsRes.status).toBe(200);
      expect(optionsRes.body.products.length).toBeGreaterThan(0);

      const product = optionsRes.body.products[0];
      const loanRes = await request(app)
        .post(`/real-estate-companies/${company._id}/direct-loan`)
        .set(authHeader(token))
        .send({ productId: product.id, principal: 100_000, durationTicks: 12 });

      expect(loanRes.status).toBe(200);
      expect(loanRes.body.loan).toBeTruthy();
      expect(loanRes.body.treasury.balance).toBe(5_100_000);
    });

    it('rejects direct loans for non-CEOs', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const { user: applicant, token: applicantToken } = await createAuthenticatedUser();
      await addMemberToCompany(company._id, token, { user: applicant, token: applicantToken });

      const loanRes = await request(app)
        .post(`/real-estate-companies/${company._id}/direct-loan`)
        .set(authHeader(applicantToken))
        .send({ productType: 'startup', amount: 100_000, durationMonths: 12 });

      expect(loanRes.status).toBe(403);
    });
  });

  describe('Property purchase votes', () => {
    it('creates a request, notifies members, and executes on majority vote', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const { user: member, token: memberToken } = await createAuthenticatedUser();
      await addMemberToCompany(company._id, token, { user: member, token: memberToken });

      const city = await createTestCity();
      const property = await Property.create({
        name: 'VoteLand',
        type: 'land',
        cityId: city._id,
        currentPrice: 1_000_000,
        basePrice: 1_000_000,
        forSale: true,
      });

      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 5_000_000 });

      const proposeRes = await request(app)
        .post(`/real-estate-companies/${company._id}/property-purchase-requests`)
        .set(authHeader(token))
        .send({ propertyId: property._id.toString() });
      expect(proposeRes.status).toBe(201);

      const memberNotifications = await Notification.find({ userId: member._id, type: 'company_vote' });
      expect(memberNotifications.length).toBeGreaterThan(0);
      expect(memberNotifications[0].message).toMatch(/Vote to approve/);

      const refreshedCompany = await RealEstateCompany.findById(company._id);
      const voteRes = await request(app)
        .post(
          `/real-estate-companies/${company._id}/property-purchase-requests/${refreshedCompany.propertyPurchaseRequests[0]._id}/vote`,
        )
        .set(authHeader(memberToken))
        .send({ vote: 'yes' });
      expect(voteRes.status).toBe(200);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      expect(updatedCompany.propertyPurchaseRequests[0].status).toBe('executed');
      expect(updatedCompany.stats.propertiesOwned).toBe(1);
      expect(updatedCompany.treasury.balance).toBe(4_020_000);

      const updatedProperty = await Property.findById(property._id);
      expect(updatedProperty.companyId?.toString()).toBe(company._id.toString());
    });
  });

  describe('Loan request votes', () => {
    it('creates a request, notifies members, and executes on majority vote', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const { user: member, token: memberToken } = await createAuthenticatedUser();
      await addMemberToCompany(company._id, token, { user: member, token: memberToken });

      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 5_000_000 });

      const proposeRes = await request(app)
        .post(`/real-estate-companies/${company._id}/loan-requests`)
        .set(authHeader(token))
        .send({ principal: 100_000, durationTicks: 12, loanType: 'business' });
      expect(proposeRes.status).toBe(201);

      const memberNotifications = await Notification.find({ userId: member._id, type: 'company_vote' });
      expect(memberNotifications.length).toBeGreaterThan(0);
      expect(memberNotifications[0].message).toMatch(/Vote to approve/);

      const refreshedCompany = await RealEstateCompany.findById(company._id);
      const voteRes = await request(app)
        .post(`/real-estate-companies/${company._id}/loan-requests/${refreshedCompany.loanRequests[0]._id}/vote`)
        .set(authHeader(memberToken))
        .send({ vote: 'yes' });
      expect(voteRes.status).toBe(200);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      expect(updatedCompany.loanRequests[0].status).toBe('approved');
    });
  });

  describe('Investments', () => {
    it('allows a director to create an investment', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      company.level = 5;
      company.xp = xpRequiredForLevel(5);
      await company.save();

      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 5_000_000 });

      const investRes = await request(app)
        .post(`/real-estate-companies/${company._id}/investments`)
        .set(authHeader(token))
        .send({ investmentType: 'government_bond', amount: 1_000_000 });

      expect(investRes.status).toBe(200);
      expect(investRes.body.investment.investmentType).toBe('government_bond');
      expect(investRes.body.investment.principal).toBe(1_000_000);
      expect(investRes.body.treasury.balance).toBe(4_000_000);

      const listRes = await request(app)
        .get(`/real-estate-companies/${company._id}/investments`)
        .set(authHeader(token));

      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(1);
    });

    it('rejects investments below minimum amount', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 5_000_000 });

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/investments`)
        .set(authHeader(token))
        .send({ productType: 'government_bond', amount: 1 });

      expect(res.status).toBe(400);
    });
  });

  describe('Development requests', () => {
    async function setupCompanyWithProperty() {
      const founder = await createFounder({ balance: 50_000_000 });
      const { company, token } = await createTestCompany(founder);
      const { user: member, token: memberToken } = await createAuthenticatedUser();
      await addMemberToCompany(company._id, token, { user: member, token: memberToken });

      const depositRes = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 10_000_000 });
      expect(depositRes.status).toBe(200);

      const city = await createTestCity();
      const apartment = await Property.create({
        name: 'TestApartment',
        type: 'apartment',
        cityId: city._id,
        currentPrice: 2_000_000,
        basePrice: 2_000_000,
        rent: 10_000,
        condition: 80,
        companyId: company._id,
        units: [{ unitNumber: 1, type: 'apartment', rentPrice: 10_000, occupied: false }],
      });

      const land = await Property.create({
        name: 'TestLand',
        type: 'land',
        cityId: city._id,
        currentPrice: 5_000_000,
        basePrice: 5_000_000,
        companyId: company._id,
        size: 5000,
        developmentLevel: 0,
      });

      return { founder, company, token, member, memberToken, apartment, land };
    }

    it('creates an upgrade development request', async () => {
      const { company, token, apartment } = await setupCompanyWithProperty();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: apartment._id.toString(),
          actionType: 'upgrade',
          actionData: { upgradeType: 'renovation' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const updatedCompany = await RealEstateCompany.findById(company._id);
      expect(updatedCompany.developmentRequests.length).toBe(1);
      expect(updatedCompany.developmentRequests[0].actionType).toBe('upgrade');
      expect(updatedCompany.developmentRequests[0].status).toBe('pending');
      expect(updatedCompany.developmentRequests[0].estimatedCost).toBeGreaterThan(0);
    });

    it('creates an improvement development request', async () => {
      const { company, token, apartment } = await setupCompanyWithProperty();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: apartment._id.toString(),
          actionType: 'improvement',
          actionData: { improvementId: 'renovation' },
        });

      expect(res.status).toBe(201);
      const updatedCompany = await RealEstateCompany.findById(company._id);
      expect(updatedCompany.developmentRequests[0].actionType).toBe('improvement');
    });

    it('creates a construction development request on land', async () => {
      const { company, token, land } = await setupCompanyWithProperty();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: land._id.toString(),
          actionType: 'construction',
          actionData: { projectType: 'apartment_building' },
        });

      expect(res.status).toBe(201);
      const updatedCompany = await RealEstateCompany.findById(company._id);
      expect(updatedCompany.developmentRequests[0].actionType).toBe('construction');
      expect(updatedCompany.developmentRequests[0].estimatedCost).toBeGreaterThan(0);
    });

    it('notifies other members when a request is created', async () => {
      const { company, token, member, apartment } = await setupCompanyWithProperty();

      await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: apartment._id.toString(),
          actionType: 'upgrade',
          actionData: { upgradeType: 'renovation' },
        });

      const memberNotifications = await Notification.find({ userId: member._id, type: 'company_vote' });
      expect(memberNotifications.length).toBeGreaterThan(0);
      expect(memberNotifications[0].message).toMatch(/proposed/);
    });

    it('rejects upgrade on land', async () => {
      const { company, token, land } = await setupCompanyWithProperty();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: land._id.toString(),
          actionType: 'upgrade',
          actionData: { upgradeType: 'renovation' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Only developed properties/i);
    });

    it('rejects construction on apartment', async () => {
      const { company, token, apartment } = await setupCompanyWithProperty();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: apartment._id.toString(),
          actionType: 'construction',
          actionData: { projectType: 'apartment_building' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Construction requires land/i);
    });

    it('rejects when treasury is insufficient', async () => {
      const founder = await createFounder({ balance: 50_000_000 });
      const { company, token } = await createTestCompany(founder);
      await addMemberToCompany(company._id, token, await createAuthenticatedUser());

      const city = await createTestCity();
      const land = await Property.create({
        name: 'ExpensiveLand',
        type: 'land',
        cityId: city._id,
        currentPrice: 50_000_000,
        basePrice: 50_000_000,
        companyId: company._id,
        size: 5000,
        developmentLevel: 0,
      });

      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 100 });

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: land._id.toString(),
          actionType: 'construction',
          actionData: { projectType: 'apartment_building' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Insufficient treasury/i);
    });

    it('rejects duplicate pending request for same action', async () => {
      const { company, token, apartment } = await setupCompanyWithProperty();

      await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: apartment._id.toString(),
          actionType: 'upgrade',
          actionData: { upgradeType: 'renovation' },
        });

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: apartment._id.toString(),
          actionType: 'upgrade',
          actionData: { upgradeType: 'renovation' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/pending development request/i);
    });

    it('rejects requests for company-not-owned property', async () => {
      const { company, token } = await setupCompanyWithProperty();
      const city = await createTestCity();
      const otherProp = await Property.create({
        name: 'OtherProp',
        type: 'apartment',
        cityId: city._id,
        currentPrice: 1_000_000,
        basePrice: 1_000_000,
      });

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: otherProp._id.toString(),
          actionType: 'upgrade',
          actionData: { upgradeType: 'renovation' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not own/i);
    });

    it('rejects non-member requests', async () => {
      const { company, apartment } = await setupCompanyWithProperty();
      const outsider = await createAuthenticatedUser();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(outsider.token))
        .send({
          propertyId: apartment._id.toString(),
          actionType: 'upgrade',
          actionData: { upgradeType: 'renovation' },
        });

      expect(res.status).toBe(403);
    });

    it('rejects requests with less than 2 members', async () => {
      const founder = await createFounder({ balance: 50_000_000 });
      const { company, token } = await createTestCompany(founder);
      const city = await createTestCity();
      const prop = await Property.create({
        name: 'SoloProp',
        type: 'apartment',
        cityId: city._id,
        currentPrice: 1_000_000,
        basePrice: 1_000_000,
        companyId: company._id,
        units: [{ unitNumber: 1, type: 'apartment', rentPrice: 5000, occupied: false }],
      });

      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 5_000_000 });

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/development-requests`)
        .set(authHeader(token))
        .send({
          propertyId: prop._id.toString(),
          actionType: 'upgrade',
          actionData: { upgradeType: 'renovation' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 2 members/i);
    });

    describe('Voting and execution', () => {
      it('executes upgrade on majority vote', async () => {
        const { company, token, memberToken, apartment } = await setupCompanyWithProperty();
        const oldPrice = apartment.currentPrice;

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: apartment._id.toString(),
            actionType: 'upgrade',
            actionData: { upgradeType: 'renovation' },
          });

        const refreshedCompany = await RealEstateCompany.findById(company._id);
        const devReqId = refreshedCompany.developmentRequests[0]._id;

        const voteRes = await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(memberToken))
          .send({ vote: 'yes' });

        expect(voteRes.status).toBe(200);

        const finalCompany = await RealEstateCompany.findById(company._id);
        expect(finalCompany.developmentRequests[0].status).toBe('executed');
        expect(finalCompany.treasury.balance).toBeLessThan(10_000_000);

        const updatedProperty = await Property.findById(apartment._id);
        expect(updatedProperty.currentPrice).toBeGreaterThan(oldPrice);
        expect(updatedProperty.upgrades.length).toBe(1);
        expect(updatedProperty.upgrades[0].name).toBe('renovation');
      });

      it('executes improvement on majority vote', async () => {
        const { company, token, memberToken, apartment } = await setupCompanyWithProperty();

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: apartment._id.toString(),
            actionType: 'improvement',
            actionData: { improvementId: 'renovation' },
          });

        const refreshedCompany = await RealEstateCompany.findById(company._id);
        const devReqId = refreshedCompany.developmentRequests[0]._id;

        const voteRes = await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(memberToken))
          .send({ vote: 'yes' });

        expect(voteRes.status).toBe(200);

        const finalCompany = await RealEstateCompany.findById(company._id);
        expect(finalCompany.developmentRequests[0].status).toBe('executed');

        const updatedProperty = await Property.findById(apartment._id);
        expect(updatedProperty.activeImprovement).toBeTruthy();
        expect(updatedProperty.activeImprovement.improvementId).toBe('renovation');
      });

      it('executes construction on majority vote', async () => {
        const { company, token, memberToken, land } = await setupCompanyWithProperty();

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: land._id.toString(),
            actionType: 'construction',
            actionData: { projectType: 'apartment_building' },
          });

        const refreshedCompany = await RealEstateCompany.findById(company._id);
        const devReqId = refreshedCompany.developmentRequests[0]._id;

        const voteRes = await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(memberToken))
          .send({ vote: 'yes' });

        expect(voteRes.status).toBe(200);

        const finalCompany = await RealEstateCompany.findById(company._id);
        expect(finalCompany.developmentRequests[0].status).toBe('executed');

        const updatedLand = await Property.findById(land._id);
        expect(updatedLand.developmentLevel).toBe(1);
        expect(updatedLand.forSale).toBe(false);

        const project = await ConstructionProject.findOne({ landId: land._id });
        expect(project).toBeTruthy();
        expect(project.status).toBe('under_construction');
        expect(project.companyId.toString()).toBe(company._id.toString());
        expect(project.ownerId.toString()).toBe(finalCompany.members[0].userId.toString());
      });

      it('sends notifications to all members on execution', async () => {
        const { company, token, memberToken, member, apartment } = await setupCompanyWithProperty();

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: apartment._id.toString(),
            actionType: 'upgrade',
            actionData: { upgradeType: 'renovation' },
          });

        const refreshedCompany = await RealEstateCompany.findById(company._id);
        const devReqId = refreshedCompany.developmentRequests[0]._id;

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(memberToken))
          .send({ vote: 'yes' });

        const notifications = await Notification.find({
          userId: member._id,
          type: 'company_vote',
          title: 'Development Approved & Executed',
        });
        expect(notifications.length).toBeGreaterThan(0);
      });

      it('prevents proposer from voting on own request', async () => {
        const { company, token, apartment } = await setupCompanyWithProperty();

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: apartment._id.toString(),
            actionType: 'upgrade',
            actionData: { upgradeType: 'renovation' },
          });

        const refreshedCompany = await RealEstateCompany.findById(company._id);
        const devReqId = refreshedCompany.developmentRequests[0]._id;

        const voteRes = await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(token))
          .send({ vote: 'yes' });

        expect(voteRes.status).toBe(400);
        expect(voteRes.body.error).toMatch(/own request/i);
      });

      it('prevents double voting', async () => {
        const founder = await createFounder({ balance: 50_000_000 });
        const { company, token } = await createTestCompany(founder);
        const { user: member1, token: member1Token } = await createAuthenticatedUser();
        const { user: member2, token: member2Token } = await createAuthenticatedUser();
        await addMemberToCompany(company._id, token, { user: member1, token: member1Token });
        await addMemberToCompany(company._id, token, { user: member2, token: member2Token });

        await request(app)
          .post(`/real-estate-companies/${company._id}/treasury/deposit`)
          .set(authHeader(token))
          .send({ amount: 10_000_000 });

        const city = await createTestCity();
        const prop = await Property.create({
          name: 'DoubleVoteProp',
          type: 'apartment',
          cityId: city._id,
          currentPrice: 2_000_000,
          basePrice: 2_000_000,
          rent: 10_000,
          companyId: company._id,
          units: [{ unitNumber: 1, type: 'apartment', rentPrice: 10_000, occupied: false }],
        });

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: prop._id.toString(),
            actionType: 'upgrade',
            actionData: { upgradeType: 'renovation' },
          });

        const refreshedCompany = await RealEstateCompany.findById(company._id);
        const devReqId = refreshedCompany.developmentRequests[0]._id;

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(member1Token))
          .send({ vote: 'no' });

        const doubleVoteRes = await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(member1Token))
          .send({ vote: 'yes' });

        expect(doubleVoteRes.status).toBe(400);
        expect(doubleVoteRes.body.error).toMatch(/already voted/i);
      });

      it('rejects vote on already-executed request', async () => {
        const founder = await createFounder({ balance: 50_000_000 });
        const { company, token } = await createTestCompany(founder);
        const { user: member1, token: member1Token } = await createAuthenticatedUser();
        const { user: member2, token: member2Token } = await createAuthenticatedUser();
        await addMemberToCompany(company._id, token, { user: member1, token: member1Token });
        await addMemberToCompany(company._id, token, { user: member2, token: member2Token });

        await request(app)
          .post(`/real-estate-companies/${company._id}/treasury/deposit`)
          .set(authHeader(token))
          .send({ amount: 10_000_000 });

        const city = await createTestCity();
        const prop = await Property.create({
          name: 'ExecProp',
          type: 'apartment',
          cityId: city._id,
          currentPrice: 2_000_000,
          basePrice: 2_000_000,
          rent: 10_000,
          companyId: company._id,
          units: [{ unitNumber: 1, type: 'apartment', rentPrice: 10_000, occupied: false }],
        });

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: prop._id.toString(),
            actionType: 'upgrade',
            actionData: { upgradeType: 'renovation' },
          });

        const refreshedCompany = await RealEstateCompany.findById(company._id);
        const devReqId = refreshedCompany.developmentRequests[0]._id;

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(member1Token))
          .send({ vote: 'yes' });

        const alreadyExecutedRes = await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(member2Token))
          .send({ vote: 'yes' });

        expect(alreadyExecutedRes.status).toBe(400);
        expect(alreadyExecutedRes.body.error).toMatch(/no longer pending/i);
      });

      it('rejects invalid vote value', async () => {
        const { company, token, memberToken, apartment } = await setupCompanyWithProperty();

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: apartment._id.toString(),
            actionType: 'upgrade',
            actionData: { upgradeType: 'renovation' },
          });

        const refreshedCompany = await RealEstateCompany.findById(company._id);
        const devReqId = refreshedCompany.developmentRequests[0]._id;

        const res = await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(memberToken))
          .send({ vote: 'maybe' });

        expect(res.status).toBe(400);
      });
    });

    describe('GET /:id/development-requests', () => {
      it('lists development requests for members', async () => {
        const { company, token, apartment } = await setupCompanyWithProperty();

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: apartment._id.toString(),
            actionType: 'upgrade',
            actionData: { upgradeType: 'renovation' },
          });

        const res = await request(app)
          .get(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token));

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].actionType).toBe('upgrade');
      });

      it('rejects non-members from listing', async () => {
        const { company } = await setupCompanyWithProperty();
        const outsider = await createAuthenticatedUser();

        const res = await request(app)
          .get(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(outsider.token));

        expect(res.status).toBe(403);
      });

      it('returns constructionProjectId for executed construction requests', async () => {
        const { company, token, memberToken, land } = await setupCompanyWithProperty();

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token))
          .send({
            propertyId: land._id.toString(),
            actionType: 'construction',
            actionData: { projectType: 'apartment_building' },
          });

        const refreshedCompany = await RealEstateCompany.findById(company._id);
        const devReqId = refreshedCompany.developmentRequests[0]._id;

        await request(app)
          .post(`/real-estate-companies/${company._id}/development-requests/${devReqId}/vote`)
          .set(authHeader(memberToken))
          .send({ vote: 'yes' });

        const res = await request(app)
          .get(`/real-estate-companies/${company._id}/development-requests`)
          .set(authHeader(token));

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        const dr = res.body[0];
        expect(dr.status).toBe('executed');
        expect(dr.actionType).toBe('construction');
        expect(dr.constructionProjectId).toBeTruthy();
        expect(dr.constructionProjectId.progress).toBeDefined();
        expect(dr.constructionProjectId.status).toBe('under_construction');
        expect(dr.constructionProjectId.constructionPeriods).toBeGreaterThan(0);
      });
    });
  });

  describe('POST /real-estate-companies/:id/ipo', () => {
    it('rejects IPO when ceo not calling', async () => {
      const founder = await createFounder({ balance: 200_000_000, level: 30 });
      const { token: memberToken } = await createAuthenticatedUser();
      const { company } = await createTestCompany(founder);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/ipo`)
        .set(authHeader(memberToken))
        .send({});
      expect(res.status).toBe(403);
    });

    it('rejects IPO when already listed', async () => {
      const founder = await createFounder({ balance: 200_000_000, level: 30 });
      const { company, token } = await createTestCompany(founder);
      company.ipo = { listed: true };
      await company.save();

      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already publicly listed');
    });

    it('rejects IPO with insufficient fee', async () => {
      const founder = await createFounder({ balance: 200_000_000, level: 30 });
      const { company, token } = await createTestCompany(founder);
      company.level = 25;
      company.treasury.balance = 1_000;
      await company.save();

      for (let i = 0; i < 9; i++) {
        const member = await createAuthenticatedUser();
        await addMemberToCompany(company._id, token, member);
      }

      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('IPO costs');
    });

    it('rejects IPO when company level below 10', async () => {
      const founder = await createFounder({ balance: 200_000_000, level: 30 });
      const { company, token } = await createTestCompany(founder);
      company.level = 9;
      await company.save();

      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Level 10');
    });

    it('accepts IPO at exactly company level 10 (authoritative requirement)', async () => {
      const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
      const { company, token } = await createTestCompany(founder);
      company.level = 10;
      company.treasury.balance = 600_000_000;
      company.stats = { totalRentalIncome: 50_000_000, propertiesOwned: 10 };
      await company.save();

      for (let i = 0; i < 9; i++) {
        const member = await createAuthenticatedUser();
        await addMemberToCompany(company._id, token, { user: member.user, token: member.token });
      }
      for (let i = 0; i < 10; i++) {
        await createTestProperty({
          ownerId: founder.user._id,
          companyId: company._id,
          currentPrice: 30_000_000,
          basePrice: 30_000_000,
        });
      }

      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(200);
      expect(res.body.ipo.listed).toBe(true);
    });

    it('rejects IPO when not enough members', async () => {
      const founder = await createFounder({ balance: 200_000_000, level: 30 });
      const { company, token } = await createTestCompany(founder);
      company.level = 10;
      await company.save();

      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('5 members');
    });

    it('rejects IPO when not enough properties', async () => {
      const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
      const { company, token } = await createTestCompany(founder);
      company.level = 25;
      company.treasury.balance = 600_000_000;
      company.stats = { totalRentalIncome: 50_000_000, propertiesOwned: 5 };
      await company.save();
      for (let i = 0; i < 9; i++) {
        const member = await createAuthenticatedUser();
        await addMemberToCompany(company._id, token, { user: member.user, token: member.token });
      }

      for (let i = 0; i < 5; i++) {
        await createTestProperty({
          ownerId: founder.user._id,
          companyId: company._id,
          currentPrice: 30_000_000,
          basePrice: 30_000_000,
        });
      }

      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('10 properties');
    });

    // ─── IPO requirement thresholds (fee $30M, level 10, 5 members, $30M net worth) ───

    async function seedIpoReadyCompany({ level, treasury, propertyPrices, memberCount }) {
      const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
      const { company, token } = await createTestCompany(founder);
      company.level = level;
      company.treasury.balance = treasury;
      await company.save();
      for (let i = 0; i < memberCount - 1; i++) {
        const member = await createAuthenticatedUser();
        await addMemberToCompany(company._id, token, { user: member.user, token: member.token });
      }
      for (const price of propertyPrices) {
        await createTestProperty({
          ownerId: founder.user._id,
          companyId: company._id,
          currentPrice: price,
          basePrice: price,
        });
      }
      return { company, token, founder };
    }

    const TEN_MILLION_PROPS = Array.from({ length: 10 }, () => 5_000_000);

    it('rejects IPO at Level 9 even with $30M+ net worth', async () => {
      const { company, token } = await seedIpoReadyCompany({
        level: 9,
        treasury: 40_000_000,
        propertyPrices: TEN_MILLION_PROPS,
        memberCount: 5,
      });
      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Level 10');
    });

    it('rejects IPO at Level 10 when total worth is under $30M', async () => {
      const { company, token } = await seedIpoReadyCompany({
        level: 10,
        treasury: 20_000_000,
        propertyPrices: Array.from({ length: 10 }, () => 990_000),
        memberCount: 5,
      });
      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('$30,000,000');
    });

    it('accepts IPO at exactly Level 10 with $30M worth and charges exactly $30M', async () => {
      const { company, token } = await seedIpoReadyCompany({
        level: 10,
        treasury: 30_000_000,
        propertyPrices: TEN_MILLION_PROPS,
        memberCount: 5,
      });
      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(200);
      expect(res.body.ipo.listed).toBe(true);
      const refreshed = await RealEstateCompany.findById(company._id);
      expect(refreshed.treasury.balance).toBe(0);
      expect(refreshed.ipo.listFee).toBe(30_000_000);
    });

    it('accepts IPO at Level 10 with $50M net worth', async () => {
      const { company, token } = await seedIpoReadyCompany({
        level: 10,
        treasury: 50_000_000,
        propertyPrices: TEN_MILLION_PROPS,
        memberCount: 5,
      });
      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(200);
      expect(res.body.ipo.listed).toBe(true);
    });

    it('accepts IPO at Level 10 with $100M net worth', async () => {
      const { company, token } = await seedIpoReadyCompany({
        level: 10,
        treasury: 100_000_000,
        propertyPrices: TEN_MILLION_PROPS,
        memberCount: 5,
      });
      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(200);
      expect(res.body.ipo.listed).toBe(true);
    });

    it('accepts IPO with exactly 5 members (threshold)', async () => {
      const { company, token } = await seedIpoReadyCompany({
        level: 10,
        treasury: 100_000_000,
        propertyPrices: TEN_MILLION_PROPS,
        memberCount: 5,
      });
      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(200);
      expect(res.body.ipo.listed).toBe(true);
    });

    it('rejects IPO with fewer than 5 members', async () => {
      const { company, token } = await seedIpoReadyCompany({
        level: 10,
        treasury: 100_000_000,
        propertyPrices: TEN_MILLION_PROPS,
        memberCount: 4,
      });
      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('5 members');
    });

    it('exposes ipoRequirements from GET /:id (backend authoritative)', async () => {
      const { company, token } = await seedIpoReadyCompany({
        level: 10,
        treasury: 100_000_000,
        propertyPrices: TEN_MILLION_PROPS,
        memberCount: 5,
      });
      const res = await request(app).get(`/real-estate-companies/${company._id}`).set(authHeader(token)).send({});
      expect(res.status).toBe(200);
      expect(res.body.ipoRequirements).toMatchObject({
        fee: 30_000_000,
        minLevel: 10,
        minMembers: 5,
        minNetWorth: 30_000_000,
        minProperties: 10,
      });
    });
  });

  describe('POST /real-estate-companies/:id/invite (by username)', () => {
    it('invites a player by username (case-insensitive) and sends a notification', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const target = await createAuthenticatedUser({ username: 'BobTheBuilder' });

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(token))
        .send({ username: 'bobthebuilder' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const refreshed = await RealEstateCompany.findById(company._id);
      const invite = refreshed.invitations.find((i) => i.userId?.toString() === target.user._id.toString());
      expect(invite).toBeTruthy();
      expect(invite.status).toBe('pending');
      expect(invite.invitedBy.toString()).toBe(founder.user._id.toString());

      const storedUser = await User.findById(target.user._id);
      expect(storedUser.normalizedUsername).toBe('bobthebuilder');

      const notif = await Notification.findOne({
        userId: target.user._id,
        eventKey: `company:${company._id}:invite:${target.user._id}`,
      });
      expect(notif).toBeTruthy();
    });

    it('rejects an unknown username with 404', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(token))
        .send({ username: 'ghost_player_123' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('ghost_player_123');
    });

    it('rejects a missing username with 400', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(token))
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('username is required');
    });

    it('rejects inviting yourself', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(token))
        .send({ username: founder.user.username });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot invite yourself');
    });

    it('rejects inviting an existing member', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const member = await createAuthenticatedUser();
      await addMemberToCompany(company._id, token, { user: member.user, token: member.token });

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(token))
        .send({ username: member.user.username });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already a member');
    });

    it('rejects a duplicate pending invitation', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const target = await createAuthenticatedUser();

      const first = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(token))
        .send({ username: target.user.username });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(token))
        .send({ username: target.user.username });
      expect(second.status).toBe(400);
      expect(second.body.error).toContain('already pending');
    });

    it('rejects inviting a player who is already in another company', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const otherFounder = await createFounder();
      const { company: otherCompany, token: otherToken } = await createTestCompany(otherFounder);
      const target = await createAuthenticatedUser();
      await addMemberToCompany(otherCompany._id, otherToken, { user: target.user, token: target.token });

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(token))
        .send({ username: target.user.username });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already in a company');
    });

    it('rejects invites from a member without invite_members permission', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const recruit = await createAuthenticatedUser();
      await addMemberToCompany(company._id, token, { user: recruit.user, token: recruit.token });

      const target = await createAuthenticatedUser();
      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(recruit.token))
        .send({ username: target.user.username });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('permission to invite');
    });

    it('still accepts a legacy userId payload (backward compatibility)', async () => {
      const founder = await createFounder();
      const { company, token } = await createTestCompany(founder);
      const target = await createAuthenticatedUser();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/invite`)
        .set(authHeader(token))
        .send({ userId: target.user._id.toString() });
      expect(res.status).toBe(200);

      const refreshed = await RealEstateCompany.findById(company._id);
      const invite = refreshed.invitations.find((i) => i.userId?.toString() === target.user._id.toString());
      expect(invite).toBeTruthy();
    });
  });

  describe('Leave & leadership transfer', () => {
    async function setupCompanyWithDirector() {
      const founder = await createFounder();
      const { company } = await createTestCompany(founder);
      const directorData = await createAuthenticatedUser({ balance: 5_000_000, level: 10 });
      await addMemberToCompany(company._id, founder.token, directorData);
      const directorId = directorData.user._id.toString();
      const promoteRes = await request(app)
        .put(`/real-estate-companies/${company._id}/members/${directorId}/role`)
        .set(authHeader(founder.token))
        .send({ role: 'director' });
      expect(promoteRes.status).toBe(200);
      return { founder, company, director: directorData, directorId };
    }

    it('blocks the CEO from leaving without transferring leadership first', async () => {
      const { founder, company } = await setupCompanyWithDirector();

      const res = await request(app).post(`/real-estate-companies/${company._id}/leave`).set(authHeader(founder.token));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/transfer leadership/i);

      const fresh = await RealEstateCompany.findById(company._id);
      expect(fresh.members.find((m) => m.userId?.toString() === founder.user._id.toString()).role).toBe('ceo');
      const updatedUser = await User.findById(founder.user._id);
      expect(updatedUser.companyId?.toString()).toBe(company._id.toString());
    });

    it('tells a solo CEO to disband instead of leaving', async () => {
      const founder = await createFounder();
      const { company } = await createTestCompany(founder);

      const res = await request(app).post(`/real-estate-companies/${company._id}/leave`).set(authHeader(founder.token));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/disband/i);
    });

    it('validates leadership transfer requests', async () => {
      const { founder, company, director, directorId } = await setupCompanyWithDirector();

      let res = await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({});
      expect(res.status).toBe(400);

      res = await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(director.token))
        .send({ targetUserId: founder.user._id.toString() });
      expect(res.status).toBe(403);

      res = await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({ targetUserId: founder.user._id.toString() });
      expect(res.status).toBe(400);

      res = await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({ targetUserId: '000000000000000000000000' });
      expect(res.status).toBe(404);

      const recruitData = await createAuthenticatedUser({ balance: 1_000_000, level: 10 });
      await addMemberToCompany(company._id, founder.token, recruitData);
      res = await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({ targetUserId: recruitData.user._id.toString() });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/recruit/i);

      const fresh = await RealEstateCompany.findById(company._id);
      expect(fresh.members.find((m) => m.userId?.toString() === founder.user._id.toString()).role).toBe('ceo');
      expect(fresh.members.find((m) => m.userId?.toString() === directorId).role).toBe('director');
    });

    it('lets the CEO transfer leadership, then leave; shares return to the treasury', async () => {
      const { founder, company, directorId } = await setupCompanyWithDirector();

      const transferRes = await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({ targetUserId: directorId });
      expect(transferRes.status).toBe(200);

      let fresh = await RealEstateCompany.findById(company._id);
      expect(fresh.members.find((m) => m.userId?.toString() === directorId).role).toBe('ceo');
      expect(fresh.members.find((m) => m.userId?.toString() === founder.user._id.toString()).role).toBe('director');

      const audit = await CompanyAuditLog.findOne({ companyId: company._id, action: 'leadership_transferred' });
      expect(audit).toBeTruthy();
      expect(audit.details.toUserId?.toString()).toBe(directorId);
      expect(audit.details.fromUserId?.toString()).toBe(founder.user._id.toString());

      const leaveRes = await request(app)
        .post(`/real-estate-companies/${company._id}/leave`)
        .set(authHeader(founder.token));
      expect(leaveRes.status).toBe(200);

      fresh = await RealEstateCompany.findById(company._id);
      expect(fresh.members.find((m) => m.userId?.toString() === founder.user._id.toString())).toBeUndefined();
      expect(fresh.members.find((m) => m.userId?.toString() === directorId).role).toBe('ceo');
      // founder had 700 shares; they move to treasury (250 + 700 = 950), never silently lost
      expect(fresh.shares.treasuryShares).toBe(950);

      const leftAudit = await CompanyAuditLog.findOne({ companyId: company._id, action: 'member_left' });
      expect(leftAudit.details.shares).toBe(700);
      expect(leftAudit.details.treasuryShares).toBe(950);

      const updatedUser = await User.findById(founder.user._id);
      expect(updatedUser.companyId).toBeNull();
    });

    it('returns a regular member shares to the treasury and records them in the audit log', async () => {
      const { company, director } = await setupCompanyWithDirector();

      const leaveRes = await request(app)
        .post(`/real-estate-companies/${company._id}/leave`)
        .set(authHeader(director.token));
      expect(leaveRes.status).toBe(200);

      const fresh = await RealEstateCompany.findById(company._id);
      expect(fresh.shares.treasuryShares).toBe(300);
      const audit = await CompanyAuditLog.findOne({ companyId: company._id, action: 'member_left' });
      expect(audit.details.shares).toBe(50);
      expect(audit.details.treasuryShares).toBe(300);
      expect(audit.details.role).toBe('director');
    });

    it('former CEO who left cannot use any management endpoint (all historical bypass sites)', async () => {
      const { founder, company, directorId } = await setupCompanyWithDirector();

      await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({ targetUserId: directorId });
      const leaveRes = await request(app)
        .post(`/real-estate-companies/${company._id}/leave`)
        .set(authHeader(founder.token));
      expect(leaveRes.status).toBe(200);

      const cases = [
        ['post', `/real-estate-companies/${company._id}/loan-requests`, { amount: 100_000, loanType: 'standard' }],
        ['get', `/real-estate-companies/${company._id}/loan-requests`],
        ['get', `/real-estate-companies/${company._id}/loan-options`],
        [
          'post',
          `/real-estate-companies/${company._id}/direct-loan`,
          { productType: 'startup', amount: 100_000, durationMonths: 12 },
        ],
        ['post', `/real-estate-companies/${company._id}/property-purchase-requests`, {}],
      ];
      for (const [method, url, body] of cases) {
        const res = await request(app)
          [method](url)
          .set(authHeader(founder.token))
          .send(body || {});
        expect(res.status).toBe(403);
      }
    });

    it('a former regular member cannot manage, and a stale companyId grants nothing', async () => {
      const { company, director } = await setupCompanyWithDirector();

      const leaveRes = await request(app)
        .post(`/real-estate-companies/${company._id}/leave`)
        .set(authHeader(director.token));
      expect(leaveRes.status).toBe(200);

      let res = await request(app)
        .get(`/real-estate-companies/${company._id}/loan-requests`)
        .set(authHeader(director.token));
      expect(res.status).toBe(403);

      // simulate stale client state: the user record still points at the company
      await User.findByIdAndUpdate(director.user._id, { companyId: company._id });
      res = await request(app)
        .get(`/real-estate-companies/${company._id}/loan-requests`)
        .set(authHeader(director.token));
      expect(res.status).toBe(403);
    });

    it('former CEO who left and rejoins becomes a recruit with fresh shares, never CEO', async () => {
      const { founder, company, director, directorId } = await setupCompanyWithDirector();

      await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({ targetUserId: directorId });
      const leaveRes = await request(app)
        .post(`/real-estate-companies/${company._id}/leave`)
        .set(authHeader(founder.token));
      expect(leaveRes.status).toBe(200);

      const applyRes = await request(app)
        .post(`/real-estate-companies/${company._id}/apply`)
        .set(authHeader(founder.token))
        .send({ message: 'Please let me rejoin' });
      expect(applyRes.status).toBe(201);

      let fresh = await RealEstateCompany.findById(company._id);
      const application = fresh.applications.find(
        (a) => a.userId?.toString() === founder.user._id.toString() && a.status === 'pending',
      );
      expect(application).toBeTruthy();

      const approveRes = await request(app)
        .post(`/real-estate-companies/${company._id}/applications/${application._id}/approve`)
        .set(authHeader(director.token));
      expect(approveRes.status).toBe(200);

      fresh = await RealEstateCompany.findById(company._id);
      const rejoined = fresh.members.find((m) => m.userId?.toString() === founder.user._id.toString());
      expect(rejoined.role).toBe('recruit');
      expect(rejoined.shares).toBe(50);
      expect(fresh.shares.treasuryShares).toBe(900);
      expect(fresh.members.find((m) => m.userId?.toString() === directorId).role).toBe('ceo');
    });
  });

  describe('Founder & ownership invariants', () => {
    async function setupFounderWithDirector() {
      const founder = await createFounder();
      const { company } = await createTestCompany(founder);
      const directorData = await createAuthenticatedUser({ balance: 5_000_000, level: 10 });
      await addMemberToCompany(company._id, founder.token, directorData);
      const directorId = directorData.user._id.toString();
      const promoteRes = await request(app)
        .put(`/real-estate-companies/${company._id}/members/${directorId}/role`)
        .set(authHeader(founder.token))
        .send({ role: 'director' });
      expect(promoteRes.status).toBe(200);
      return { founder, company, director: directorData, directorId };
    }

    it('never leaves a company with two CEOs, and repairs legacy double-CEO data on transfer', async () => {
      const { founder, company, directorId } = await setupFounderWithDirector();

      // A normal transfer produces exactly one CEO
      await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({ targetUserId: directorId });
      let fresh = await RealEstateCompany.findById(company._id);
      expect(fresh.members.filter((m) => m.role === 'ceo')).toHaveLength(1);

      // Fabricate legacy data with two CEOs directly in the DB
      fresh = await RealEstateCompany.findById(company._id);
      fresh.members.find((m) => m.userId?.toString() === founder.user._id.toString()).role = 'ceo';
      await fresh.save();
      fresh = await RealEstateCompany.findById(company._id);
      expect(fresh.members.filter((m) => m.role === 'ceo')).toHaveLength(2);

      // Add a third member, promote them to an eligible role, then the founder transfers leadership to them
      const thirdData = await createAuthenticatedUser({ balance: 2_000_000, level: 10 });
      await addMemberToCompany(company._id, founder.token, thirdData);
      const thirdId = thirdData.user._id.toString();
      await request(app)
        .put(`/real-estate-companies/${company._id}/members/${thirdId}/role`)
        .set(authHeader(founder.token))
        .send({ role: 'member' });
      await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({ targetUserId: thirdId });

      fresh = await RealEstateCompany.findById(company._id);
      const ceos = fresh.members.filter((m) => m.role === 'ceo');
      expect(ceos).toHaveLength(1);
      expect(ceos[0].userId.toString()).toBe(thirdId);
      expect(fresh.members.find((m) => m.userId?.toString() === founder.user._id.toString()).role).toBe('director');
      expect(fresh.members.find((m) => m.userId?.toString() === directorId).role).toBe('director');

      const audits = await CompanyAuditLog.find({ companyId: company._id, action: 'leadership_transferred' }).sort({
        createdAt: 1,
      });
      expect(audits.length).toBe(2);
      expect(audits[audits.length - 1].details.demotedCeos).toContain(directorId);
    });

    it('keeps founderId, the single CEO, and share accounting consistent across transfer/leave/rejoin/restore', async () => {
      const { founder, company, director, directorId } = await setupFounderWithDirector();
      const founderId = founder.user._id.toString();

      const assertState = async (label, expectedCeoId, expectedFounderRole, expectedFounderShares) => {
        const fresh = await RealEstateCompany.findById(company._id);
        expect(fresh.founderId.toString(), `${label}: founderId`).toBe(founderId);
        const ceos = fresh.members.filter((m) => m.role === 'ceo');
        expect(ceos.length, `${label}: exactly one CEO`).toBe(1);
        expect(ceos[0].userId.toString(), `${label}: CEO identity`).toBe(expectedCeoId);
        const founderMember = fresh.members.find((m) => m.userId?.toString() === founderId);
        if (expectedFounderRole === null) {
          expect(founderMember, `${label}: founder is not a member`).toBeUndefined();
        } else {
          expect(founderMember.role, `${label}: founder role`).toBe(expectedFounderRole);
          expect(founderMember.shares, `${label}: founder shares`).toBe(expectedFounderShares);
        }
        const memberSum = fresh.members.reduce((s, m) => s + (m.shares || 0), 0);
        expect(memberSum + fresh.shares.treasuryShares, `${label}: share accounting`).toBe(fresh.shares.totalShares);
        return fresh;
      };

      // Initial state: founder is CEO with the original share block
      await assertState('creation', founderId, 'ceo', 700);

      // Transfer to the director -> founder becomes director, founderId unchanged
      await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(founder.token))
        .send({ targetUserId: directorId });
      await assertState('after transfer', directorId, 'director', 700);

      // Founder leaves -> founderId stays, shares return to treasury
      await request(app).post(`/real-estate-companies/${company._id}/leave`).set(authHeader(founder.token));
      await assertState('after founder leave', directorId, null, 0);

      // Founder rejoins via application -> recruit with fresh shares, no privileges
      await request(app)
        .post(`/real-estate-companies/${company._id}/apply`)
        .set(authHeader(founder.token))
        .send({ message: 'rejoin' });
      let fresh = await RealEstateCompany.findById(company._id);
      const application = fresh.applications.find((a) => a.userId?.toString() === founderId && a.status === 'pending');
      expect(application).toBeTruthy();
      await request(app)
        .post(`/real-estate-companies/${company._id}/applications/${application._id}/approve`)
        .set(authHeader(director.token));
      await assertState('after rejoin', directorId, 'recruit', 50);

      // Rejoining grants no Founder privileges until the company state explicitly restores them
      const blocked = await request(app)
        .post(`/real-estate-companies/${company._id}/loan-requests`)
        .set(authHeader(founder.token))
        .send({ amount: 100_000, loanType: 'standard' });
      expect(blocked.status).toBe(403);

      // Explicit restore by the CEO: promote the founder to director, then transfer leadership back
      await request(app)
        .put(`/real-estate-companies/${company._id}/members/${founderId}/role`)
        .set(authHeader(director.token))
        .send({ role: 'director' });
      await request(app)
        .post(`/real-estate-companies/${company._id}/leadership/transfer`)
        .set(authHeader(director.token))
        .send({ targetUserId: founderId });
      await assertState('after explicit restore', founderId, 'ceo', 50);
    });
  });

  describe('Regression: refund enum + treasury atomicity', () => {
    it('accepts "refund" as a valid treasury transaction type', async () => {
      const founder = await createFounder({ balance: 10_000_000 });
      const { company } = await createTestCompany(founder);

      company.treasury.balance = 500_000;
      company.treasury.transactions.push({
        type: 'refund',
        amount: 100_000,
        userId: founder.user._id,
        description: 'Refund for auction settlement',
      });
      await expect(company.save()).resolves.toBeTruthy();

      const fresh = await RealEstateCompany.findById(company._id);
      const refundTx = fresh.treasury.transactions.find((tx) => tx.type === 'refund');
      expect(refundTx).toBeTruthy();
      expect(refundTx.amount).toBe(100_000);
    });

    it('deposit succeeds on company with existing refund transactions', async () => {
      const founder = await createFounder({ balance: 20_000_000 });
      const { company, token } = await createTestCompany(founder);

      company.treasury.balance = 500_000;
      company.treasury.transactions.push({
        type: 'refund',
        amount: 100_000,
        userId: founder.user._id,
        description: 'Refund for auction settlement',
      });
      await company.save();

      const balanceBefore = (await User.findById(founder.user._id)).balance;
      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 200_000 });

      expect(res.status).toBe(200);
      expect(res.body.treasury.balance).toBe(700_000);

      const userAfter = await User.findById(founder.user._id);
      expect(userAfter.balance).toBe(balanceBefore - 200_000);
    });

    it('deposit rolls back user balance if company save fails', async () => {
      const founder = await createFounder({ balance: 10_000_000 });
      const { company, token } = await createTestCompany(founder);

      const balanceBefore = (await User.findById(founder.user._id)).balance;

      const originalSave = RealEstateCompany.prototype.save;
      RealEstateCompany.prototype.save = async function () {
        throw new Error('Simulated company save failure');
      };

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 50_000 });

      RealEstateCompany.prototype.save = originalSave;

      expect(res.status).toBe(500);
      const userAfter = await User.findById(founder.user._id);
      expect(userAfter.balance).toBe(balanceBefore);
    });

    it('withdraw rolls back company treasury if recipient save fails', async () => {
      const founder = await createFounder({ balance: 10_000_000 });
      const { company, token } = await createTestCompany(founder);

      await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 1_000_000 });

      const treasuryBefore = (await RealEstateCompany.findById(company._id)).treasury.balance;
      const recipient = await createAuthenticatedUser({ balance: 0 });
      await addMemberToCompany(company._id, token, recipient);

      const originalUserSave = User.prototype.save;
      User.prototype.save = async function () {
        throw new Error('Simulated recipient save failure');
      };

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/withdraw`)
        .set(authHeader(token))
        .send({ amount: 100_000, targetUserId: recipient.user._id.toString() });

      User.prototype.save = originalUserSave;

      expect(res.status).toBe(500);
      const companyAfter = await RealEstateCompany.findById(company._id);
      expect(companyAfter.treasury.balance).toBe(treasuryBefore);
    });
  });

  describe('Regression: company XP progression', () => {
    it('levels up company when XP exceeds threshold via pre-save hook', async () => {
      const { xpRequiredForNextLevel } = await import('../../config/companyProgression.js');

      const founder = await createFounder({ balance: 10_000_000 });
      const { company } = await createTestCompany(founder);

      expect(company.level).toBe(1);

      const xpNeeded = xpRequiredForNextLevel(company.level);
      company.xp = xpNeeded + 100;
      await company.save();

      const fresh = await RealEstateCompany.findById(company._id);
      expect(fresh.level).toBeGreaterThanOrEqual(2);
      expect(fresh.xp).toBe(xpNeeded + 100);
    });
  });

  describe('Regression: treasury schema validation — all transaction types', () => {
    it('accepts all 15 valid transaction types', async () => {
      const founder = await createFounder({ balance: 100_000_000 });
      const { company } = await createTestCompany(founder);

      const validTypes = [
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

      for (const type of validTypes) {
        company.treasury.transactions.push({
          type,
          amount: 1000,
          description: `Test ${type}`,
          tick: 100,
        });
      }

      await expect(company.save()).resolves.toBeTruthy();

      const fresh = await RealEstateCompany.findById(company._id);
      const savedTypes = fresh.treasury.transactions.map((tx) => tx.type);
      for (const type of validTypes) {
        expect(savedTypes).toContain(type);
      }
    });

    it('rejects an invalid transaction type', async () => {
      const founder = await createFounder({ balance: 100_000_000 });
      const { company } = await createTestCompany(founder);

      company.treasury.transactions.push({
        type: 'bogus_type',
        amount: 1000,
        description: 'Should fail',
        tick: 100,
      });

      await expect(company.save()).rejects.toThrow(/is not a valid enum value/i);
    });
  });

  describe('Regression: company with refund history can still operate', () => {
    it('accepts new deposits and levels up despite having refund transactions', async () => {
      const { xpRequiredForNextLevel } = await import('../../config/companyProgression.js');

      const founder = await createFounder({ balance: 100_000_000 });
      const { company, token } = await createTestCompany(founder);

      company.treasury.transactions.push(
        { type: 'refund', amount: 50_000, description: 'Auction refund', tick: 90 },
        { type: 'refund', amount: 25_000, description: 'Another refund', tick: 91 },
      );
      company.treasury.balance = 75_000;
      await company.save();

      const depositRes = await request(app)
        .post(`/real-estate-companies/${company._id}/treasury/deposit`)
        .set(authHeader(token))
        .send({ amount: 200_000 });

      expect(depositRes.status).toBe(200);
      expect(depositRes.body.treasury.balance).toBe(275_000);

      const xpNeeded = xpRequiredForNextLevel(company.level);
      company.xp = xpNeeded + 500;
      await company.save();

      const fresh = await RealEstateCompany.findById(company._id);
      expect(fresh.level).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Regression: repair script idempotency', () => {
    it('repair refund guard (DB-level $not/$elemMatch) cannot double-refund', async () => {
      const founder = await createFounder({ balance: 10_000_000 });
      const { company } = await createTestCompany(founder);

      company.treasury.balance = 5_000_000;
      company.treasury.transactions.push({
        type: 'property_purchase',
        amount: 1_000_000,
        description: 'Test purchase',
        tick: 50,
      });
      await company.save();

      const EXPECTED_AMOUNT = 1_404_146;
      const AUCTION_ID = 'test-auction';
      const { default: mongoose } = await import('mongoose');
      const db = mongoose.connection.db;

      const refundFilter = {
        _id: company._id,
        'treasury.transactions': {
          $not: {
            $elemMatch: {
              type: 'refund',
              amount: EXPECTED_AMOUNT,
              description: { $regex: AUCTION_ID },
            },
          },
        },
      };
      const refundOp = () =>
        db.collection('realestatecompanies').updateOne(refundFilter, {
          $inc: { 'treasury.balance': EXPECTED_AMOUNT },
          $push: {
            'treasury.transactions': {
              type: 'refund',
              amount: EXPECTED_AMOUNT,
              userId: company._id,
              description: `Refund for cancelled company-auction settlement correction (auction ${AUCTION_ID})`,
              tick: 100,
              createdAt: new Date(),
            },
          },
        });

      const first = await refundOp();
      expect(first.modifiedCount).toBe(1);

      const second = await refundOp();
      expect(second.modifiedCount).toBe(0);

      const afterFirst = await RealEstateCompany.findById(company._id);
      expect(afterFirst.treasury.balance).toBe(5_000_000 + EXPECTED_AMOUNT);

      await refundOp();

      const afterSecond = await RealEstateCompany.findById(company._id);
      expect(afterSecond.treasury.balance).toBe(5_000_000 + EXPECTED_AMOUNT);

      const refundCount = afterSecond.treasury.transactions.filter(
        (tx) => tx.type === 'refund' && tx.amount === EXPECTED_AMOUNT,
      ).length;
      expect(refundCount).toBe(1);
    });
  });

  describe('Regression: deposit/withdraw atomicity on DB failure', () => {
    it('deposit does not steal money if company save throws', async () => {
      const founder = await createFounder({ balance: 10_000_000 });
      const { company, token } = await createTestCompany(founder);

      const balanceBefore = (await User.findById(founder.user._id)).balance;
      const treasuryBefore = (await RealEstateCompany.findById(company._id)).treasury.balance;

      const origSave = RealEstateCompany.prototype.save;
      RealEstateCompany.prototype.save = async function () {
        throw new Error('Simulated save failure');
      };

      try {
        const res = await request(app)
          .post(`/real-estate-companies/${company._id}/treasury/deposit`)
          .set(authHeader(token))
          .send({ amount: 500_000 });

        expect(res.status).toBe(500);

        const userAfter = await User.findById(founder.user._id);
        expect(userAfter.balance).toBe(balanceBefore);

        const companyAfter = await RealEstateCompany.findById(company._id);
        expect(companyAfter.treasury.balance).toBe(treasuryBefore);
      } finally {
        RealEstateCompany.prototype.save = origSave;
      }
    });

    it('withdrawal does not lose money if recipient save throws', async () => {
      const founder = await createFounder({ balance: 10_000_000 });
      const { company, token } = await createTestCompany(founder);

      const member = await createAuthenticatedUser({ balance: 0, level: 1 });
      await addMemberToCompany(company._id, founder.token, member);

      company.treasury.balance = 5_000_000;
      await company.save();

      const treasuryBefore = (await RealEstateCompany.findById(company._id)).treasury.balance;

      const origUserSave = User.prototype.save;
      User.prototype.save = async function () {
        throw new Error('Simulated user save failure');
      };

      try {
        const res = await request(app)
          .post(`/real-estate-companies/${company._id}/treasury/withdraw`)
          .set(authHeader(token))
          .send({ amount: 100_000, targetUserId: member.user._id.toString() });

        expect(res.status).toBe(500);

        const companyAfter = await RealEstateCompany.findById(company._id);
        expect(companyAfter.treasury.balance).toBe(treasuryBefore);

        const userAfter = await User.findById(member.user._id);
        expect(userAfter.balance).toBe(0);
      } finally {
        User.prototype.save = origUserSave;
      }
    });
  });

  describe('Regression: property purchase atomicity', () => {
    it('rolls back treasury and user balance if property save fails after company save', async () => {
      const founder = await createFounder({ balance: 100_000_000 });
      const { company, token } = await createTestCompany(founder);

      const sellerData = await createAuthenticatedUser({ balance: 0, level: 1 });
      await addMemberToCompany(company._id, token, sellerData);
      const prop = await createTestProperty({
        ownerId: sellerData.user._id,
        currentPrice: 1_000_000,
        basePrice: 1_000_000,
        forSale: true,
      });

      company.treasury.balance = 10_000_000;
      await company.save();

      const treasuryBefore = (await RealEstateCompany.findById(company._id)).treasury.balance;
      const sellerBalanceBefore = (await User.findById(sellerData.user._id)).balance;

      const origPropSave = Property.prototype.save;
      Property.prototype.save = async function () {
        throw new Error('Simulated property save failure');
      };

      try {
        const res = await request(app)
          .post(`/real-estate-companies/${company._id}/properties/purchase`)
          .set(authHeader(token))
          .send({ propertyId: prop._id });

        expect(res.status).toBe(500);

        const companyAfter = await RealEstateCompany.findById(company._id);
        expect(companyAfter.treasury.balance).toBe(treasuryBefore);

        const sellerAfter = await User.findById(sellerData.user._id);
        expect(sellerAfter.balance).toBe(sellerBalanceBefore);

        const propAfter = await Property.findById(prop._id);
        expect(propAfter.ownerId.toString()).toBe(sellerData.user._id.toString());
      } finally {
        Property.prototype.save = origPropSave;
      }
    });

    it('rolls back treasury and XP if property save fails during sale', async () => {
      const founder = await createFounder({ balance: 100_000_000 });
      const { company, token } = await createTestCompany(founder);

      const prop = await createTestProperty({
        ownerId: founder.user._id,
        companyId: company._id,
        currentPrice: 1_000_000,
        basePrice: 1_000_000,
        forSale: false,
      });

      company.treasury.balance = 10_000_000;
      company.stats.propertiesOwned = 1;
      await company.save();

      const treasuryBefore = (await RealEstateCompany.findById(company._id)).treasury.balance;
      const xpBefore = (await RealEstateCompany.findById(company._id)).xp;

      const origPropSave = Property.prototype.save;
      Property.prototype.save = async function () {
        throw new Error('Simulated property save failure');
      };

      try {
        const res = await request(app)
          .post(`/real-estate-companies/${company._id}/properties/${prop._id}/sell`)
          .set(authHeader(token))
          .send({});

        expect(res.status).toBe(500);

        const companyAfter = await RealEstateCompany.findById(company._id);
        expect(companyAfter.treasury.balance).toBe(treasuryBefore);
        expect(companyAfter.xp).toBe(xpBefore);

        const propAfter = await Property.findById(prop._id);
        expect(propAfter.companyId.toString()).toBe(company._id.toString());
      } finally {
        Property.prototype.save = origPropSave;
      }
    });
  });

  describe('Regression: success-path business rules (unchanged behavior when all saves succeed)', () => {
    it('direct purchase success: seller paid exactly price, treasury debited, XP, stats and ownership', async () => {
      const founder = await createFounder({ balance: 100_000_000 });
      const { company, token } = await createTestCompany(founder);

      const sellerData = await createAuthenticatedUser({ balance: 0, level: 1 });
      const prop = await createTestProperty({
        ownerId: sellerData.user._id,
        currentPrice: 100_000,
        basePrice: 100_000,
        forSale: true,
      });

      company.treasury.balance = 10_000_000;
      company.stats.propertiesOwned = 0;
      company.xp = 0;
      await company.save();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/properties/purchase`)
        .set(authHeader(token))
        .send({ propertyId: prop._id });

      expect(res.status).toBe(200);

      const companyAfter = await RealEstateCompany.findById(company._id);
      expect(companyAfter.treasury.balance).toBe(9_900_000);
      expect(companyAfter.stats.propertiesOwned).toBe(1);
      expect(companyAfter.xp).toBe(50);
      expect(companyAfter.level).toBe(1);

      const sellerAfter = await User.findById(sellerData.user._id);
      expect(sellerAfter.balance).toBe(100_000);
      expect(sellerAfter.ownedProperties.some((p) => p.toString() === prop._id.toString())).toBe(false);

      const propAfter = await Property.findById(prop._id);
      expect(propAfter.ownerId).toBeFalsy();
      expect(propAfter.companyId.toString()).toBe(company._id.toString());
      expect(propAfter.forSale).toBe(false);

      const purchaseTx = companyAfter.treasury.transactions.find((tx) => tx.type === 'property_purchase');
      expect(purchaseTx).toBeTruthy();
      expect(purchaseTx.amount).toBe(100_000);
      expect(purchaseTx.userId.toString()).toBe(founder.user._id.toString());
    });

    it('sale success: proceeds credited to treasury, XP, stats and ownership cleared', async () => {
      const founder = await createFounder({ balance: 100_000_000 });
      const { company, token } = await createTestCompany(founder);

      const prop = await createTestProperty({
        ownerId: null,
        companyId: company._id,
        currentPrice: 1_000_000,
        basePrice: 1_000_000,
        forSale: false,
      });

      company.treasury.balance = 10_000_000;
      company.stats.propertiesOwned = 1;
      company.xp = 0;
      await company.save();

      const res = await request(app)
        .post(`/real-estate-companies/${company._id}/properties/${prop._id}/sell`)
        .set(authHeader(token))
        .send({});

      expect(res.status).toBe(200);

      const companyAfter = await RealEstateCompany.findById(company._id);
      expect(companyAfter.treasury.balance).toBe(11_000_000);
      expect(companyAfter.stats.propertiesOwned).toBe(0);
      expect(companyAfter.xp).toBe(300);
      expect(companyAfter.level).toBe(1);

      const propAfter = await Property.findById(prop._id);
      expect(propAfter.companyId).toBeFalsy();
      expect(propAfter.ownerId).toBeFalsy();
      expect(propAfter.forSale).toBe(true);

      const saleTx = companyAfter.treasury.transactions.find((tx) => tx.type === 'property_sale');
      expect(saleTx).toBeTruthy();
      expect(saleTx.amount).toBe(1_000_000);
      expect(saleTx.userId.toString()).toBe(founder.user._id.toString());
    });

    it('loan repayment success: partial then full repayment with exact principal/treasury math', async () => {
      const founder = await createFounder({ balance: 100_000_000 });
      const { company, token } = await createTestCompany(founder);

      const loan = await Loan.create({
        userId: founder.user._id,
        companyId: company._id,
        type: 'business',
        principal: 200_000,
        remainingBalance: 200_000,
        interestRate: 0.1,
        durationTicks: 24,
        ticksRemaining: 24,
        paymentPerTick: 10_000,
        active: true,
      });

      company.treasury.balance = 10_000_000;
      company.stats.totalLoanBalance = 200_000;
      company.xp = 0;
      await company.save();

      const partial = await request(app)
        .post(`/real-estate-companies/${company._id}/loans/${loan._id}/repay`)
        .set(authHeader(token))
        .send({ amount: 100_000 });
      expect(partial.status).toBe(200);

      let companyAfter = await RealEstateCompany.findById(company._id);
      let loanAfter = await Loan.findById(loan._id);
      expect(companyAfter.treasury.balance).toBe(9_900_000);
      expect(companyAfter.stats.totalLoanBalance).toBe(100_000);
      expect(companyAfter.xp).toBe(50);
      expect(loanAfter.remainingBalance).toBe(100_000);
      expect(loanAfter.active).toBe(true);
      expect(companyAfter.stats.loansRepaid || 0).toBe(0);

      const full = await request(app)
        .post(`/real-estate-companies/${company._id}/loans/${loan._id}/repay`)
        .set(authHeader(token))
        .send({ amount: 100_000 });
      expect(full.status).toBe(200);

      companyAfter = await RealEstateCompany.findById(company._id);
      loanAfter = await Loan.findById(loan._id);
      expect(companyAfter.treasury.balance).toBe(9_800_000);
      expect(companyAfter.stats.totalLoanBalance).toBe(0);
      expect(companyAfter.xp).toBe(100);
      expect(companyAfter.level).toBe(1);
      expect(loanAfter.remainingBalance).toBe(0);
      expect(loanAfter.active).toBe(false);
      expect(loanAfter.ticksRemaining).toBe(0);
      expect(companyAfter.stats.loansRepaid).toBe(1);

      const repayTxs = companyAfter.treasury.transactions.filter((tx) => tx.type === 'loan_payment');
      expect(repayTxs.length).toBe(2);
      expect(repayTxs[0].amount).toBe(100_000);
      expect(repayTxs[1].amount).toBe(100_000);
    });
  });
});
