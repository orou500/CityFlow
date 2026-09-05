import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Auction from '../../models/Auction.js';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, setTestTick } from '../../test/helpers.js';
import { cacheDelPattern } from '../../utils/cache.js';

/**
 * Minimum Winning Bid — API integration tests.
 *
 * Verifies that the reserve auction floor is authoritative end-to-end:
 *   - a bid one dollar below the reserve is REJECTED (a client can never win
 *     an auction it is not eligible for at settlement)
 *   - a bid exactly at the reserve is ACCEPTED (settlement uses >=, so the
 *     reserve value itself is a legal winning amount)
 *   - every auction endpoint surfaces `minimumWinningBid` (list, detail,
 *     featured, my/bids, watchlist, bid response)
 *   - the floor tracks the live current bid and drops back to the plain
 *     next-bid rule once the reserve is met
 */
const app = createApp();

const RESERVE = 5000;
const STARTING_BID = 1000;
const INCREMENT = 100;

async function makeActiveReserveAuction() {
  const property = await createTestProperty({ basePrice: 100000 });
  return Auction.create({
    propertyId: property._id,
    sellerId: null,
    sellerType: 'bank',
    auctionType: 'reserve',
    reservePrice: RESERVE,
    startingBid: STARTING_BID,
    bidIncrement: INCREMENT,
    currentBid: 0,
    currentBidderId: null,
    status: 'active',
    startTick: 90,
    endTick: 115,
    originalEndTick: 115,
    totalBids: 0,
  });
}

