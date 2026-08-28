import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Auction from '../../models/Auction.js';
import Property from '../../models/Property.js';
import { createApp } from '../../test/createApp.js';
import {
  createAuthenticatedUser,
  createAuthenticatedAdmin,
  createTestProperty,
  setTestTick,
} from '../../test/helpers.js';
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

describe('Anti-sniping extension ceiling (production timing bug)', () => {
  let property;

  beforeEach(async () => {
    await setTestTick(100);
    property = await createTestProperty({ basePrice: 100000 });
  });

  afterEach(async () => {
    delete global.currentTick;
    await cacheDelPattern('cf:auction*');
  });

  it('a bid far from the end never extends the auction', async () => {
    const { token } = await createAuthenticatedUser({ balance: 1000000 });
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 108, originalEndTick: 108 }),
    );

    const res = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.auction.endTick).toBe(108);
    expect(res.body.auction.extensionCount ?? 0).toBe(0);

    const stored = await Auction.findById(auction._id);
    expect(stored.endTick).toBe(108);
    expect(stored.extensionCount ?? 0).toBe(0);
    expect(stored.activity.some((e) => e.type === 'extended')).toBe(false);
  });

  it('an in-window bid extends exactly once', async () => {
    const { token } = await createAuthenticatedUser({ balance: 1000000 });
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 101, originalEndTick: 101 }),
    );

    const res = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.auction.endTick).toBe(101 + AUCTION_CONFIG.antiSnipingTicks);
    expect(res.body.auction.extensionCount).toBe(1);

    const stored = await Auction.findById(auction._id);
    expect(stored.endTick).toBe(101 + AUCTION_CONFIG.antiSnipingTicks);
    expect(stored.extensionCount).toBe(1);
    expect(stored.activity.filter((e) => e.type === 'extended')).toHaveLength(1);
  });

  it('a second bidder still inside the window cannot extend again (ceiling = 1)', async () => {
    const { user: a, token: tokenA } = await createAuthenticatedUser({ username: 'ext_a', balance: 1000000 });
    const { token: tokenB } = await createAuthenticatedUser({ username: 'ext_b', balance: 1000000 });
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 101, originalEndTick: 101 }),
    );

    // First in-window bid extends by exactly antiSnipingTicks.
    await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: 2000 });
    expect((await Auction.findById(auction._id)).extensionCount).toBe(1);

    // Window still open (101 => 102, current tick 100), second bid must outbid
    // but must NOT push the end even further — the countdown may only ever grow
    // once per auction, never "1 day remaining" -> "2 days remaining".
    const second = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: 2100 });

    expect(second.status).toBe(200);
    expect(second.body.auction.currentBid).toBe(2100);
    expect(second.body.auction.endTick).toBe(101 + AUCTION_CONFIG.antiSnipingTicks);

    const stored = await Auction.findById(auction._id);
    expect(stored.endTick).toBe(101 + AUCTION_CONFIG.antiSnipingTicks);
    expect(stored.extensionCount).toBe(1);
    expect(stored.activity.filter((e) => e.type === 'extended')).toHaveLength(1);
    expect(a._id.toString()).toBeTruthy();
  });

  it('concurrent in-window bids by different users extend at most once total', async () => {
    const { token: tokenA } = await createAuthenticatedUser({ username: 'conc_a', balance: 1000000 });
    const { token: tokenB } = await createAuthenticatedUser({ username: 'conc_b', balance: 1000000 });
    const { token: tokenC } = await createAuthenticatedUser({ username: 'conc_c', balance: 1000000 });
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 101, originalEndTick: 101 }),
    );

    const results = await Promise.all(
      [tokenA, tokenB, tokenC].map((token, i) =>
        request(app)
          .post(`/auctions/${auction._id}/bid`)
          .set('Authorization', `Bearer ${token}`)
          .send({ amount: 2000 + i * 100 }),
      ),
    );
    // Amounts race: a bid that lands after a higher one may legitimately be
    // rejected for being below currentBid + bidIncrement — that is gameplay,
    // not the bug under test. At least one in-window bid must apply, and the
    // cumulative extension across ALL racing bidders is capped at exactly the
    // configured single anti-sniping extension.
    const accepted = results.filter((r) => r.status === 200);
    expect(accepted.length).toBeGreaterThanOrEqual(1);

    const stored = await Auction.findById(auction._id);
    // Hard cap proven: total extension across concurrent in-window bidders = +1 tick.
    expect(stored.endTick - stored.originalEndTick).toBe(AUCTION_CONFIG.antiSnipingTicks);
    expect(stored.extensionCount).toBeLessThanOrEqual(AUCTION_CONFIG.maxAntiSnipingExtensions);
    expect(stored.extensionCount).toBe(1);
  });

  it('a legacy auction already extended by the old code is never extended again', async () => {
    const { token } = await createAuthenticatedUser({ balance: 1000000 });
    // Simulates a pre-fix auction: endTick already 2 past original (old code
    // allowed cumulative extensions), extensionCount missing (defaults to 0).
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 102, originalEndTick: 100 }),
    );

    const res = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2000 });

    expect(res.status).toBe(200);
    // derived alreadyExtended = endTick-originalEndTick = 2 >= max -> no extension
    expect(res.body.auction.endTick).toBe(102);
    expect(res.body.auction.remainingMonths).toBe(2);

    const stored = await Auction.findById(auction._id);
    expect(stored.endTick).toBe(102);
  });
});

