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
import Property from '../../models/Property.js';
import { cacheDelPattern } from '../../utils/cache.js';
import { processAuctions } from '../../engine/auctionProcessing.js';
import { recoverAuctionBidProposal } from '../../engine/auctionBidProposals.js';
import { AUCTION_CONFIG } from '../../config/auctions.js';

const app = createApp();
const STALE_MS = AUCTION_CONFIG.companyBid.resolutionStaleMs;

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
      name: name || `Settle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description: 'Test',
      hqCityId,
    });
  expect(createRes.status).toBe(201);
  const company = createRes.body;
  if (depositAmount > 0) {
    await request(app)
      .post(`/real-estate-companies/${company._id}/treasury/deposit`)
      .set(authHeader(founderToken))
      .send({ amount: depositAmount });
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

async function makeCompanyAuction(hqCityId, memberCount = 2, bidAmount = 2000, endTick = 200) {
  const founder = await createFounder();
  const company = await createCompanyAndDeposit(
    founder.token,
    hqCityId,
    `Settle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  );
  const members = [];
  for (let i = 0; i < memberCount; i++) {
    members.push(await addMemberViaAPI(company._id, founder.token));
  }
  const property = await createTestProperty({ basePrice: 100000 });
  const auction = await Auction.create({
    propertyId: property._id,
    sellerId: null,
    sellerType: 'bank',
    auctionType: 'standard',
    startingBid: 1000,
    bidIncrement: 100,
    startTick: 100,
    endTick,
    originalEndTick: endTick,
    status: 'active',
  });
  const propRes = await request(app)
    .post(`/auctions/${auction._id}/company-bid`)
    .set(authHeader(founder.token))
    .send({ companyId: company._id, amount: bidAmount });
  expect(propRes.status).toBe(201);
  return { founder, company, members, property, auction, proposalId: propRes.body.proposalId };
}

async function settle(auction) {
  // advance ticks so processAuctions runs active -> ending -> ended (settlement)
  const endTick = auction.endTick;
  await setTestTick(endTick);
  await processAuctions();
  await setTestTick(endTick + 1);
  await processAuctions();
  await setTestTick(endTick + 2);
  await processAuctions();
}