describe('Reserve auction minimum winning bid', () => {
  beforeEach(async () => {
    await setTestTick(100);
  });

  afterEach(async () => {
    delete global.currentTick;
    await cacheDelPattern('cf:auction*');
  });

  it('rejects a bid one dollar below the reserve with the reserve message', async () => {
    const auction = await makeActiveReserveAuction();
    const { token } = await createAuthenticatedUser({ balance: 1000000 });

    const res = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: RESERVE - 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Minimum bid to win this reserve auction is \$5,000/);
    // Nothing may have moved.
    const after = await Auction.findById(auction._id);
    expect(after.currentBid).toBe(0);
    expect(after.currentBidderId).toBeNull();
  });

  it('accepts a bid exactly AT the reserve and flips reserveMet', async () => {
    const auction = await makeActiveReserveAuction();
    const { token } = await createAuthenticatedUser({ balance: 1000000 });

    const res = await request(app).post(`/auctions/${auction._id}/bid`).set('Authorization', `Bearer ${token}`).send({
      amount: RESERVE,
    });

    expect(res.status).toBe(200);
    expect(res.body.auction.currentBid).toBe(RESERVE);
    expect(res.body.auction.reserveMet).toBe(true);
    expect(res.body.auction.minimumWinningBid).toBe(RESERVE + INCREMENT);

    const after = await Auction.findById(auction._id);
    expect(after.reserveMet).toBe(true);

    // The bidder is winning — a reserve bid at exactly the reserve is a real win.
    const detail = await request(app).get(`/auctions/${auction._id}`);
    expect(detail.body.auction.reserveMet).toBe(true);
  });

  it('uses the plain next-bid floor when the current bid already satisfies the reserve', async () => {
    // currentBid 5050 >= reserve 5000 (value check met, persisted flag stale):
    // the floor must be the next-bid rule (5150), and the generic message applies.
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create({
      propertyId: property._id,
      sellerId: null,
      sellerType: 'bank',
      auctionType: 'reserve',
      reservePrice: RESERVE,
      startingBid: STARTING_BID,
      bidIncrement: INCREMENT,
      currentBid: 5050,
      currentBidderId: null,
      status: 'active',
      startTick: 90,
      endTick: 115,
      originalEndTick: 115,
    });
    const { token } = await createAuthenticatedUser({ balance: 1000000 });

    // One below the next-bid rule -> rejected with the GENERIC message (the
    // reserve is already satisfied, so there is no "to win this reserve" hint).
    const tooLow = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5100 });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.error).toMatch(/^Minimum bid is \$5,150/);
    expect(tooLow.body.error).not.toContain('reserve auction');

    const exact = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5150 });
    expect(exact.status).toBe(200);
  });

  it('surfaces minimumWinningBid on every auction endpoint', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 1000000 });
    // Pre-seeded below-reserve high bid (4500 < reserve 5000) — reachable only
    // by direct DB state now that the API rejects such bids.
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create({
      propertyId: property._id,
      sellerId: null,
      sellerType: 'bank',
      auctionType: 'reserve',
      reservePrice: RESERVE,
      startingBid: STARTING_BID,
      bidIncrement: INCREMENT,
      currentBid: 4500,
      currentBidderId: user._id,
      status: 'active',
      startTick: 90,
      endTick: 115,
      originalEndTick: 115,
      totalBids: 1,
      bids: [{ bidderId: user._id, amount: 4500, tick: 99, username: user.username }],
    });

    await request(app).post(`/auctions/${auction._id}/watch`).set('Authorization', `Bearer ${token}`);

    // currentBid 4500 -> nextBid 4600 < reserve 5000 -> floor is the reserve.
    const list = await request(app).get('/auctions?status=active');
    const listItem = list.body.auctions.find((a) => a._id === auction._id.toString());
    expect(listItem.minimumWinningBid).toBe(RESERVE);

    const detail = await request(app).get(`/auctions/${auction._id}`);
    expect(detail.body.auction.minimumWinningBid).toBe(RESERVE);

    const featured = await request(app).get('/auctions/featured');
    const featuredItem = featured.body.auctions.find((a) => a._id === auction._id.toString());
    expect(featuredItem.minimumWinningBid).toBe(RESERVE);

    const myBids = await request(app).get('/auctions/my/bids').set('Authorization', `Bearer ${token}`);
    const myBidItem = myBids.body.auctions.find((a) => a._id === auction._id.toString());
    expect(myBidItem.minimumWinningBid).toBe(RESERVE);

    const watchlist = await request(app).get('/auctions/my/watchlist').set('Authorization', `Bearer ${token}`);
    const watchItem = watchlist.body.auctions.find((a) => a._id === auction._id.toString());
    expect(watchItem.minimumWinningBid).toBe(RESERVE);
  });

  it('minimumWinningBid recalculates when the reserve gets met by a higher bid', async () => {
    const bidderA = await createAuthenticatedUser({ balance: 1000000 });
    const bidderB = await createAuthenticatedUser({ balance: 1000000 });
    const property = await createTestProperty({ basePrice: 100000 });
    const auction = await Auction.create({
      propertyId: property._id,
      sellerId: null,
      sellerType: 'bank',
      auctionType: 'reserve',
      reservePrice: RESERVE,
      startingBid: STARTING_BID,
      bidIncrement: INCREMENT,
      currentBid: 4500,
      currentBidderId: bidderA.user._id,
      status: 'active',
      startTick: 90,
      endTick: 115,
      originalEndTick: 115,
      totalBids: 1,
      bids: [{ bidderId: bidderA.user._id, amount: 4500, tick: 99, username: bidderA.user.username }],
    });

    // A below-reserve current bid -> floor is the reserve.
    const beforeRes = await request(app).get(`/auctions/${auction._id}`);
    expect(beforeRes.body.auction.minimumWinningBid).toBe(RESERVE);

    // B crosses the reserve with 6000 -> reserve met -> floor becomes nextBid.
    const bidRes = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set('Authorization', `Bearer ${bidderB.token}`)
      .send({ amount: 6000 });
    expect(bidRes.status).toBe(200);
    expect(bidRes.body.auction.reserveMet).toBe(true);
    expect(bidRes.body.auction.minimumWinningBid).toBe(6100);

    const afterRes = await request(app).get(`/auctions/${auction._id}`);
    expect(afterRes.body.auction.minimumWinningBid).toBe(6100);
    expect(afterRes.body.auction.reserveMet).toBe(true);
  });
});
