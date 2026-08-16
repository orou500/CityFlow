import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Auction from '../../models/Auction.js';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, setTestTick } from '../../test/helpers.js';
import { processAuctions } from '../../engine/auctionProcessing.js';
import { AUCTION_CONFIG } from '../../config/auctions.js';
import { cacheDelPattern } from '../../utils/cache.js';

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
    // The authoritative tick lives in MongoDB — the same source every replica reads.
    await setTestTick(100);
    property = await createTestProperty({ basePrice: 100000 });
  });

  afterEach(async () => {
    delete global.currentTick;
    await cacheDelPattern('cf:auction*');
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

  it('ignores a stale process-local global.currentTick (multi-replica regression)', async () => {
    // The original intermittent bug: the idle replica kept its boot-time
    // global.currentTick while the database advanced. Every auction endpoint
    // must compute from MongoDB (getTickNumber), never from process memory.
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 108, originalEndTick: 108 }),
    );
    global.currentTick = 999; // stale idle-replica memory — must be ignored

    const listRes = await request(app).get('/auctions?status=active');
    const item = listRes.body.auctions.find((a) => a._id === auction._id.toString());
    expect(item.currentTick).toBe(100);
    expect(item.remainingMonths).toBe(8);

    const detailRes = await request(app).get(`/auctions/${auction._id}`);
    expect(detailRes.body.auction.currentTick).toBe(100);
    expect(detailRes.body.auction.remainingMonths).toBe(8);
    expect(detailRes.body.auction.remainingMonths).not.toBe(108 - 999);
  });

  it('updates every endpoint immediately when the tick advances (tick transition)', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'upcoming', startTick: 105, endTick: 113, originalEndTick: 113 }),
    );

    let listRes = await request(app).get('/auctions?status=upcoming');
    let item = listRes.body.auctions.find((a) => a._id === auction._id.toString());
    expect(item.remainingMonths).toBe(5);

    await setTestTick(101); // the DB advanced (simulates incrementTick)
    listRes = await request(app).get('/auctions?status=upcoming');
    item = listRes.body.auctions.find((a) => a._id === auction._id.toString());
    expect(item.currentTick).toBe(101);
    expect(item.remainingMonths).toBe(4);

    const detailRes = await request(app).get(`/auctions/${auction._id}`);
    expect(detailRes.body.auction.remainingMonths).toBe(4);
  });

  it('reports an upcoming auction exactly at its start boundary as active (start boundary)', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'upcoming', startTick: 100, endTick: 113, originalEndTick: 113 }),
    );

    const res = await request(app).get(`/auctions/${auction._id}`);
    expect(res.body.auction.status).toBe('active');
    expect(res.body.auction.remainingMonths).toBe(13);
  });

  it('reports an active auction exactly at its end boundary as ending with 0 (end boundary)', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 100, originalEndTick: 100 }),
    );

    const res = await request(app).get(`/auctions/${auction._id}`);
    expect(res.body.auction.status).toBe('ending');
    expect(res.body.auction.remainingMonths).toBe(0);
  });

  it('keeps list, detail and featured consistent after an anti-sniping extension', async () => {
    const { token } = await createAuthenticatedUser({ balance: 1000000 });
    const auction = await Auction.create(
      makeAuction(property._id, {
        status: 'active',
        startTick: 90,
        endTick: 101,
        originalEndTick: 101,
        currentBid: 0,
      }),
    );

    // ticksRemaining = 101 - 100 = 1 <= antiSnipingThresholdTicks -> extends
    const bidRes = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2000 });

    expect(bidRes.status).toBe(200);
    const expectedEndTick = 101 + AUCTION_CONFIG.antiSnipingTicks;
    expect(bidRes.body.auction.endTick).toBe(expectedEndTick);
    expect(bidRes.body.auction.remainingMonths).toBe(expectedEndTick - 100);

    const detailRes = await request(app).get(`/auctions/${auction._id}`);
    expect(detailRes.body.auction.endTick).toBe(expectedEndTick);
    expect(detailRes.body.auction.remainingMonths).toBe(expectedEndTick - 100);

    const listRes = await request(app).get('/auctions?status=active');
    const listItem = listRes.body.auctions.find((a) => a._id === auction._id.toString());
    expect(listItem.endTick).toBe(expectedEndTick);
    expect(listItem.remainingMonths).toBe(expectedEndTick - 100);
  });

  it('recomputes cached featured responses after a tick (cache-after-tick regression)', async () => {
    await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 108, originalEndTick: 108 }),
    );

    const first = await request(app).get('/auctions/featured');
    const firstItem = first.body.auctions.find((a) => a.endTick === 108);
    expect(firstItem.remainingMonths).toBe(8);

    // Tick advances and the tick's cache invalidation runs (tick.js does cacheDelPattern('cf:auction*')).
    await setTestTick(101);
    await cacheDelPattern('cf:auction*');

    const second = await request(app).get('/auctions/featured');
    const secondItem = second.body.auctions.find((a) => a.endTick === 108);
    expect(secondItem.currentTick).toBe(101);
    expect(secondItem.remainingMonths).toBe(7);
  });
});

describe('Auction lifecycle through processAuctions', () => {
  let property;

  beforeEach(async () => {
    await setTestTick(100);
    property = await createTestProperty({ basePrice: 100000 });
  });

  it('transitions active -> ending -> ended exactly once and never sticks at 0', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 100, originalEndTick: 100 }),
    );

    await setTestTick(100);
    await processAuctions();
    let updated = await Auction.findById(auction._id);
    expect(updated.status).toBe('ending');

    await setTestTick(101);
    await processAuctions();
    updated = await Auction.findById(auction._id);
    expect(updated.status).toBe('ending');

    await setTestTick(102);
    await processAuctions();
    updated = await Auction.findById(auction._id);
    expect(updated.status).toBe('ended');

    await setTestTick(103);
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

    await setTestTick(100);
    await processAuctions();

    const updated = await Auction.findById(auction._id);
    expect(updated.status).toBe('active');
    expect(AUCTION_CONFIG.endingDurationTicks).toBe(2);
  });
});
