import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader, setTestTick } from '../../test/helpers.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import Auction from '../../models/Auction.js';
import AuctionReservation from '../../models/AuctionReservation.js';
import AuctionReputation from '../../models/AuctionReputation.js';
import Notification from '../../models/Notification.js';
import { processAuctions, resolveStuckAuction, generateBankAuctions } from '../../engine/auctionProcessing.js';
import { cacheDelPattern } from '../../utils/cache.js';

/**
 * Auction settlement integrity regression tests.
 *
 * Guarantees:
 *  - the winner is always a real player derived from a valid persisted bid
 *  - "System" can never appear as a bidder/winner (the won activity carries the
 *    real winner's username)
 *  - deleted/missing users can never become a winner
 *  - a single auction is settled at most once, even across replicas (atomic
 *    active -> ending claim)
 *  - late bids are rejected after settlement
 */

const app = createApp();

async function makeBidder(name, balance = 200000) {
  const { user, token } = await createAuthenticatedUser({ username: name, balance });
  return { user, token };
}

/**
 * Creates an active, expiring auction pre-populated with bids. Used to exercise
 * settlement without needing the full bid HTTP flow.
 */
async function makeSettlingAuction({ city, bids = [], currentBid = 0, currentBidderId = null, endTick = 10 } = {}) {
  const property = await Property.create({
    cityId: city._id,
    name: `SettleProp_${Date.now()}_${Math.random()}`,
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
    currentBid,
    currentBidderId,
    bidIncrement: 100,
    status: 'active',
    startTick: 1,
    endTick,
    originalEndTick: endTick,
    totalBids: bids.length,
    bids,
    activity: [],
    watchers: [],
  });
}

/**
 * Creates an active, expiring auction with full control over sellerType,
 * auctionType, reservePrice, and pre-auction state fields.
 */