describe('Auction property snapshot fallback (unknown-property bug)', () => {
  let property;

  beforeEach(async () => {
    await setTestTick(100);
    property = await createTestProperty({ basePrice: 100000 });
  });

  afterEach(async () => {
    await cacheDelPattern('cf:auction*');
  });

  it('detail of an ended auction stays fully readable from the snapshot after the property is recycled', async () => {
    const auction = await Auction.create({
      ...makeAuction(property._id, {
        status: 'ended',
        startTick: 90,
        endTick: 100,
        originalEndTick: 100,
        sellerType: 'bank',
      }),
      propertySnapshot: {
        propertyId: property._id,
        name: property.name,
        type: property.type,
        condition: 85,
        propertyRating: 'standard',
        currentPrice: property.currentPrice,
        basePrice: property.basePrice,
        cityId: property.cityId,
      },
    });
    await Property.deleteOne({ _id: property._id });

    const res = await request(app).get(`/auctions/${auction._id}`);
    expect(res.status).toBe(200);
    expect(res.body.auction.property.name).toBe(property.name);
    expect(res.body.auction.property.fromSnapshot).toBe(true);
    // Never flagged as a live, purchasable property — but fully readable.
    expect(res.body.auction.propertyAvailable).toBe(false);
  });

  it('ended/cancelled auctions whose property AND snapshot are both gone return a controlled placeholder', async () => {
    const auction = await Auction.create(
      makeAuction(property._id, { status: 'ended', startTick: 90, endTick: 100, originalEndTick: 100 }),
    );
    await Property.deleteOne({ _id: property._id });

    const res = await request(app).get(`/auctions/${auction._id}`);
    expect(res.status).toBe(200);
    expect(res.body.auction.property.name).toBeNull();
    expect(res.body.auction.propertyAvailable).toBe(false);
    expect(res.body.auction.property.unavailable).toBe(true);
  });

  it('list, featured, my/bids and history never expose a null property', async () => {
    const { token } = await createAuthenticatedUser({ username: 'read_hist', balance: 1000000 });
    const geared = await Auction.create({
      ...makeAuction(property._id, { status: 'ended', startTick: 90, endTick: 100, originalEndTick: 100 }),
      propertySnapshot: { propertyId: property._id, name: property.name, type: property.type },
    });
    const legacy = await Auction.create(
      makeAuction(property._id, { status: 'ended', startTick: 80, endTick: 90, originalEndTick: 90 }),
    );
    const bidOn = await Auction.create({
      ...makeAuction(property._id, { status: 'active', startTick: 90, endTick: 108, originalEndTick: 108 }),
      propertySnapshot: { propertyId: property._id, name: property.name, type: property.type },
    });

    // Give the user a real bid so /auctions/my/bids has an entry to resolve.
    await request(app)
      .post(`/auctions/${bidOn._id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2000 });
    await Auction.updateOne({ _id: bidOn._id }, { $set: { status: 'ended' } });

    // Recycle the property (as settlement does for no-winner bank auctions).
    await Property.deleteOne({ _id: property._id });

    const listRes = await request(app).get('/auctions?status=ended');
    expect(listRes.status).toBe(200);

    const featuredRes = await request(app).get('/auctions/featured');
    expect(featuredRes.status).toBe(200);

    const bidsRes = await request(app).get('/auctions/my/bids').set('Authorization', `Bearer ${token}`);
    expect(bidsRes.status).toBe(200);

    const historyRes = await request(app).get('/auctions/history/list');
    expect(historyRes.status).toBe(200);

    for (const res of [listRes, featuredRes, bidsRes, historyRes]) {
      for (const item of res.body.auctions) {
        expect(item.property).toBeDefined();
        expect(item.property.name !== undefined).toBe(true);
      }
    }

    const gearedRow = listRes.body.auctions.find((a) => a._id === geared._id.toString());
    expect(gearedRow).toBeDefined();
    expect(gearedRow.property.name).toBe(property.name);
    expect(gearedRow.propertyAvailable).toBe(false);
    expect(gearedRow.property.fromSnapshot).toBe(true);

    const legacyRow = listRes.body.auctions.find((a) => a._id === legacy._id.toString());
    expect(legacyRow).toBeDefined();
    expect(legacyRow.property.name).toBeNull();
    expect(legacyRow.propertyAvailable).toBe(false);
    expect(legacyRow.property.unavailable).toBe(true);

    const bidRow = bidsRes.body.auctions.find((a) => a._id === bidOn._id.toString());
    expect(bidRow).toBeDefined();
    expect(bidRow.property.name).toBe(property.name);
    expect(bidRow.propertyAvailable).toBe(false);

    const histRow = historyRes.body.auctions.find((a) => a._id === bidOn._id.toString());
    expect(histRow).toBeDefined();
    expect(histRow.property.name).toBe(property.name);
  });

  it('admin property deletion is blocked while a live auction references the property', async () => {
    const { token } = await createAuthenticatedAdmin();
    const liveAuction = await Auction.create(
      makeAuction(property._id, { status: 'active', startTick: 90, endTick: 108, originalEndTick: 108 }),
    );

    const blocked = await request(app)
      .delete(`/admin/properties/${property._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(400);
    expect(await Property.findById(property._id)).toBeDefined();

    // Once no live auction depends on it, deletion is allowed and the historical
    // auction is snapshot-backfilled so it stays readable.
    await Auction.updateOne({ _id: liveAuction._id }, { $set: { status: 'ended' } });

    const allowed = await request(app)
      .delete(`/admin/properties/${property._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(allowed.status).toBe(200);
    expect(await Property.findById(property._id)).toBeNull();

    const res = await request(app).get(`/auctions/${liveAuction._id}`);
    expect(res.status).toBe(200);
    expect(res.body.auction.property.name).toBe(property.name);
    expect(res.body.auction.property.fromSnapshot).toBe(true);
  });
});
