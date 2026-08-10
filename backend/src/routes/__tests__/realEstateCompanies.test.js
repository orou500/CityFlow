import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, createTestCity, authHeader } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import GameState from '../../models/GameState.js';
import Property from '../../models/Property.js';
import Notification from '../../models/Notification.js';
import ConstructionProject from '../../models/ConstructionProject.js';
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
      expect(res.body.error).toMatch(/Level 15/);
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

    it('rejects IPO when company level too low', async () => {
      const founder = await createFounder({ balance: 200_000_000, level: 30 });
      const { company, token } = await createTestCompany(founder);
      company.level = 10;
      await company.save();

      const res = await request(app).post(`/real-estate-companies/${company._id}/ipo`).set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Level 15');
    });

    it('rejects IPO when not enough members', async () => {
      const founder = await createFounder({ balance: 200_000_000, level: 30 });
      const { company, token } = await createTestCompany(founder);
      company.level = 15;
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
  });
});
