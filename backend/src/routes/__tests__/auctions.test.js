import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Auction from '../../models/Auction.js';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty } from '../../test/helpers.js';
import { processAuctions } from '../../engine/auctionProcessing.js';
import { AUCTION_CONFIG } from '../../config/auctions.js';

const app = createApp();

function makeAuction(propertyId, overrides = {}) {
  return {
    propertyId,
    sellerId: null,
    sellerType: 'bank',
    auctionType: 'standard',
    startingBid: 1000,
    bidIncrement: 100,
    startTick: 100,
    endTick: 110,
    originalEndTick: 110,
    status: 'upcoming',
    ...overrides,
  };
}

describe('Auction countdown API', () => {
  let property;

  beforeEach(async () => {
    global.currentTick = 100;
    property = await createTestProperty({ basePrice: 100000 });
  });

  afterEach(() => {
    delete global.currentTick;
  });

  it('returns remainingMonths based on startTick for upcoming auctions', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'upcoming', startTick: 105, endTick: 113, originalEndTick: 113 }),
    );

    const res = await request(app).get('/auctions?status=upcoming');
    expect(res.status).toBe(200);

    const item = res.body.auctions.find((a) => a._id === auction._id.toString());
    expect(item).toBeDefined();
    expect(item.currentTick).toBe(100);
    expect(item.remainingMonths).toBe(5);
    expect(item.ticksRemaining).toBe(5);
  });

  it('returns remainingMonths based on endTick for active auctions', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 108, originalEndTick: 108 }),
    );

    const res = await request(app).get('/auctions?status=active');
    expect(res.status).toBe(200);

    const item = res.body.auctions.find((a) => a._id === auction._id.toString());
    expect(item).toBeDefined();
    expect(item.remainingMonths).toBe(8);
    expect(item.ticksRemaining).toBe(8);
  });

  it('keeps list and detail countdowns consistent for the same auction', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'upcoming', startTick: 108, endTick: 116, originalEndTick: 116 }),
    );

    const listRes = await request(app).get('/auctions?status=upcoming');
    const detailRes = await request(app).get(`/auctions/${auction._id}`);

    const listItem = listRes.body.auctions.find((a) => a._id === auction._id.toString());
    expect(listItem.remainingMonths).toBe(8);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.auction.remainingMonths).toBe(8);
    expect(detailRes.body.auction.ticksRemaining).toBe(8);
    expect(detailRes.body.auction.currentTick).toBe(100);
  });

  it('propagates remainingMonths on bid responses and my/bids', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 1000000 });
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 113, originalEndTick: 113 }),
    );

    const bidRes = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2000 });

    expect(bidRes.status).toBe(200);
    expect(bidRes.body.auction.currentBid).toBe(2000);
    expect(bidRes.body.auction.currentTick).toBe(100);
    expect(bidRes.body.auction.remainingMonths).toBe(13);

    const bidsRes = await request(app).get('/auctions/my/bids').set('Authorization', `Bearer ${token}`);
    expect(bidsRes.status).toBe(200);

    const item = bidsRes.body.auctions.find((a) => a._id === auction._id.toString());
    expect(item).toBeDefined();
    expect(item.remainingMonths).toBe(13);
    expect(item.ticksRemaining).toBe(13);
    expect(user._id.toString()).toBeTruthy();
  });
});

describe('Auction lifecycle through processAuctions', () => {
  let property;

  beforeEach(async () => {
    global.currentTick = 100;
    property = await createTestProperty({ basePrice: 100000 });
  });

  afterEach(() => {
    delete global.currentTick;
  });

  it('transitions active -> ending -> ended exactly once and never sticks at 0', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 100, originalEndTick: 100 }),
    );

    global.currentTick = 100;
    await processAuctions();
    let updated = await Auction.findById(auction._id);
    expect(updated.status).toBe('ending');

    global.currentTick = 101;
    await processAuctions();
    updated = await Auction.findById(auction._id);
    expect(updated.status).toBe('ending');

    global.currentTick = 102;
    await processAuctions();
    updated = await Auction.findById(auction._id);
    expect(updated.status).toBe('ended');

    global.currentTick = 103;
    await processAuctions();
    updated = await Auction.findById(auction._id);
    expect(updated.status).toBe('ended');

    const res = await request(app).get(`/auctions/${auction._id}`);
    expect(res.body.auction.status).toBe('ended');
    expect(res.body.auction.remainingMonths).toBe(0);
  });

  it('activates upcoming auctions when the start tick arrives', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'upcoming', startTick: 100, endTick: 120, originalEndTick: 120 }),
    );

    global.currentTick = 100;
    await processAuctions();

    const updated = await Auction.findById(auction._id);
    expect(updated.status).toBe('active');
    expect(AUCTION_CONFIG.endingDurationTicks).toBe(2);
  });
});