async function makeLifecycleAuction({
  city,
  sellerType = 'bank',
  sellerId = null,
  auctionType = 'standard',
  reservePrice = 0,
  bids = [],
  currentBid = 0,
  currentBidderId = null,
  endTick = 10,
} = {}) {
  const property = await Property.create({
    cityId: city._id,
    name: `LifecycleProp_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: 100000,
    currentPrice: 100000,
    forSale: sellerType === 'bank' ? false : true,
    ownerId: sellerType === 'player' ? sellerId : null,
  });
  const auction = await Auction.create({
    propertyId: property._id,
    sellerId,
    sellerType,
    auctionType,
    reservePrice,
    startingBid: 1000,
    currentBid,
    currentBidderId,
    bidIncrement: 100,
    status: 'active',
    startTick: 1,
    endTick,
    originalEndTick: endTick,
    totalBids: bids.length,
    bids,
    activity: [],
    watchers: [],
    previousOwnerId: sellerType === 'player' ? sellerId : null,
    previousForSale: sellerType === 'player' ? true : false,
  });
  return { property, auction };
}

function bidEntry(user, amount, tick = 9) {
  return { bidderId: user._id, amount, tick, username: user.username };
}

const settledAuction = async (auctionId) => Auction.findById(auctionId);

beforeEach(async () => {
  await setTestTick(10);
  await User.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
  await Auction.deleteMany({});
  await AuctionReservation.deleteMany({});
  await AuctionReputation.deleteMany({});
});

afterEach(async () => {
  delete global.currentTick;
  await cacheDelPattern('cf:auction*');
});

afterAll(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
  await Auction.deleteMany({});
  await AuctionReservation.deleteMany({});
  await AuctionReputation.deleteMany({});
  await cacheDelPattern('cf:auction*');
});

describe('Auction settlement integrity', () => {
  it('should never assign System as an auction winner', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('real_winner');
    const auction = await makeSettlingAuction({
      city,
      currentBid: 50000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 50000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await settledAuction(auction._id);
    expect(settled.winnerId?.toString()).toBe(user._id.toString());
    expect(settled.winningBid).toBe(50000);

    // The `won` activity MUST carry the real winner's username so the UI can
    // never fall back to a "System" label.
    const won = settled.activity.find((a) => a.type === 'won');
    expect(won).toBeDefined();
    expect(won.username).toBe(user.username);

    // Serialize the whole auction: the literal "System" must not appear
    // anywhere (it is not a real identity in this system).
    expect(JSON.stringify(settled.toObject())).not.toContain('System');

    // And the persisted property owner is the real winner.
    const property = await Property.findById(auction.propertyId);
    expect(property.ownerId?.toString()).toBe(user._id.toString());
  });

  it('normal player bid -> player wins and owns the property', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeBidder('single_bidder');

    const auction = await makeSettlingAuction({ city, endTick: 50 });
    // Bid with >2 ticks remaining so anti-sniping does not extend the auction.
    await setTestTick(47);
    const bid = await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 20000 });
    expect(bid.status).toBe(200);

    await setTestTick(50);
    await processAuctions();

    const settled = await settledAuction(auction._id);
    expect(settled.winnerId?.toString()).toBe(user._id.toString());
    const property = await Property.findById(auction.propertyId);
    expect(property.ownerId?.toString()).toBe(user._id.toString());
  });

  it('end-to-end: bank-generated property is transferred to the REAL winning bidder at settlement', async () => {
    await setTestTick(1);
    await createTestCity();
    const bidder = await makeBidder('bank_win_e2e', 50_000_000);

    // Exercise the REAL bank-generation path: Property + auction created together.
    const generated = await generateBankAuctions();
    expect(generated.length).toBe(1);
    const auction = generated[0];
    const propId = auction.propertyId;

    // The property exists while the auction exists and is never recycled.
    let live = await Property.findById(propId);
    expect(live).toBeTruthy();
    expect(live.ownerId).toBeNull();
    expect(live.companyId).toBeFalsy();
    expect(live.forSale).toBe(false);

    // Let the tick engine activate the auction, then bid through the HTTP flow.
    await Auction.updateOne({ _id: auction._id }, { $set: { startTick: 1, endTick: 2, originalEndTick: 2 } });
    await processAuctions();
    expect((await Auction.findById(auction._id)).status).toBe('active');

    const activeAuction = await Auction.findById(auction._id);
    // The bank-generation path randomly creates 'reserve' (legendary) auctions
    // whose reserve can exceed a `startingBid + bidIncrement` bid. Guarantee the
    // bid clears any reserve so the winner is always a real player (the point of
    // this test) regardless of the randomly-chosen auction type.
    const bidAmount = Math.max(activeAuction.startingBid + activeAuction.bidIncrement, activeAuction.reservePrice || 0);

    const bidRes = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set(authHeader(bidder.token))
      .send({ amount: bidAmount });
    expect(bidRes.status).toBe(200);

    // endTick was extended by the anti-sniping extension (bid within 2 ticks) to 3.
    // The claim + settlement happen together at tick 3 (status 'ending'), and the
    // state machine flips 'ending' -> 'ended' 2 ticks later.
    await setTestTick(3);
    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.status).toBe('ending');
    expect(settled.winnerId?.toString()).toBe(bidder.user._id.toString());
    expect(settled.winningBid).toBe(bidAmount);
    expect(settled.propertyId.toString()).toBe(propId.toString());

    // THE acceptance criterion applies the moment the winner is decided: the
    // winner owns the REAL, still-existing property.
    live = await Property.findById(propId);
    expect(live).toBeTruthy();
    expect(live.ownerId?.toString()).toBe(bidder.user._id.toString());
    expect(live.companyId).toBeFalsy();
    expect(live.forSale).toBe(false);

    const settledBidder = await User.findById(bidder.user._id);
    expect(settledBidder.ownedProperties.map(String)).toContain(propId.toString());
    // Charged exactly once, for exactly the winning bid.
    expect(settledBidder.balance).toBe(50_000_000 - bidAmount);

    // Two ticks later the auction record is finalized as 'ended' and the same
    // real property is still owned by the winner (ownerless state impossible).
    await setTestTick(5);
    await processAuctions();
    expect((await Auction.findById(auction._id)).status).toBe('ended');

    const finalizedProperty = await Property.findById(propId);
    expect(finalizedProperty).toBeTruthy();
    expect(finalizedProperty.ownerId?.toString()).toBe(bidder.user._id.toString());
  });

  it('settlement crash never recycles the property and never strands a charged winner', async () => {
    await setTestTick(10);
    const bidder = await makeBidder('crash_winner', 300000);
    const auction = await makeSettlingAuction({
      city: await createTestCity(),
      currentBid: 50000,
      currentBidderId: bidder.user._id,
      bids: [bidEntry(bidder.user, 50000)],
      endTick: 10,
    });
    const propId = auction.propertyId;
    const before = await Property.findById(propId);
    expect(before.forSale).toBe(true);

    // Make property.save fail at the very first transfer write. With
    // transfer-first ordering nothing has been persisted or debited yet.
    const spy = vi.spyOn(Property.prototype, 'save').mockRejectedValueOnce(new Error('simulated crash'));
    await processAuctions();
    spy.mockRestore();

    // The property must SURVIVE the crash — it is never destroyed in an
    // ambiguous winner/charge state, and its fields are untouched.
    const after = await Property.findById(propId);
    expect(after).toBeTruthy();
    expect(after.ownerId).toBeNull();
    expect(after.forSale).toBe(before.forSale);

    const cancelled = await Auction.findById(auction._id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.winnerId).toBeNull();

    // The bidder was never charged and their reservation was released.
    const freshBidder = await User.findById(bidder.user._id);
    expect(freshBidder.balance).toBe(300000);
    expect(await AuctionReservation.countDocuments({ auctionId: auction._id })).toBe(0);

    // A display snapshot was still captured on the crash path.
    expect(cancelled.propertySnapshot).toBeTruthy();
  });

  it('legacy dangling auction (property already gone) is cancelled WITHOUT fabricating a new property', async () => {
    await setTestTick(10);
    const bidder = await makeBidder('dangling_bidder', 300000);
    const auction = await makeSettlingAuction({
      city: await createTestCity(),
      currentBid: 40000,
      currentBidderId: bidder.user._id,
      bids: [bidEntry(bidder.user, 40000)],
      endTick: 10,
    });
    const propId = auction.propertyId;

    // The property has already been removed (production dangling corruption) and
    // the auction carries only an immutable display snapshot.
    await Property.deleteOne({ _id: propId });
    await Auction.updateOne(
      { _id: auction._id },
      { $set: { propertySnapshot: { name: 'Legacy ghost property', basePrice: 100000, type: 'apartment' } } },
    );

    await processAuctions();

    const cancelled = await Auction.findById(auction._id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.winnerId).toBeNull();
    expect(cancelled.winningBid).toBe(0);

    // No fabrication: no new property was created and the snapshot was NOT
    // promoted to a live Property doc.
    expect(await Property.findById(propId)).toBeNull();
    expect(await Property.countDocuments({})).toBe(0);
    expect(cancelled.propertySnapshot).toBeTruthy();
    expect(cancelled.propertySnapshot.name).toBe('Legacy ghost property');

    // The bidder was never charged.
    const freshBidder = await User.findById(bidder.user._id);
    expect(freshBidder.balance).toBe(300000);
  });

  it('highest valid bid wins (multiple players)', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const a = await makeBidder('bidder_a');
    const b = await makeBidder('bidder_b');
    const c = await makeBidder('bidder_c');
    const auction = await makeSettlingAuction({
      city,
      currentBid: 150,
      currentBidderId: b.user._id,
      bids: [bidEntry(a.user, 100), bidEntry(b.user, 150), bidEntry(c.user, 125)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await settledAuction(auction._id);
    expect(settled.winnerId?.toString()).toBe(b.user._id.toString());
    expect(settled.winningBid).toBe(150);
    const won = settled.activity.find((x) => x.type === 'won');
    expect(won.username).toBe(b.user.username);
  });

  it('no bids -> no winner', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const auction = await makeSettlingAuction({ city, endTick: 10 });

    await processAuctions();

    const settled = await settledAuction(auction._id);
    expect(settled.winnerId).toBeNull();
    expect(settled.winningBid).toBe(0);
    expect(settled.activity.some((x) => x.type === 'won')).toBe(false);
  });

  it('a deleted/missing user can never become the winner', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const ghost = await makeBidder('ghost');
    // The "winning" bidder no longer exists.
    await User.deleteOne({ _id: ghost.user._id });

    const auction = await makeSettlingAuction({
      city,
      currentBid: 90000,
      currentBidderId: ghost.user._id,
      bids: [bidEntry(ghost.user, 90000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await settledAuction(auction._id);
    expect(settled.winnerId).toBeNull();
    expect(settled.winningBid).toBe(0);
    // No won activity may exist for a non-existent user.
    expect(settled.activity.some((x) => x.type === 'won')).toBe(false);
    const property = await Property.findById(auction.propertyId);
    expect(property.ownerId).toBeNull();
  });

  it('an invalid/non-existent bidder cannot create a bid', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeBidder('soon_deleted');
    const auction = await makeSettlingAuction({ city, endTick: 50 });

    await User.deleteOne({ _id: user._id });
    const res = await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 10000 });

    expect([401, 404]).toContain(res.status);
    const fresh = await settledAuction(auction._id);
    expect(fresh.bids.length).toBe(0);
  });

  it('a bid referencing a bogus ObjectId bidder is ignored at settlement (no fabricated winner)', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('real_bidder');
    const bogusId = '000000000000000000000000'; // valid ObjectId, no user

    // currentBidderId disagrees with the highest valid bid — the persisted
    // bid must win the tie, and a bogus reference can never become winner.
    const auction = await makeSettlingAuction({
      city,
      currentBid: 70000,
      currentBidderId: bogusId,
      bids: [bidEntry(user, 70000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await settledAuction(auction._id);
    expect(settled.winnerId?.toString()).toBe(user._id.toString());
    expect(settled.winningBid).toBe(70000);
  });

  it('a highest bid from a deleted user (with no valid alternative) -> no winner', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const ghost = await makeBidder('ghost_high');
    await User.deleteOne({ _id: ghost.user._id });

    const auction = await makeSettlingAuction({
      city,
      currentBid: 50000,
      currentBidderId: ghost.user._id,
      bids: [bidEntry(ghost.user, 50000)],
      endTick: 10,
    });

    await processAuctions();
    const settled = await settledAuction(auction._id);
    expect(settled.winnerId).toBeNull();
    expect(settled.winningBid).toBe(0);
  });

  it('an auction is settled exactly once, even across replicas/workers', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('single_winner');
    const auction = await makeSettlingAuction({
      city,
      currentBid: 40000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 40000)],
      endTick: 10,
    });

    // Worker A (bid route / stuck resolution) settles first.
    await resolveStuckAuction(auction._id);
    // Worker B (tick) runs at the same tick — must NOT settle again.
    await processAuctions();
    // A later tick re-runs — still must NOT re-settle.
    await setTestTick(11);
    await processAuctions();

    const settled = await settledAuction(auction._id);
    const winner = await User.findById(user._id);
    expect(winner.balance).toBe(200000 - 40000); // deducted exactly once
    expect(settled.activity.filter((x) => x.type === 'won').length).toBe(1);

    const property = await Property.findById(auction.propertyId);
    expect(property.ownerId?.toString()).toBe(user._id.toString());
    expect(property.investmentHistory.filter((h) => h.type === 'purchase').length).toBe(1);
  });

  it('a late bid cannot be accepted after the auction is settled', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const a = await makeBidder('early_bidder');
    const late = await makeBidder('late_bidder');
    const auction = await makeSettlingAuction({
      city,
      currentBid: 40000,
      currentBidderId: a.user._id,
      bids: [bidEntry(a.user, 40000)],
      endTick: 10,
    });

    await processAuctions();
    const settled = await settledAuction(auction._id);
    expect(settled.status).toBe('ending');

    const res = await request(app)
      .post(`/auctions/${auction._id}/bid`)
      .set(authHeader(late.token))
      .send({ amount: 80000 });
    expect(res.status).toBe(400);

    const fresh = await settledAuction(auction._id);
    expect(fresh.currentBid).toBe(40000);
    expect(fresh.currentBidderId?.toString()).toBe(a.user._id.toString());
  });

  it('the API returns the persisted winner (and cache cannot show a different one)', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('winner_api');
    const auction = await makeSettlingAuction({
      city,
      currentBid: 45000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 45000)],
      endTick: 10,
    });

    await processAuctions();

    const res = await request(app).get(`/auctions/${auction._id}`);
    expect(res.status).toBe(200);
    expect(res.body.auction.winnerId._id.toString()).toBe(user._id.toString());
    expect(res.body.auction.winnerId.username).toBe(user.username);
    expect(res.body.auction.winningBid).toBe(45000);

    // Featured cache is invalidated after settlement; a fresh read still shows
    // the persisted winner.
    const featured = await request(app).get('/auctions/featured');
    expect(featured.status).toBe(200);
    expect(JSON.stringify(featured.body)).not.toContain('"System"');
  });
});

describe('Property lifecycle after auction settlement', () => {
  it('bank auction, no bids -> property deleted', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { property, auction } = await makeLifecycleAuction({ city, endTick: 10 });

    const propId = property._id;
    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId).toBeNull();
    // The immutable snapshot captured before the recycle keeps the historical
    // record fully readable even though the live property is gone.
    expect(settled.propertySnapshot).toBeDefined();
    expect(settled.propertySnapshot.name).toBe(property.name);
    expect(settled.propertySnapshot.propertyId.toString()).toBe(propId.toString());

    const deleted = await Property.findById(propId);
    expect(deleted).toBeNull();
  });

  it('bank reserve auction, bids below reserve -> property deleted', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('low_bidder');
    const { property, auction } = await makeLifecycleAuction({
      city,
      auctionType: 'reserve',
      reservePrice: 50000,
      currentBid: 30000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 30000)],
      endTick: 10,
    });

    const propId = property._id;
    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId).toBeNull();
    expect(settled.reserveMet).toBe(false);
    // Reserve-not-met bank auctions recycle the property as well — the snapshot
    // keeps the historical auction readable.
    expect(settled.propertySnapshot).toBeDefined();
    expect(settled.propertySnapshot.name).toBe(property.name);

    const deleted = await Property.findById(propId);
    expect(deleted).toBeNull();
  });

  it('bank auction, reserve met -> property transferred to winner', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('reserve_winner');
    const { property, auction } = await makeLifecycleAuction({
      city,
      auctionType: 'reserve',
      reservePrice: 40000,
      currentBid: 50000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 50000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId?.toString()).toBe(user._id.toString());

    const prop = await Property.findById(property._id);
    expect(prop).not.toBeNull();
    expect(prop.ownerId?.toString()).toBe(user._id.toString());
  });

  it('bank reserve auction, bid EXACTLY equals reserve -> winner', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('exact_reserve_winner');
    const { property, auction } = await makeLifecycleAuction({
      city,
      auctionType: 'reserve',
      reservePrice: 50000,
      currentBid: 50000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 50000)],
      endTick: 10,
    });

    const propId = property._id;
    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId?.toString()).toBe(user._id.toString());
    expect(settled.winningBid).toBe(50000);
    expect(settled.reserveMet).toBe(true);

    const prop = await Property.findById(propId);
    expect(prop).not.toBeNull();
    expect(prop.ownerId?.toString()).toBe(user._id.toString());
  });

  it('player auction, no bids -> property restored to marketplace', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const seller = await makeBidder('player_seller');
    const { property, auction } = await makeLifecycleAuction({
      city,
      sellerType: 'player',
      sellerId: seller.user._id,
      endTick: 10,
    });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId).toBeNull();

    const restored = await Property.findById(property._id);
    expect(restored).not.toBeNull();
    expect(restored.forSale).toBe(true);
    expect(restored.ownerId?.toString()).toBe(seller.user._id.toString());
  });

  it('player reserve auction, bids below reserve -> property restored', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const seller = await makeBidder('reserve_seller');
    const lowBidder = await makeBidder('low_reserve_bidder');
    const { property, auction } = await makeLifecycleAuction({
      city,
      sellerType: 'player',
      sellerId: seller.user._id,
      auctionType: 'reserve',
      reservePrice: 80000,
      currentBid: 50000,
      currentBidderId: lowBidder.user._id,
      bids: [bidEntry(lowBidder.user, 50000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId).toBeNull();

    const restored = await Property.findById(property._id);
    expect(restored.forSale).toBe(true);
    expect(restored.ownerId?.toString()).toBe(seller.user._id.toString());
  });

  it('winner with insufficient funds, bank auction -> property deleted', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('broke_winner', 100);
    const { property, auction } = await makeLifecycleAuction({
      city,
      currentBid: 90000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 90000)],
      endTick: 10,
    });

    const propId = property._id;
    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.status).toBe('cancelled');

    const deleted = await Property.findById(propId);
    expect(deleted).toBeNull();
  });

  it('winner with insufficient funds, player auction -> property restored', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const seller = await makeBidder('broke_seller_winner', 50000);
    const brokeBidder = await makeBidder('broke_bidder', 100);
    const { property, auction } = await makeLifecycleAuction({
      city,
      sellerType: 'player',
      sellerId: seller.user._id,
      currentBid: 90000,
      currentBidderId: brokeBidder.user._id,
      bids: [bidEntry(brokeBidder.user, 90000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.status).toBe('cancelled');

    const restored = await Property.findById(property._id);
    expect(restored.forSale).toBe(true);
    expect(restored.ownerId?.toString()).toBe(seller.user._id.toString());
  });

  it('currentBidderId is cleared on no-winner settlement', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('stale_bidder');
    const { property, auction } = await makeLifecycleAuction({
      city,
      auctionType: 'reserve',
      reservePrice: 999999,
      currentBid: 10000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 10000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.currentBidderId).toBeNull();
    expect(settled.winnerId).toBeNull();
  });

  it('currentBidderId is cleared on insufficient-funds cancellation', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('broke_clear', 50);
    const { property, auction } = await makeLifecycleAuction({
      city,
      currentBid: 80000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 80000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.status).toBe('cancelled');
    expect(settled.currentBidderId).toBeNull();
  });

  it('previousOwnerId and previousForSale are captured at creation', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const seller = await makeBidder('prev_state_seller');
    const { property, auction } = await makeLifecycleAuction({
      city,
      sellerType: 'player',
      sellerId: seller.user._id,
    });

    expect(auction.previousOwnerId?.toString()).toBe(seller.user._id.toString());
    expect(auction.previousForSale).toBe(true);

    const bankAuction = await makeLifecycleAuction({ city, sellerType: 'bank' });
    expect(bankAuction.auction.previousOwnerId).toBeNull();
    expect(bankAuction.auction.previousForSale).toBe(false);
  });

  it('isWinning uses winnerId for ended auctions (GET /auctions/:id)', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeBidder('api_winner');
    const { auction } = await makeLifecycleAuction({
      city,
      currentBid: 50000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 50000)],
      endTick: 10,
    });

    await processAuctions();

    const res = await request(app).get(`/auctions/${auction._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.auction.isWinning).toBe(true);
    expect(res.body.auction.winnerId._id.toString()).toBe(user._id.toString());
  });

  it('isWinning is false for ended auctions with no winner', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeBidder('no_winner_bidder');
    const { auction } = await makeLifecycleAuction({
      city,
      auctionType: 'reserve',
      reservePrice: 999999,
      currentBid: 10000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 10000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId).toBeNull();

    const res = await request(app).get(`/auctions/${auction._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.auction.isWinning).toBe(false);
  });

  it('multiple auctions for the same property do not interfere', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const winner = await makeBidder('multi_winner');

    const { property } = await makeLifecycleAuction({ city, endTick: 20 });

    const auction1 = await Auction.create({
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
      endTick: 10,
      originalEndTick: 10,
      totalBids: 0,
      bids: [],
      activity: [],
      watchers: [],
    });

    const auction2 = await Auction.create({
      propertyId: property._id,
      sellerId: null,
      sellerType: 'bank',
      auctionType: 'standard',
      startingBid: 1000,
      currentBid: 60000,
      currentBidderId: winner.user._id,
      bidIncrement: 100,
      status: 'active',
      startTick: 11,
      endTick: 20,
      originalEndTick: 20,
      totalBids: 1,
      bids: [bidEntry(winner.user, 60000)],
      activity: [],
      watchers: [],
    });

    await setTestTick(10);
    await processAuctions();

    const s1 = await Auction.findById(auction1._id);
    expect(s1.winnerId).toBeNull();

    const afterFirst = await Property.findById(property._id);
    expect(afterFirst).toBeNull();

    const s2 = await Auction.findById(auction2._id);
    expect(s2.status).toBe('active');
    expect(s2.currentBidderId?.toString()).toBe(winner.user._id.toString());
  });
});

describe('Settlement outcome communication and crash safety (regression)', () => {
  it('reserve not met -> bidder is notified exactly once, activity recorded, reservation released, settledAt stamped', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('reserve_gap_bidder');
    const { auction } = await makeLifecycleAuction({
      city,
      auctionType: 'reserve',
      reservePrice: 50000,
      currentBid: 30000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 30000)],
      endTick: 10,
    });
    await AuctionReservation.create({ userId: user._id, auctionId: auction._id, amount: 30000 });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId).toBeNull();
    expect(settled.winningBid).toBe(0);
    expect(settled.settledAt).toBe(10);
    expect(settled.activity.some((a) => a.type === 'ended')).toBe(true);

    // The highest bidder gets exactly ONE outcome notification (idempotent key)
    const key = `auction:${auction._id}:no_winner:${user._id}`;
    expect(await Notification.countDocuments({ userId: user._id, eventKey: key })).toBe(1);

    // Their reserved funds were released
    expect(await AuctionReservation.countDocuments({ auctionId: auction._id })).toBe(0);
    const releasedUser = await User.findById(user._id);
    expect(releasedUser.reservedAuctionFunds).toBe(0);

    // Re-running the engine cannot create a second notification
    await processAuctions();
    expect(await Notification.countDocuments({ userId: user._id, eventKey: key })).toBe(1);
  });

  it('no bids -> no outcome notification is created (nothing to release)', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { auction } = await makeLifecycleAuction({ city, endTick: 10 });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId).toBeNull();
    expect(settled.settledAt).toBe(10);
    expect(await Notification.countDocuments({ eventKey: { $regex: `auction:${auction._id}:no_winner:` } })).toBe(0);
  });

  it('winner path stamps settledAt and the auction finalizes as ended two ticks later', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('settled_winner');
    const { auction } = await makeLifecycleAuction({
      city,
      currentBid: 50000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 50000)],
      endTick: 10,
    });

    await processAuctions();

    const claimed = await Auction.findById(auction._id);
    expect(claimed.status).toBe('ending');
    expect(claimed.settledAt).toBe(10);
    expect(claimed.winnerId?.toString()).toBe(user._id.toString());

    await setTestTick(12);
    await processAuctions();
    expect((await Auction.findById(auction._id)).status).toBe('ended');
  });

  it('endingCompleted never finalizes a claimed-but-unsettled auction as ended', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('unsettled_bidder');

    // Simulates a worker crash between the claim (status -> 'ending') and the
    // settlement write: settledAt stays null, bidder still tracked.
    const unsettled = await Auction.create({
      propertyId: (
        await Property.create({
          cityId: city._id,
          name: 'CrashProp',
          type: 'apartment',
          basePrice: 100000,
          currentPrice: 100000,
          forSale: false,
        })
      )._id,
      sellerId: null,
      sellerType: 'bank',
      auctionType: 'standard',
      startingBid: 1000,
      currentBid: 50000,
      currentBidderId: user._id,
      bidIncrement: 100,
      status: 'ending',
      startTick: 1,
      endTick: 9,
      originalEndTick: 9,
      endingStartedAt: 5,
      settledAt: null,
      totalBids: 1,
      bids: [bidEntry(user, 50000)],
      activity: [],
      watchers: [],
    });

    // A properly settled auction that must finalize on schedule.
    const settled = await Auction.create({
      propertyId: (
        await Property.create({
          cityId: city._id,
          name: 'SettledProp',
          type: 'apartment',
          basePrice: 100000,
          currentPrice: 100000,
          forSale: false,
        })
      )._id,
      sellerId: null,
      sellerType: 'bank',
      auctionType: 'standard',
      startingBid: 1000,
      currentBid: 60000,
      currentBidderId: user._id,
      bidIncrement: 100,
      status: 'ending',
      startTick: 1,
      endTick: 9,
      originalEndTick: 9,
      endingStartedAt: 5,
      settledAt: 5,
      totalBids: 1,
      bids: [bidEntry(user, 60000)],
      activity: [],
      watchers: [],
    });

    await processAuctions();

    // The un-settled auction must NOT silently become 'ended' — it stays
    // 'ending' for the stuck-ending recovery to reconcile.
    expect((await Auction.findById(unsettled._id)).status).toBe('ending');
    // The settled auction finalizes normally.
    expect((await Auction.findById(settled._id)).status).toBe('ended');

    // Stuck-ending recovery (10+ ticks since claim) cancels the un-settled
    // auction and releases reservations instead of pretending it ended.
    await AuctionReservation.create({ userId: user._id, auctionId: unsettled._id, amount: 50000 });
    await setTestTick(16);
    await processAuctions();
    expect((await Auction.findById(unsettled._id)).status).toBe('cancelled');
    expect(await AuctionReservation.countDocuments({ auctionId: unsettled._id })).toBe(0);
    const stuckProperty = await Property.findById(unsettled.propertyId);
    // Ambiguous crash state: the property is kept for reconciliation, never
    // destroyed on this path.
    expect(stuckProperty).not.toBeNull();
  });

  it('resolveStuckAuction recovers a crashed settlement: cancelled, reservations released, property kept', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user } = await makeBidder('crash_bidder');
    const { property, auction } = await makeLifecycleAuction({
      city,
      currentBid: 50000,
      currentBidderId: user._id,
      bids: [bidEntry(user, 50000)],
      endTick: 9,
    });
    await AuctionReservation.create({ userId: user._id, auctionId: auction._id, amount: 50000 });

    // The winner path writes the property first; a failure there crashes
    // settlement AFTER the claim, exactly like a transient DB error.
    const spy = vi.spyOn(Property.prototype, 'save').mockRejectedValueOnce(new Error('simulated db failure'));

    try {
      await resolveStuckAuction(auction._id);
    } finally {
      spy.mockRestore();
    }

    const recovered = await Auction.findById(auction._id);
    expect(recovered.status).toBe('cancelled');
    expect(recovered.winnerId).toBeNull();
    expect(recovered.currentBidderId).toBeNull();
    // Funds must never stay tied to an unsettled auction.
    expect(await AuctionReservation.countDocuments({ auctionId: auction._id })).toBe(0);
    // The property is kept for reconciliation (crash may have been partial).
    expect(await Property.findById(property._id)).not.toBeNull();
    // No winner notification was sent for a settlement that never completed.
    expect(await Notification.countDocuments({ eventKey: `auction:${auction._id}:won:${user._id}` })).toBe(0);
  });

  it('insufficient funds -> winner and other bidders are both notified; settledAt stamped', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const winner = await makeBidder('broke_winner_2', 100);
    const outbid = await makeBidder('outbid_loser');
    const { auction } = await makeLifecycleAuction({
      city,
      currentBid: 90000,
      currentBidderId: winner.user._id,
      bids: [bidEntry(winner.user, 90000), bidEntry(outbid.user, 50000)],
      endTick: 10,
    });

    await processAuctions();

    const settled = await Auction.findById(auction._id);
    expect(settled.status).toBe('cancelled');
    expect(settled.settledAt).toBe(10);

    expect(
      await Notification.countDocuments({
        userId: winner.user._id,
        eventKey: `auction:${auction._id}:insufficient_funds:${winner.user._id}`,
      }),
    ).toBe(1);
    expect(
      await Notification.countDocuments({
        userId: outbid.user._id,
        eventKey: `auction:${auction._id}:no_winner:${outbid.user._id}`,
      }),
    ).toBe(1);
  });
});