describe('Company auction bid attribution + settlement (regression)', () => {
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

  it('final voter is NOT the auction bidder — the COMPANY is', async () => {
    const { company, members, auction, proposalId } = await makeCompanyAuction(hqCityId, 2);

    // Voter casts the final YES -> proposal approved -> company bid placed
    const voteRes = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${proposalId}/vote`)
      .set(authHeader(members[0].token))
      .send({ vote: 'yes' });
    expect(voteRes.status).toBe(200);
    expect(voteRes.body.status).toBe('approved');

    const auctionUpdated = await Auction.findById(auction._id);
    expect(auctionUpdated.bids.length).toBe(1);
    const bid = auctionUpdated.bids[0];
    expect(bid.username).toBe(`${company.name} (Company)`);
    // THE KEY ASSERTION: the voter must NOT be the bidder; the company is.
    expect(bid.bidderId.toString()).toBe(company._id.toString());
    expect(bid.bidderId.toString()).not.toBe(members[0].user._id.toString());
    expect(auctionUpdated.currentBidderId.toString()).toBe(company._id.toString());
  });

  it('company proposal approval does NOT create a private bid for the voter', async () => {
    const { members, auction, proposalId } = await makeCompanyAuction(hqCityId, 2);
    await request(app)
      .post(`/auctions/${auction._id}/company-bid/${proposalId}/vote`)
      .set(authHeader(members[0].token))
      .send({ vote: 'yes' });

    const auctionUpdated = await Auction.findById(auction._id);
    const voterPersonalBids = auctionUpdated.bids.filter(
      (b) => b.bidderId.toString() === members[0].user._id.toString(),
    );
    expect(voterPersonalBids.length).toBe(0);
  });

  it('multiple company voters do not affect bidder identity', async () => {
    const { company, members, auction, proposalId } = await makeCompanyAuction(hqCityId, 3);
    // Two members vote YES (threshold = ceil(3/2) = 2 for 4 members total).
    await request(app)
      .post(`/auctions/${auction._id}/company-bid/${proposalId}/vote`)
      .set(authHeader(members[0].token))
      .send({ vote: 'yes' });
    const res2 = await request(app)
      .post(`/auctions/${auction._id}/company-bid/${proposalId}/vote`)
      .set(authHeader(members[1].token))
      .send({ vote: 'yes' });
    expect(res2.body.status).toBe('approved');

    const auctionUpdated = await Auction.findById(auction._id);
    expect(auctionUpdated.bids.length).toBe(1);
    expect(auctionUpdated.bids[0].bidderId.toString()).toBe(company._id.toString());
  });

  it('auctionBidProposalId correctly links the company bid to the proposal', async () => {
    const { members, auction, proposalId } = await makeCompanyAuction(hqCityId, 2);
    await request(app)
      .post(`/auctions/${auction._id}/company-bid/${proposalId}/vote`)
      .set(authHeader(members[0].token))
      .send({ vote: 'yes' });

    const auctionUpdated = await Auction.findById(auction._id);
    expect(auctionUpdated.bids[0].auctionBidProposalId.toString()).toBe(proposalId.toString());
  });

  it('company bid -> COMPANY is the winner at settlement (property to company, no personal charge)', async () => {
    const { company, members, property, auction, proposalId } = await makeCompanyAuction(hqCityId, 2, 2000, 110);

    await request(app)
      .post(`/auctions/${auction._id}/company-bid/${proposalId}/vote`)
      .set(authHeader(members[0].token))
      .send({ vote: 'yes' });

    const voterBalanceBefore = members[0].user.balance;
    const companyBefore = await RealEstateCompany.findById(company._id);
    const propsBefore = companyBefore.stats.propertiesOwned || 0;

    await settle(auction);

    const settled = await Auction.findById(auction._id);
    expect(settled.status).toBe('ended');
    expect(settled.winnerId.toString()).toBe(company._id.toString());
    expect(settled.winningBid).toBe(2000);

    const propertyAfter = await Property.findById(property._id);
    expect(propertyAfter.ownerId).toBe(null);
    expect(propertyAfter.companyId.toString()).toBe(company._id.toString());

    // No personal charge/ownership for the voter.
    const voterAfter = members[0].user;
    expect(voterAfter.balance).toBe(voterBalanceBefore);

    const companyAfter = await RealEstateCompany.findById(company._id);
    expect(companyAfter.stats.propertiesOwned).toBe(propsBefore + 1);
    // The company treasury was charged at bid time (not again at settlement).
    expect(companyAfter.treasury.balance).toBe(companyBefore.treasury.balance);
  });

  it('legacy company bid (bidderId still a voter but auctionBidProposalId set) settles to the COMPANY', async () => {
    // Simulates a pre-fix company bid where the persisted bidderId is the voter,
    // but the bid carries auctionBidProposalId and auction.companyId is set —
    // exactly the state of an active production auction. Settlement must still
    // attribute the win to the COMPANY, never the voter.
    const { company, members } = await makeCompanyAuction(hqCityId, 2, 2000, 110);
    // Discard the auction created by the helper (we rebuild it in the legacy shape).
    const property2 = await createTestProperty({ basePrice: 100000 });
    const legacyAuction = await Auction.create({
      propertyId: property2._id,
      sellerId: null,
      sellerType: 'bank',
      auctionType: 'standard',
      startingBid: 1000,
      currentBid: 2000,
      currentBidderId: members[0].user._id, // legacy: voter stored as bidder
      bidIncrement: 100,
      status: 'active',
      startTick: 100,
      endTick: 110,
      originalEndTick: 110,
      totalBids: 1,
      companyId: company._id,
      bids: [
        {
          bidderId: members[0].user._id, // legacy mis-attribution
          amount: 2000,
          tick: 100,
          username: `${company.name} (Company)`,
          auctionBidProposalId: new mongoose.Types.ObjectId(),
        },
      ],
      activity: [],
      watchers: [],
    });

    const voterBalanceBefore = members[0].user.balance;

    await settle(legacyAuction);

    const settled = await Auction.findById(legacyAuction._id);
    expect(settled.status).toBe('ended');
    expect(settled.winnerId.toString()).toBe(company._id.toString());

    const propertyAfter = await Property.findById(property2._id);
    expect(propertyAfter.ownerId).toBe(null);
    expect(propertyAfter.companyId.toString()).toBe(company._id.toString());

    expect(members[0].user.balance).toBe(voterBalanceBefore);
  });

  it('private user bid -> USER is the winner at settlement (unchanged behavior)', async () => {
    const bidder = await createAuthenticatedUser({ balance: 1_000_000 });
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create({
      propertyId: property._id,
      sellerId: null,
      sellerType: 'bank',
      auctionType: 'standard',
      startingBid: 1000,
      bidIncrement: 100,
      startTick: 100,
      endTick: 110,
      originalEndTick: 110,
      status: 'active',
    });

    const bidRes = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set(authHeader(bidder.token))
      .send({ amount: 5000 });
    expect(bidRes.status).toBe(200);

    await settle(auction);

    const settled = await Auction.findById(auction._id);
    expect(settled.status).toBe('ended');
    expect(settled.winnerId.toString()).toBe(bidder.user._id.toString());

    const propertyAfter = await Property.findById(property._id);
    expect(propertyAfter.ownerId.toString()).toBe(bidder.user._id.toString());
  });

  it('recovery/retry does NOT change the company bidder identity', async () => {
    const { company, members, auction, proposalId } = await makeCompanyAuction(hqCityId, 2, 2000, 110);
    await request(app)
      .post(`/auctions/${auction._id}/company-bid/${proposalId}/vote`)
      .set(authHeader(members[0].token))
      .send({ vote: 'yes' });

    const before = await Auction.findById(auction._id);
    expect(before.bids[0].bidderId.toString()).toBe(company._id.toString());

    // Simulate a worker crash AFTER the bid was executed (proposal stuck in
    // resolving, stale) then recover — recovery must not re-create or re-bid.
    await RealEstateCompany.updateOne(
      { _id: company._id, 'auctionBids._id': proposalId },
      {
        $set: {
          'auctionBids.$.status': 'resolving',
          'auctionBids.$.resolvingAt': new Date(Date.now() - STALE_MS - 60_000),
        },
      },
    );
    const result = await recoverAuctionBidProposal(company._id, proposalId);
    expect(result.recovered).toBe(true);

    const after = await Auction.findById(auction._id);
    expect(after.bids.length).toBe(1);
    expect(after.bids[0].bidderId.toString()).toBe(company._id.toString());
    expect(after.bids[0].auctionBidProposalId.toString()).toBe(proposalId.toString());
    expect(after.currentBidderId.toString()).toBe(company._id.toString());
  });
});
