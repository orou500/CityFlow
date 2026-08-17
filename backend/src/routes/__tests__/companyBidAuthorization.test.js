import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../test/createApp.js';
import {
  createAuthenticatedUser,
  createTestProperty,
  createTestCity,
  authHeader,
  setTestTick,
} from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import Auction from '../../models/Auction.js';
import User from '../../models/User.js';
import { cacheDelPattern } from '../../utils/cache.js';

const app = createApp();

async function createFounder(overrides = {}) {
  const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const user = await createAuthenticatedUser({
    balance: 200_000_000,
    level: 30,
    createdAt,
    ...overrides,
  });
  await createTestProperty({
    ownerId: user.user._id,
    currentPrice: 5_000_000,
    basePrice: 5_000_000,
  });
  return user;
}

async function createCompanyAndDeposit(founderToken, hqCityId, name, depositAmount = 10_000_000) {
  const createRes = await request(app)
    .post('/real-estate-companies')
    .set(authHeader(founderToken))
    .send({
      name: name || `BidTest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description: 'Test',
      hqCityId,
    });
  expect(createRes.status).toBe(201);
  const company = createRes.body;

  if (depositAmount > 0) {
    const depRes = await request(app)
      .post(`/real-estate-companies/${company._id}/treasury/deposit`)
      .set(authHeader(founderToken))
      .send({ amount: depositAmount });
    expect(depRes.status).toBe(200);
  }

  return company;
}

async function addMemberViaAPI(companyId, founderToken) {
  const member = await createAuthenticatedUser({ balance: 10_000_000, level: 15 });
  await request(app)
    .post(`/real-estate-companies/${companyId}/apply`)
    .set(authHeader(member.token))
    .send({ message: 'I want to join' });
  const company = await RealEstateCompany.findById(companyId);
  if (!company) throw new Error(`Company ${companyId} not found in addMemberViaAPI`);
  const appSub = company.applications.find(
    (a) => a.userId?.toString() === member.user._id.toString() && a.status === 'pending',
  );
  if (!appSub) throw new Error(`No pending application for ${member.user._id} in company ${companyId}`);
  await request(app)
    .post(`/real-estate-companies/${companyId}/applications/${appSub._id}/approve`)
    .set(authHeader(founderToken))
    .send({});
  return member;
}

async function promoteToRole(companyId, targetUserId, role, promoterToken) {
  await request(app)
    .put(`/real-estate-companies/${companyId}/members/${targetUserId}/role`)
    .set(authHeader(promoterToken))
    .send({ role });
}

function makeAuction(propertyId, overrides = {}) {
  return {
    propertyId,
    sellerId: null,
    sellerType: 'bank',
    auctionType: 'standard',
    startingBid: 1000,
    bidIncrement: 100,
    startTick: 100,
    endTick: 200,
    originalEndTick: 200,
    status: 'active',
    ...overrides,
  };
}

describe('GET /real-estate-companies/my — response format', () => {
  it('returns a raw array (not { companies: [...] })', async () => {
    const founder = await createFounder();
    const city = await createTestCity();
    const company = await createCompanyAndDeposit(founder.token, city._id, 'FormatCheck');

    const res = await request(app).get('/real-estate-companies/my').set(authHeader(founder.token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].name).toBe('FormatCheck');
  });

  it('returns empty array for a user with no company', async () => {
    const loner = await createAuthenticatedUser({ balance: 1000 });

    const res = await request(app).get('/real-estate-companies/my').set(authHeader(loner.token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });
});

describe('Company Bid Authorization — role-based access', () => {
  let hqCityId;

  beforeEach(async () => {
    await setTestTick(100);
    const city = await createTestCity();
    hqCityId = city._id;
  });

  afterEach(async () => {
    delete global.currentTick;
    await cacheDelPattern('cf:auction*');
  });

  it('CEO can propose a company bid', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'CeoBid');
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(founder.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('Director can propose a company bid (this was the reported bug)', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'DirectorBid');
    const director = await addMemberViaAPI(company._id, founder.token);
    await promoteToRole(company._id, director.user._id, 'director', founder.token);

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(director.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('regular member is rejected (no initiate_investments permission)', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'MemberBid');
    const member = await addMemberViaAPI(company._id, founder.token);

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(member.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('non-member is rejected with "Not a company member"', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'NonMemberBid');
    const stranger = await createAuthenticatedUser({ balance: 10_000_000 });

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(stranger.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not a company member');
  });

  it('member of Company A cannot bid using Company B', async () => {
    const founderA = await createFounder();
    const founderB = await createFounder();
    const companyA = await createCompanyAndDeposit(founderA.token, hqCityId, 'CompanyABid');
    const companyB = await createCompanyAndDeposit(founderB.token, hqCityId, 'CompanyBBid');

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const member = await addMemberViaAPI(companyA._id, founderA.token);
    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(member.token))
      .send({ companyId: companyB._id, amount: 1000 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not a company member');
  });

  it('user with stale companyId on User doc cannot access wrong company', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'StaleCompany');

    const otherFounder = await createFounder();
    const otherCompany = await createCompanyAndDeposit(otherFounder.token, hqCityId, 'OtherCompany');

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const stranger = await createAuthenticatedUser({ balance: 10_000_000 });
    await User.findByIdAndUpdate(stranger.user._id, { companyId: otherCompany._id });

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(stranger.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not a company member');
  });

  it('company bid does not modify founderId', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'FounderIdCheck');
    const originalFounderId = company.founderId._id;

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(founder.token))
      .send({ companyId: company._id, amount: 1000 });

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.founderId.toString()).toBe(originalFounderId.toString());
  });

  it('exactly one CEO remains after a company bid', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'OneCeoCheck');

    const member1 = await addMemberViaAPI(company._id, founder.token);
    const member2 = await addMemberViaAPI(company._id, founder.token);
    await promoteToRole(company._id, member1.user._id, 'director', founder.token);

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(founder.token))
      .send({ companyId: company._id, amount: 1000 });

    const updated = await RealEstateCompany.findById(company._id);
    const ceoCount = updated.members.filter((m) => m.role === 'ceo').length;
    expect(ceoCount).toBe(1);
  });

  it('company treasury is debited correctly on executed bid', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'TreasuryCheck');
    const director = await addMemberViaAPI(company._id, founder.token);
    await promoteToRole(company._id, director.user._id, 'director', founder.token);

    const beforeCompany = await RealEstateCompany.findById(company._id);
    const initialBalance = beforeCompany.treasury.balance;

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const bidRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(director.token))
      .send({ companyId: company._id, amount: 5000 });

    expect(bidRes.status).toBe(201);

    const afterCompany = await RealEstateCompany.findById(company._id);
    expect(afterCompany.treasury.balance).toBe(initialBalance);
  });

  it('GET /real-estate-companies/my shows all roles', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'AllRoles');

    const member1 = await addMemberViaAPI(company._id, founder.token);
    const member2 = await addMemberViaAPI(company._id, founder.token);
    const member3 = await addMemberViaAPI(company._id, founder.token);
    const member4 = await addMemberViaAPI(company._id, founder.token);

    await promoteToRole(company._id, member1.user._id, 'director', founder.token);
    await promoteToRole(company._id, member2.user._id, 'officer', founder.token);
    await promoteToRole(company._id, member3.user._id, 'member', founder.token);

    for (const m of [founder, member1, member2, member3, member4]) {
      const res = await request(app).get('/real-estate-companies/my').set(authHeader(m.token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]._id.toString()).toBe(company._id.toString());
    }
  });
});

describe('Company Bid Authorization — hasPermission correctness', () => {
  let hqCityId;

  beforeEach(async () => {
    await setTestTick(100);
    const city = await createTestCity();
    hqCityId = city._id;
  });

  afterEach(async () => {
    delete global.currentTick;
    await cacheDelPattern('cf:auction*');
  });

  it('hasPermission is called with member object, not member.role string', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'PermCheck');
    const director = await addMemberViaAPI(company._id, founder.token);
    await promoteToRole(company._id, director.user._id, 'director', founder.token);

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(director.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('officer is rejected for initiate_investments (not in officer permissions)', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'OfficerPerm');
    const officer = await addMemberViaAPI(company._id, founder.token);
    await promoteToRole(company._id, officer.user._id, 'officer', founder.token);

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(officer.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });
});

describe('Company Bid — edge cases', () => {
  let hqCityId;

  beforeEach(async () => {
    await setTestTick(100);
    const city = await createTestCity();
    hqCityId = city._id;
  });

  afterEach(async () => {
    delete global.currentTick;
    await cacheDelPattern('cf:auction*');
  });

  it('rejects bid on non-existent company', async () => {
    const founder = await createFounder();
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(founder.token))
      .send({ companyId: fakeId, amount: 1000 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Company not found');
  });

  it('rejects bid on non-active auction', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'EndedAuction');
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id, { status: 'ended', endTick: 90 }));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(founder.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Auction is not active');
  });

  it('rejects bid below minimum', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'MinBid');
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id, { startingBid: 5000 }));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(founder.token))
      .send({ companyId: company._id, amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Minimum bid/);
  });

  it('rejects bid exceeding treasury balance', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'PoorTreasury');
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(founder.token))
      .send({ companyId: company._id, amount: 999_999_999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Insufficient company treasury');
  });
});
