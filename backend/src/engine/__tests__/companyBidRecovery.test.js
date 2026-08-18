import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
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
import { cacheDelPattern } from '../../utils/cache.js';
import { AUCTION_CONFIG } from '../../config/auctions.js';
import {
  recoverAuctionBidProposal,
  recoverStaleAuctionBidProposals,
  resolveAuctionBidProposal,
} from '../../engine/auctionBidProposals.js';

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
      name: name || `Recovery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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

async function makeProposal(hqCityId, memberCount = 3) {
  const founder = await createFounder();
  const company = await createCompanyAndDeposit(
    founder.token,
    hqCityId,
    `Recovery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
    endTick: 200,
    originalEndTick: 200,
    status: 'active',
  });
  const propRes = await request(app)
    .post(`/auctions/${auction._id}/company-bid`)
    .set(authHeader(founder.token))
    .send({ companyId: company._id, amount: 2000 });
  expect(propRes.status).toBe(201);
  return { founder, company, members, auction, proposalId: propRes.body.proposalId };
}

async function forceResolving(companyId, proposalId, resolvingAt = new Date(Date.now() - STALE_MS - 60_000)) {
  // Simulates the deadline job claiming the proposal (voting deadline already
  // passed) then the worker crashing mid-resolution.
  await RealEstateCompany.updateOne(
    { _id: companyId, 'auctionBids._id': proposalId },
    {
      $set: {
        'auctionBids.$.status': 'resolving',
        'auctionBids.$.resolvingAt': resolvingAt,
        'auctionBids.$.votingEndsAt': new Date(Date.now() - 1000),
      },
    },
  );
}

async function executeBidManually(companyId, proposalId, auction, amount) {
  // Simulate a crashed worker that already pushed the auction bid AND charged
  // the treasury (proposal.executedAt is persisted in the same company save).
  const company = await RealEstateCompany.findById(companyId);
  const proposal = company.auctionBids.id(proposalId);
  proposal.status = 'resolving';
  proposal.resolvingAt = new Date(Date.now() - STALE_MS - 60_000);
  proposal.executedBy = proposal.requestedBy;
  proposal.executedAt = new Date();
  company.treasury.balance -= amount;
  company.treasury.transactions.push({
    type: 'withdrawal',
    amount,
    description: 'Auction bid on property',
    performedBy: proposal.requestedBy,
  });
  await company.save();

  auction.bids.push({
    bidderId: proposal.requestedBy,
    amount,
    tick: 100,
    username: `${company.name} (Company)`,
    auctionBidProposalId: proposalId,
  });
  auction.currentBid = amount;
  auction.currentBidderId = proposal.requestedBy;
  auction.totalBids += 1;
  auction.companyId = companyId;
  auction.uniqueBidders = 1;
  await auction.save();
}

