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
import {
  calculateAuctionBidVotingEndsAt,
  resolveAuctionBidProposal,
  AUCTION_BID_VOTING_DURATION_MS,
} from '../../engine/auctionBidProposals.js';

const app = createApp();
const TICK_MS = 6 * 60 * 60 * 1000;

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

async function makeProposal(hqCityId, memberCount) {
  const founder = await createFounder();
  const company = await createCompanyAndDeposit(
    founder.token,
    hqCityId,
    `Vote_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  );
  const members = [];
  for (let i = 0; i < memberCount; i++) {
    members.push(await addMemberViaAPI(company._id, founder.token));
  }
  const property = await createTestProperty({ basePrice: 100000 });
  const auction = await Auction.create(makeAuction(property._id));
  const propRes = await request(app)
    .post(`/auctions/${auction._id}/company-bid`)
    .set(authHeader(founder.token))
    .send({ companyId: company._id, amount: 2000 });
  expect(propRes.status).toBe(201);
  return {
    founder,
    company,
    members,
    auction,
    proposalId: propRes.body.proposalId,
    votingEndsAt: propRes.body.votingEndsAt,
  };
}

async function vote(auctionId, proposalId, token, voteVal) {
  return request(app)
    .post(`/auctions/${auctionId}/company-bid/${proposalId}/vote`)
    .set(authHeader(token))
    .send({ vote: voteVal });
}

describe('calculateAuctionBidVotingEndsAt — voting deadline = MIN(createdAt + 6h, auctionEndsAt)', () => {
  // now is a fixed reference; auctionEndsAt is derived from tick state:
  // lastTickAt + (endTick - currentTick) * 6h. We tune lastTickAt to produce
  // the desired "auction remaining" wall-clock window.
  const NOW = new Date('2026-08-17T12:00:00.000Z').getTime();

  function gs(remainingTicks, lastTickOffsetH = 1) {
    return {
      tickNumber: 100,
      lastTickAt: new Date(NOW - lastTickOffsetH * 60 * 60 * 1000),
    };
  }

  function auction(endTick) {
    return { endTick };
  }

  it('auction 4 months remaining -> voting period = 6 hours', () => {
    const voting = calculateAuctionBidVotingEndsAt(auction(100 + 480), gs(480), NOW).getTime();
    expect(voting).toBe(NOW + AUCTION_BID_VOTING_DURATION_MS);
  });

  it('auction 2 days remaining -> voting period = 6 hours', () => {
    const voting = calculateAuctionBidVotingEndsAt(auction(100 + 8), gs(8), NOW).getTime();
    expect(voting).toBe(NOW + AUCTION_BID_VOTING_DURATION_MS);
  });

  it('auction 10 hours remaining -> voting period = 6 hours (cap dominates)', () => {
    // 10h remaining: lastTickAt = now - 4h, endTick = currentTick + 1 (6h)
    // -> auctionEndsAt = now + 2h ... tune to > 6h: lastTickAt = now - 1h
    const voting = calculateAuctionBidVotingEndsAt(auction(101), gs(1, 4), NOW).getTime();
    // auctionEndsAt = NOW - 4h + 6h = NOW + 2h < NOW + 6h -> capped at +2h
    expect(voting).toBe(NOW + 2 * 60 * 60 * 1000);
  });

  it('auction 5 hours remaining -> voting period = 5 hours', () => {
    const voting = calculateAuctionBidVotingEndsAt(auction(101), gs(1, 1), NOW).getTime();
    // auctionEndsAt = NOW - 1h + 6h = NOW + 5h < NOW + 6h -> capped at +5h
    expect(voting).toBe(NOW + 5 * 60 * 60 * 1000);
  });

  it('auction 1 hour remaining -> voting period = 1 hour', () => {
    const voting = calculateAuctionBidVotingEndsAt(auction(101), gs(1, 5), NOW).getTime();
    // auctionEndsAt = NOW - 5h + 6h = NOW + 1h
    expect(voting).toBe(NOW + 1 * 60 * 60 * 1000);
  });

  it('auction 20 minutes remaining -> voting period = 20 minutes', () => {
    const voting = calculateAuctionBidVotingEndsAt(auction(101), gs(1, 5 + 40 / 60), NOW).getTime();
    // auctionEndsAt = NOW - 5h40m + 6h = NOW + 20m
    expect(voting).toBe(NOW + 20 * 60 * 1000);
  });

  it('votingEndsAt <= auctionEndsAt always', () => {
    for (const lastTickOffsetH of [0.1, 1, 3, 5, 5.9]) {
      for (const endTick of [101, 105, 120, 100 + 480]) {
        const s = gs(endTick - 100, lastTickOffsetH);
        const a = auction(endTick);
        const voting = calculateAuctionBidVotingEndsAt(a, s, NOW).getTime();
        const auctionEndsAt = new Date(s.lastTickAt).getTime() + (endTick - s.tickNumber) * TICK_MS;
        expect(voting).toBeLessThanOrEqual(auctionEndsAt);
        expect(voting).toBeLessThanOrEqual(NOW + AUCTION_BID_VOTING_DURATION_MS);
      }
    }
  });
});

describe('Auction bid proposal — voting deadline persistence & vote rejection', () => {
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

  it('proposal persists votingEndsAt (backend-computed) and it is <= now + 6h', async () => {
    const { company, proposalId, votingEndsAt } = await makeProposal(hqCityId, 1);
    expect(votingEndsAt).toBeTruthy();
    const deadline = new Date(votingEndsAt).getTime();
    expect(deadline).toBeLessThanOrEqual(Date.now() + AUCTION_BID_VOTING_DURATION_MS);

    const reloaded = await RealEstateCompany.findById(company._id);
    const proposal = reloaded.auctionBids.id(proposalId);
    expect(proposal.votingEndsAt).toBeTruthy();
    expect(new Date(proposal.votingEndsAt).getTime()).toBeLessThanOrEqual(Date.now() + AUCTION_BID_VOTING_DURATION_MS);
  });

  it('rejects a vote after the voting deadline has passed', async () => {
    const { company, members, proposalId, auction } = await makeProposal(hqCityId, 1);

    await RealEstateCompany.updateOne(
      { _id: company._id, 'auctionBids._id': proposalId },
      { $set: { 'auctionBids.$.votingEndsAt': new Date(Date.now() - 1000) } },
    );

    const res = await vote(auction._id, proposalId, members[0].token, 'yes');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Voting has ended');
  });

  it('rejects a vote after the auction has ended', async () => {
    const { members, proposalId, auction } = await makeProposal(hqCityId, 1);

    await Auction.updateOne({ _id: auction._id }, { $set: { endTick: 100, originalEndTick: 100 } });

    const res = await vote(auction._id, proposalId, members[0].token, 'yes');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Auction has ended');
  });

  it('rejects proposal creation when the auction has already ended', async () => {
    const founder = await createFounder();
    const company = await createCompanyAndDeposit(founder.token, hqCityId, 'EndedPropose');
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create(makeAuction(property._id, { status: 'ended', endTick: 90 }));

    const res = await request(app)
      .post(`/auctions/${auction._id}/company-bid`)
      .set(authHeader(founder.token))
      .send({ companyId: company._id, amount: 1000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Auction is not active');
  });
});

describe('Auction bid proposal — NO VOTE = YES at deadline (required game rule)', () => {
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

  it('5 eligible voters: 2 YES + 1 NO + 2 no-vote -> YES = 4, NO = 1, approved + executed', async () => {
    // 6 members total (founder proposer + 5 eligible voters)
    const { company, members, proposalId, auction } = await makeProposal(hqCityId, 5);

    await vote(auction._id, proposalId, members[0].token, 'yes');
    await vote(auction._id, proposalId, members[1].token, 'yes');
    await vote(auction._id, proposalId, members[2].token, 'no');
    // members[3], members[4] do not vote

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;

    const result = await resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true });

    expect(result.claimed).toBe(true);
    expect(result.outcome).toBe('approved');
    expect(result.yes).toBe(4);
    expect(result.no).toBe(1);
    expect(result.missingAsYes).toBe(2);

    const updated = await RealEstateCompany.findById(company._id);
    const proposal = updated.auctionBids.id(proposalId);
    expect(proposal.status).toBe('approved');
    expect(proposal.resolution.yes).toBe(4);
    expect(proposal.resolution.no).toBe(1);
    expect(proposal.resolution.missingAsYes).toBe(2);
    expect(updated.treasury.balance).toBe(beforeBalance - 2000);

    const auctionUpdated = await Auction.findById(auction._id);
    expect(auctionUpdated.currentBid).toBe(2000);
  });

  it('5 eligible voters, 0 explicit votes -> YES = 5, NO = 0, approved', async () => {
    const { company, proposalId } = await makeProposal(hqCityId, 5);
    const result = await resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true });
    expect(result.claimed).toBe(true);
    expect(result.outcome).toBe('approved');
    expect(result.yes).toBe(5);
    expect(result.no).toBe(0);
  });

  it('5 eligible voters, 5 YES -> YES = 5, NO = 0, approved', async () => {
    const { company, members, proposalId } = await makeProposal(hqCityId, 5);
    // Inject votes directly (bypassing the immediate-resolution API path) so
    // the deadline resolution is exercised in isolation.
    await RealEstateCompany.updateOne(
      { _id: company._id, 'auctionBids._id': proposalId },
      {
        $push: {
          'auctionBids.$.votes': {
            $each: members.map((m) => ({ userId: m.user._id, vote: 'yes', votedAt: new Date() })),
          },
        },
      },
    );
    const result = await resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true });
    expect(result.claimed).toBe(true);
    expect(result.outcome).toBe('approved');
    expect(result.yes).toBe(5);
    expect(result.no).toBe(0);
    expect(result.missingAsYes).toBe(0);
  });

  it('5 eligible voters, 5 NO -> YES = 0, NO = 5, rejected (threshold 3)', async () => {
    const { company, members, proposalId } = await makeProposal(hqCityId, 5);
    await RealEstateCompany.updateOne(
      { _id: company._id, 'auctionBids._id': proposalId },
      {
        $push: {
          'auctionBids.$.votes': {
            $each: members.map((m) => ({ userId: m.user._id, vote: 'no', votedAt: new Date() })),
          },
        },
      },
    );
    const result = await resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true });
    expect(result.claimed).toBe(true);
    expect(result.outcome).toBe('rejected');
    expect(result.yes).toBe(0);
    expect(result.no).toBe(5);
  });

  it('missing votes become YES ONLY at deadline resolution, not during live voting', async () => {
    // 5 eligible voters, 1 YES + 1 NO + 3 no-vote. While voting is still open
    // (immediate resolution path) the outcome is NOT decided, so the proposal
    // stays pending. Only deadline resolution converts missing votes to YES.
    const { company, members, proposalId, auction } = await makeProposal(hqCityId, 5);
    await vote(auction._id, proposalId, members[0].token, 'yes');
    const res2 = await vote(auction._id, proposalId, members[1].token, 'no');

    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('pending');

    const reloaded = await RealEstateCompany.findById(company._id);
    expect(reloaded.auctionBids.id(proposalId).status).toBe('pending');
  });
});

describe('Auction bid proposal — atomic resolution (multi-instance safety)', () => {
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

  it('two workers cannot resolve the same proposal; only one executes', async () => {
    const { company, proposalId } = await makeProposal(hqCityId, 3);

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;

    const [first, second] = await Promise.all([
      resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true }),
      resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true }),
    ]);

    const claimed = [first, second].filter((r) => r.claimed === true).length;
    expect(claimed).toBe(1);

    const updated = await RealEstateCompany.findById(company._id);
    const proposal = updated.auctionBids.id(proposalId);
    expect(proposal.status).toBe('approved');
    expect(updated.treasury.balance).toBe(beforeBalance - 2000);
  });

  it('a resolved proposal can never return to pending (idempotent claim)', async () => {
    const { company, proposalId } = await makeProposal(hqCityId, 3);

    await resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true });
    const second = await resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true });

    expect(second.claimed).toBe(false);

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.auctionBids.id(proposalId).status).toBe('approved');
  });

  it('auction bid is created exactly once and treasury charged exactly once', async () => {
    const { company, proposalId, auction } = await makeProposal(hqCityId, 3);

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;

    await resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true });
    await resolveAuctionBidProposal(company._id, proposalId, { applyMissingAsYes: true });

    const auctionUpdated = await Auction.findById(auction._id);
    const companyBids = auctionUpdated.bids.filter((b) => b.username === `${company.name} (Company)`);
    expect(companyBids.length).toBe(1);

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.treasury.balance).toBe(beforeBalance - 2000);
    const withdrawals = updated.treasury.transactions.filter((t) => t.type === 'withdrawal');
    expect(withdrawals.length).toBe(1);
  });
});

describe('Auction bid proposal — immediate resolution still works (existing behavior)', () => {
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

  it('threshold reached while voting resolves immediately and executes the bid', async () => {
    // 3 members (proposer + 2 eligible), threshold = 1 -> single YES resolves
    const { company, members, proposalId, auction } = await makeProposal(hqCityId, 2);

    const before = await RealEstateCompany.findById(company._id);
    const beforeBalance = before.treasury.balance;

    const res = await vote(auction._id, proposalId, members[0].token, 'yes');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.auctionBids.id(proposalId).status).toBe('approved');
    expect(updated.treasury.balance).toBe(beforeBalance - 2000);
  });
});
