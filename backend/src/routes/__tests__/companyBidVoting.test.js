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
import Notification from '../../models/Notification.js';
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
  const appSub = company.applications.find(
    (a) => a.userId?.toString() === member.user._id.toString() && a.status === 'pending',
  );
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

async function makeCompanyWithVoter(hqCityId, voterRole = 'member') {
  const founder = await createFounder();
  const company = await createCompanyAndDeposit(
    founder.token,
    hqCityId,
    `Vote_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  );
  const voter = await addMemberViaAPI(company._id, founder.token);
  if (voterRole !== 'member') {
    await promoteToRole(company._id, voter.user._id, voterRole, founder.token);
  }
  return { founder, company, voter };
}

async function createAuctionAndPropose(founder, company) {
  const property = await createTestProperty({ basePrice: 100000 });
  const auction = await Auction.create(makeAuction(property._id));
  const propRes = await request(app)
    .post(`/auctions/${auction._id}/company-bid`)
    .set(authHeader(founder.token))
    .send({ companyId: company._id, amount: 2000 });
  expect(propRes.status).toBe(201);
  return { auction, propRes, property };
}

describe('Auction bid proposal — persistence & notification metadata', () => {
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

  it('persists the proposal in company.auctionBids (regression: was stripped by strict mode)', async () => {
    const { founder, company } = await makeCompanyWithVoter(hqCityId);
    await createAuctionAndPropose(founder, company);

    const reloaded = await RealEstateCompany.findById(company._id);
    expect(reloaded.auctionBids.length).toBe(1);
    expect(reloaded.auctionBids[0].status).toBe('pending');
    expect(reloaded.auctionBids[0].amount).toBe(2000);
    expect(reloaded.auctionBids[0].requestedBy.toString()).toBe(founder.user._id.toString());
    expect(reloaded.auctionBids[0].createdTick).toBe(100);
  });

  it('returns proposalId in the propose response', async () => {
    const { founder, company } = await makeCompanyWithVoter(hqCityId);
    const { propRes } = await createAuctionAndPropose(founder, company);
    expect(propRes.body.proposalId).toBeTruthy();
    expect(mongoose.Types.ObjectId.isValid(propRes.body.proposalId)).toBe(true);
  });

  it('sends notifications to ALL other members with proposalId, tab=auctions, auctionId', async () => {
    const { founder, company, voter } = await makeCompanyWithVoter(hqCityId);
    const { auction } = await createAuctionAndPropose(founder, company);

    const notif = await Notification.findOne({
      userId: voter.user._id,
      eventKey: `auction:${auction._id}:company_bid_vote:${voter.user._id}`,
    });
    expect(notif).toBeTruthy();
    expect(notif.tab).toBe('auctions');
    expect(notif.route).toBe(`/real-estate-companies/${company._id}`);
    expect(notif.proposalId.toString()).toBeTruthy();
    expect(notif.auctionId.toString()).toBe(auction._id.toString());

    const founderNotif = await Notification.findOne({
      userId: founder.user._id,
      eventKey: `auction:${auction._id}:company_bid_vote:${founder.user._id}`,
    });
    expect(founderNotif).toBeFalsy();
  });

  it('does not notify the proposer about their own proposal', async () => {
    const { founder, company } = await makeCompanyWithVoter(hqCityId);
    const { auction } = await createAuctionAndPropose(founder, company);

    const proposerNotif = await Notification.find({
      userId: founder.user._id,
      eventKey: { $regex: `^auction:${auction._id}:company_bid_vote` },
    });
    expect(proposerNotif.length).toBe(0);
  });
});

describe('Auction bid proposal — retrieval endpoint', () => {
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

  it('returns auction bids to a company member', async () => {
    const { founder, company, voter } = await makeCompanyWithVoter(hqCityId);
    await createAuctionAndPropose(founder, company);

    const res = await request(app)
      .get(`/real-estate-companies/${company._id}/auction-bids`)
      .set(authHeader(voter.token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].amount).toBe(2000);
  });

  it('rejects non-members from reading auction bids', async () => {
    const { founder, company } = await makeCompanyWithVoter(hqCityId);
    await createAuctionAndPropose(founder, company);
    const stranger = await createAuthenticatedUser({ balance: 10_000_000 });

    const res = await request(app)
      .get(`/real-estate-companies/${company._id}/auction-bids`)
      .set(authHeader(stranger.token));

    expect(res.status).toBe(403);
  });
});

describe('Auction bid proposal — voting authorization', () => {
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

  it('eligible member can vote on a proposal', async () => {
    const { founder, company, voter } = await makeCompanyWithVoter(hqCityId);
    const { auction, propRes } = await createAuctionAndPropose(founder, company);

    const voteRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(voter.token))
      .send({ vote: 'yes' });

    expect(voteRes.status).toBe(200);
    expect(voteRes.body.success).toBe(true);
    expect(voteRes.body.vote).toBe('yes');
  });

  it('non-member cannot vote', async () => {
    const { founder, company } = await makeCompanyWithVoter(hqCityId);
    const { auction, propRes } = await createAuctionAndPropose(founder, company);
    const stranger = await createAuthenticatedUser({ balance: 10_000_000 });

    const voteRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(stranger.token))
      .send({ vote: 'yes' });

    expect(voteRes.status).toBe(403);
    expect(voteRes.body.error).toBe('Not a company member');
  });

  it('member from another company cannot vote', async () => {
    const { founder, company } = await makeCompanyWithVoter(hqCityId);
    const { auction, propRes } = await createAuctionAndPropose(founder, company);

    const otherFounder = await createFounder();
    const otherCompany = await createCompanyAndDeposit(otherFounder.token, hqCityId, 'OtherVoteCompany');
    const otherMember = await addMemberViaAPI(otherCompany._id, otherFounder.token);

    const voteRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(otherMember.token))
      .send({ vote: 'yes' });

    expect(voteRes.status).toBe(403);
    expect(voteRes.body.error).toBe('Not a company member');
  });

  it('proposer cannot vote on their own proposal', async () => {
    const { founder, company } = await makeCompanyWithVoter(hqCityId);
    const { auction, propRes } = await createAuctionAndPropose(founder, company);

    const voteRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(founder.token))
      .send({ vote: 'yes' });

    expect(voteRes.status).toBe(400);
    expect(voteRes.body.error).toBe('Cannot vote on your own proposal');
  });

  it('member cannot vote twice', async () => {
    const { founder, company, voter } = await makeCompanyWithVoter(hqCityId);
    // Add a second voter so a single vote does not resolve the proposal
    await addMemberViaAPI(company._id, founder.token);
    const { auction, propRes } = await createAuctionAndPropose(founder, company);

    const first = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(voter.token))
      .send({ vote: 'no' });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('pending');

    const second = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(voter.token))
      .send({ vote: 'yes' });

    expect(second.status).toBe(400);
    expect(second.body.error).toBe('Already voted');
  });

  it('cannot vote on an invalid proposal id', async () => {
    const { founder, company, voter } = await makeCompanyWithVoter(hqCityId);
    const { auction } = await createAuctionAndPropose(founder, company);
    const fakeId = new mongoose.Types.ObjectId();

    const voteRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${fakeId}/vote`)
      .set(authHeader(voter.token))
      .send({ vote: 'yes' });

    expect(voteRes.status).toBe(404);
    expect(voteRes.body.error).toBe('Company not found');
  });
});

