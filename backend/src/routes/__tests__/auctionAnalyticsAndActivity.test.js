import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import Auction from '../../models/Auction.js';
import AuctionReservation from '../../models/AuctionReservation.js';
import AuctionReputation from '../../models/AuctionReputation.js';
import Transaction from '../../models/Transaction.js';
import { cacheGet, cacheDelPattern } from '../../utils/cache.js';

const app = createApp();

async function makeUser(name, balance = 1000000) {
  return createAuthenticatedUser({ balance });
}

async function makeAuction({ city, endTick = 50 } = {}) {
  const property = await Property.create({
    cityId: city._id,
    name: `Prop_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: 100000,
    currentPrice: 100000,
    forSale: true,
  });
  return Auction.create({
    propertyId: property._id,
    sellerId: null,
    sellerType: 'bank',
    auctionType: 'standard',
    startingBid: 1000,
    currentBid: 0,
    currentBidderId: null,
    bidIncrement: 100,
    status: 'active',
    startTick: 1,
    endTick,
    originalEndTick: endTick,
    totalBids: 0,
    bids: [],
    activity: [],
    watchers: [],
  });
}

beforeEach(async () => {
  global.currentTick = 10;
  await User.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
  await Auction.deleteMany({});
  await AuctionReservation.deleteMany({});
  await AuctionReputation.deleteMany({});
  await Transaction.deleteMany({});
  await cacheDelPattern('cf:auctions:my-analytics:*');
});

afterAll(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
  await Auction.deleteMany({});
  await AuctionReservation.deleteMany({});
  await AuctionReputation.deleteMany({});
  await Transaction.deleteMany({});
});

describe('GET /auctions/my/analytics', () => {
  it('returns the authenticated user auction stats', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeUser('analyst');
    const auction = await makeAuction({ city });
    // watch it first (bidding auto-watches, which would otherwise toggle it off)
    await request(app).post(`/auctions/${auction._id}/watch`).set(authHeader(token));
    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 40000 });

    const res = await request(app).get('/auctions/my/analytics').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({
      participation: 1,
      bidsPlaced: 1,
      won: 0,
      lost: 1,
      totalAmountBid: 40000,
      totalSpent: 0,
      averageBid: 40000,
      watchlistCount: 1,
      activeWinningBids: 1,
      reservedAuctionFunds: 40000,
      availableBalance: 960000,
    });
    expect(res.body.stats.balance).toBe(1000000);
  });

  it('caches per-user so another user never sees this user data', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { token: tokenA } = await makeUser('cacheA');
    const { token: tokenB } = await makeUser('cacheB');
    const auction = await makeAuction({ city });
    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(tokenA)).send({ amount: 40000 });

    const resA = await request(app).get('/auctions/my/analytics').set(authHeader(tokenA));
    const resB = await request(app).get('/auctions/my/analytics').set(authHeader(tokenB));

    expect(resA.body.stats.participation).toBe(1);
    expect(resA.body.stats.totalAmountBid).toBe(40000);
    expect(resB.body.stats.participation).toBe(0);
    expect(resB.body.stats.totalAmountBid).toBe(0);
  });

  it('reflects wins after settlement', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeUser('settleStats', 100000);
    const auction = await makeAuction({ city, endTick: 15 });
    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 40000 });

    global.currentTick = 16;
    const { processAuctions } = await import('../../engine/auctionProcessing.js');
    await processAuctions();

    const res = await request(app).get('/auctions/my/analytics').set(authHeader(token));
    expect(res.body.stats.won).toBe(1);
    expect(res.body.stats.lost).toBe(0);
    expect(res.body.stats.totalSpent).toBe(40000);
    expect(res.body.stats.reservedAuctionFunds).toBe(0);
    expect(res.body.stats.activeWinningBids).toBe(0);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/auctions/my/analytics');
    expect(res.status).toBe(401);
  });
});

describe('GET /stats — global activity feed', () => {
  it('only includes real player activity (no system/$0/penalty/login)', async () => {
    const { user } = await createAuthenticatedUser();
    const city = await createTestCity();
    const property = await Property.create({
      cityId: city._id,
      name: 'Activity Prop',
      type: 'apartment',
      basePrice: 50000,
      currentPrice: 50000,
    });

    await Transaction.create({ buyerId: user._id, price: 100000, type: 'buy', propertyId: property._id });
    await Transaction.create({ sellerId: user._id, price: 90000, type: 'sell', propertyId: property._id });
    await Transaction.create({ buyerId: user._id, price: 0, type: 'login' }); // excluded: $0
    await Transaction.create({ buyerId: user._id, price: 0, type: 'buy' }); // excluded: $0 system transfer
    await Transaction.create({ price: 80000, type: 'buy' }); // excluded: no player actor
    await Transaction.create({ sellerId: user._id, price: 50000, type: 'repossess' }); // excluded: system type
    await Transaction.create({ buyerId: user._id, price: 100, type: 'penalty' }); // excluded: system type
    await Transaction.create({ buyerId: user._id, price: 30000, type: 'loan_payment' }); // excluded: bookkeeping
    await Transaction.create({ buyerId: user._id, price: 25000, type: 'rent' }); // included

    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    const types = res.body.recentActivity.map((t) => t.type);
    expect(types).toContain('buy');
    expect(types).toContain('sell');
    expect(types).toContain('rent');
    expect(types).not.toContain('login');
    expect(types).not.toContain('repossess');
    expect(types).not.toContain('penalty');
    expect(types).not.toContain('loan_payment');
    for (const tx of res.body.recentActivity) {
      expect(tx.price).toBeGreaterThan(0);
      expect(tx.buyerId || tx.sellerId).toBeTruthy();
    }
  });
});