describe('Auction bid proposal — stale resolution recovery', () => {
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

  it('normal resolution claims pending -> resolving (stamps resolvingAt) and finishes', async () => {
    const { company, proposalId } = await makeProposal(hqCityId, 1);
    // Directly resolve via the atomic path (no API vote) — missing votes = YES.
    const result = await resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true });
    expect(result.claimed).toBe(true);
    expect(result.outcome).toBe('approved');

    const updated = await RealEstateCompany.findById(company._id);
    const proposal = updated.auctionBids.id(proposalId);
    expect(proposal.status).toBe('approved');
    expect(proposal.resolvedAt).toBeTruthy();
    expect(proposal.resolution.yes).toBeGreaterThanOrEqual(1);
  });

  it('worker crash after claim (not executed) -> recovery executes the bid exactly once', async () => {
    const { company, proposalId, auction } = await makeProposal(hqCityId, 3);
    await forceResolving(company._id, proposalId);

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;

    const result = await recoverAuctionBidProposal(company._id, proposalId);

    expect(result.recovered).toBe(true);
    expect(result.outcome).toBe('approved');

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.auctionBids.id(proposalId).status).toBe('approved');
    expect(updated.treasury.balance).toBe(beforeBalance - 2000);

    const auctionUpdated = await Auction.findById(auction._id);
    const companyBids = auctionUpdated.bids.filter((b) => b.username === `${updated.name} (Company)`);
    expect(companyBids.length).toBe(1);
    expect(companyBids[0].auctionBidProposalId.toString()).toBe(proposalId.toString());
  });

  it('already-executed proposal is recovered WITHOUT a duplicate bid or double charge', async () => {
    const { company, proposalId, auction } = await makeProposal(hqCityId, 3);
    await executeBidManually(company._id, proposalId, auction, 2000);

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;
    const beforeBids = auction.bids.length;

    const result = await recoverAuctionBidProposal(company._id, proposalId);

    expect(result.recovered).toBe(true);
    expect(result.outcome).toBe('approved');
    expect(result.reason).toBe('recovered_already_executed');

    const auctionUpdated = await Auction.findById(auction._id);
    expect(auctionUpdated.bids.length).toBe(beforeBids);
    const companyBids = auctionUpdated.bids.filter((b) => b.username === `${company.name} (Company)`);
    expect(companyBids.length).toBe(1);

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.treasury.balance).toBe(beforeBalance);
    const withdrawals = updated.treasury.transactions.filter((t) => t.type === 'withdrawal');
    expect(withdrawals.length).toBe(1);
  });

  it('company charged but auction bid missing -> recovery completes the auction side once', async () => {
    const { company, proposalId, auction } = await makeProposal(hqCityId, 3);

    // Simulate company side saved (treasury debited + executedAt) but auction
    // save failed (no bid on the auction).
    const co = await RealEstateCompany.findById(company._id);
    const p = co.auctionBids.id(proposalId);
    p.status = 'resolving';
    p.resolvingAt = new Date(Date.now() - STALE_MS - 60_000);
    p.executedBy = p.requestedBy;
    p.executedAt = new Date();
    co.treasury.balance -= 2000;
    co.treasury.transactions.push({
      type: 'withdrawal',
      amount: 2000,
      description: 'Auction bid on property',
      performedBy: p.requestedBy,
    });
    await co.save();

    const result = await recoverAuctionBidProposal(company._id, proposalId);

    expect(result.recovered).toBe(true);
    expect(result.outcome).toBe('approved');
    expect(result.reason).toBe('recovered_auction_side');

    const auctionUpdated = await Auction.findById(auction._id);
    const companyBids = auctionUpdated.bids.filter((b) => b.username === `${company.name} (Company)`);
    expect(companyBids.length).toBe(1);
    expect(companyBids[0].auctionBidProposalId.toString()).toBe(proposalId.toString());

    const updated = await RealEstateCompany.findById(company._id);
    const withdrawals = updated.treasury.transactions.filter((t) => t.type === 'withdrawal');
    expect(withdrawals.length).toBe(1);
  });

  it('concurrent recovery by two workers executes exactly once', async () => {
    const { company, proposalId, auction } = await makeProposal(hqCityId, 3);
    await forceResolving(company._id, proposalId);

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;

    const [first, second] = await Promise.all([
      recoverAuctionBidProposal(company._id, proposalId),
      recoverAuctionBidProposal(company._id, proposalId),
    ]);

    const recovered = [first, second].filter((r) => r.recovered === true).length;
    expect(recovered).toBe(1);

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.auctionBids.id(proposalId).status).toBe('approved');
    expect(updated.treasury.balance).toBe(beforeBalance - 2000);

    const auctionUpdated = await Auction.findById(auction._id);
    const companyBids = auctionUpdated.bids.filter((b) => b.username === `${company.name} (Company)`);
    expect(companyBids.length).toBe(1);
  });

  it('non-stale resolving proposal is NOT touched by recovery', async () => {
    const { company, proposalId } = await makeProposal(hqCityId, 3);
    // resolvingAt is recent -> not stale.
    await forceResolving(company._id, proposalId, new Date());

    const result = await recoverAuctionBidProposal(company._id, proposalId);
    expect(result.recovered).toBe(false);

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.auctionBids.id(proposalId).status).toBe('resolving');
  });

  it('failed recovery (auction cannot execute) marks proposal expired, never stuck', async () => {
    const { company, proposalId, auction } = await makeProposal(hqCityId, 3);
    await forceResolving(company._id, proposalId);

    // Auction no longer bidable -> recovery cannot execute -> expired.
    await Auction.updateOne({ _id: auction._id }, { $set: { status: 'ended', endTick: 90 } });

    const result = await recoverAuctionBidProposal(company._id, proposalId);
    expect(result.recovered).toBe(true);
    expect(result.outcome).toBe('expired');

    const updated = await RealEstateCompany.findById(company._id);
    const proposal = updated.auctionBids.id(proposalId);
    expect(proposal.status).toBe('expired');
    expect(proposal.resolutionReason).toBeTruthy();
  });

  it('recoverStaleAuctionBidProposals scans and recovers stale proposals only', async () => {
    const { company, proposalId } = await makeProposal(hqCityId, 3);
    await forceResolving(company._id, proposalId);

    const results = await recoverStaleAuctionBidProposals();
    const matches = results.filter((r) => r.recovered === true);
    expect(matches.length).toBeGreaterThanOrEqual(1);

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.auctionBids.id(proposalId).status).toBe('approved');
  });
});