describe('Auction bid proposal — threshold, resolution & accounting', () => {
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

  it('approves when yes votes reach the threshold and executes the bid + debits treasury', async () => {
    const { founder, company, voter } = await makeCompanyWithVoter(hqCityId);
    await addMemberViaAPI(company._id, founder.token);
    const { auction, propRes } = await createAuctionAndPropose(founder, company);

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;

    // totalVoters = 3 - 1 = 2, threshold = ceil(2/2) = 1
    const voteRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(voter.token))
      .send({ vote: 'yes' });

    expect(voteRes.status).toBe(200);
    expect(voteRes.body.status).toBe('approved');

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.auctionBids[0].status).toBe('approved');
    expect(updated.auctionBids[0].executedBy.toString()).toBe(voter.user._id.toString());

    // Treasury debited only when the bid executes
    expect(updated.treasury.balance).toBe(beforeBalance - 2000);

    const auctionUpdated = await Auction.findById(auction._id);
    expect(auctionUpdated.currentBid).toBe(2000);
  });

  it('rejects when all voters vote no', async () => {
    const { founder, company, voter } = await makeCompanyWithVoter(hqCityId);
    const secondVoter = await addMemberViaAPI(company._id, founder.token);
    const { auction, propRes } = await createAuctionAndPropose(founder, company);

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;

    // totalVoters = 2, threshold = 1. One 'no' + one 'no' -> votesInFavor(0) < 1, all voted -> rejected
    await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(voter.token))
      .send({ vote: 'no' });
    const voteRes2 = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(secondVoter.token))
      .send({ vote: 'no' });

    expect(voteRes2.status).toBe(200);
    expect(voteRes2.body.status).toBe('rejected');

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.auctionBids[0].status).toBe('rejected');
    expect(updated.treasury.balance).toBe(beforeBalance);

    const auctionUpdated = await Auction.findById(auction._id);
    expect(auctionUpdated.currentBid).toBe(0);
  });

  it('treasury/share data is unchanged by a pending (non-deciding) vote', async () => {
    const { founder, company, voter } = await makeCompanyWithVoter(hqCityId);
    await addMemberViaAPI(company._id, founder.token);
    await addMemberViaAPI(company._id, founder.token);
    const { auction, propRes } = await createAuctionAndPropose(founder, company);

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;
    const beforeShares = before.shares.totalShares;

    // totalVoters = 4 - 1 = 3, threshold = 2. One 'no' does not decide.
    const voteRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(voter.token))
      .send({ vote: 'no' });

    expect(voteRes.status).toBe(200);
    expect(voteRes.body.status).toBe('pending');

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.treasury.balance).toBe(beforeBalance);
    expect(updated.shares.totalShares).toBe(beforeShares);
    expect(updated.auctionBids[0].status).toBe('pending');
  });

  it('cannot vote on an expired proposal', async () => {
    const { founder, company, voter } = await makeCompanyWithVoter(hqCityId);
    const { auction, propRes } = await createAuctionAndPropose(founder, company);

    await RealEstateCompany.updateOne(
      { _id: company._id, 'auctionBids._id': propRes.body.proposalId },
      { $set: { 'auctionBids.$.status': 'expired' } },
    );

    const voteRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${propRes.body.proposalId}/vote`)
      .set(authHeader(voter.token))
      .send({ vote: 'yes' });

    expect(voteRes.status).toBe(400);
    expect(voteRes.body.error).toBe('Bid proposal has expired');
  });
});

describe('Auction bid proposal — role-based proposal creation', () => {
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

  it('Director can propose a company bid', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'DirectorPropose');
    const director = await addMemberViaAPI(company._id, founder.token);
    await promoteToRole(company._id, director.user._id, 'director', founder.token);

    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(director.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(201);
  });

  it('officer cannot propose (no initiate_investments)', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'OfficerPropose');
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
