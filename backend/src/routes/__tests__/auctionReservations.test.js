import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader, setTestTick } from '../../test/helpers.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import Auction from '../../models/Auction.js';
import AuctionReservation from '../../models/AuctionReservation.js';
import AuctionReputation from '../../models/AuctionReputation.js';
import { processAuctions } from '../../engine/auctionProcessing.js';

const app = createApp();

async function makeUser(name, balance = 100000) {
  const { user, token } = await createAuthenticatedUser({ balance });
  user.balance = balance;
  return { user, token };
}

async function makeAuction({ city, sellerId = null, sellerType = 'bank', status = 'active', endTick = 50 } = {}) {
  const property = await Property.create({
    cityId: city._id,
    name: `AuctionProp_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: 100000,
    currentPrice: 100000,
    forSale: true,
  });
  return Auction.create({
    propertyId: property._id,
    sellerId,
    sellerType,
    auctionType: 'standard',
    startingBid: 1000,
    currentBid: 0,
    currentBidderId: null,
    bidIncrement: 100,
    status,
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
  await setTestTick(10);
  await User.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
  await Auction.deleteMany({});
  await AuctionReservation.deleteMany({});
  await AuctionReputation.deleteMany({});
});

afterAll(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
  await Auction.deleteMany({});
  await AuctionReservation.deleteMany({});
  await AuctionReputation.deleteMany({});
});

describe('Auction bid money reservation', () => {
  it('reserves funds on a successful bid without removing them from balance', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeUser('bidder1');
    const auction = await makeAuction({ city });

    const res = await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 40000 });
    expect(res.status).toBe(200);
    expect(res.body.reservedAuctionFunds).toBe(40000);
    expect(res.body.availableBalance).toBe(60000);

    const updated = await User.findById(user._id);
    expect(updated.balance).toBe(100000); // money stays in balance
    expect(updated.reservedAuctionFunds).toBe(40000);

    const reservation = await AuctionReservation.findOne({ userId: user._id, auctionId: auction._id });
    expect(reservation).not.toBeNull();
    expect(reservation.amount).toBe(40000);
  });

  it('rejects a bid when available funds are insufficient', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeUser('poor', 30000);
    const auction = await makeAuction({ city });

    const res = await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 40000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/don't have enough available funds/i);

    const updated = await User.findById(user._id);
    expect(updated.reservedAuctionFunds).toBe(0);
    expect(updated.balance).toBe(30000);
  });

  it('rejects a bid when funds are tied up in another reservation', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { token } = await makeUser('tied', 100000);
    const auctionA = await makeAuction({ city });
    const auctionB = await makeAuction({ city });

    await request(app).post(`/auctions/${auctionA._id}/bid`).set(authHeader(token)).send({ amount: 80000 });
    const res = await request(app).post(`/auctions/${auctionB._id}/bid`).set(authHeader(token)).send({ amount: 40000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/enough available funds/i);
  });

  it('only reserves the delta when a user raises their own bid', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeUser('raiser', 100000);
    const auction = await makeAuction({ city });

    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 40000 });
    const res = await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 50000 });
    expect(res.status).toBe(200);

    const updated = await User.findById(user._id);
    expect(updated.reservedAuctionFunds).toBe(50000); // not 90000

    const reservation = await AuctionReservation.findOne({ userId: user._id, auctionId: auction._id });
    expect(reservation.amount).toBe(50000);
  });

  it('releases the previous bidder reservation immediately when outbid', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user: userA, token: tokenA } = await makeUser('outbidA');
    const { user: userB, token: tokenB } = await makeUser('outbidB');
    const auction = await makeAuction({ city });

    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(tokenA)).send({ amount: 40000 });
    const res = await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(tokenB)).send({ amount: 50000 });
    expect(res.status).toBe(200);

    const userAAfter = await User.findById(userA._id);
    const userBAfter = await User.findById(userB._id);
    expect(userAAfter.reservedAuctionFunds).toBe(0);
    expect(userBAfter.reservedAuctionFunds).toBe(50000);
    expect(await AuctionReservation.countDocuments({ userId: userA._id, auctionId: auction._id })).toBe(0);
    expect(await AuctionReservation.countDocuments({ userId: userB._id, auctionId: auction._id })).toBe(1);
  });

  it('handles simultaneous bids by different users without double-spending', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user: userA, token: tokenA } = await makeUser('simA', 100000);
    const { user: userB, token: tokenB } = await makeUser('simB', 100000);
    const auction = await makeAuction({ city });

    await Promise.all([
      request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(tokenA)).send({ amount: 40000 }),
      request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(tokenB)).send({ amount: 45000 }),
    ]);

    const final = await Auction.findById(auction._id);
    // The higher bid always ends up winning the race: if 40k lands first, the
    // 45k retry clears the new minimum (40k + increment). If 45k lands first,
    // the 40k retry is rejected for being below the minimum — so totalBids is
    // either 1 or 2, but the final state is always the 45k bid by userB.
    expect(final.currentBid).toBe(45000);
    expect(final.currentBidderId.toString()).toBe(userB._id.toString());
    expect(final.totalBids).toBeGreaterThanOrEqual(1);

    // Exactly one user holds funds: the highest bidder, for exactly the
    // current bid amount. No money is double-spent or left stuck.
    const reservations = await AuctionReservation.find({ auctionId: auction._id }).lean();
    expect(reservations.length).toBe(1);
    expect(reservations[0].amount).toBe(45000);

    const userAAfter = await User.findById(userA._id);
    const userBAfter = await User.findById(userB._id);
    expect(userAAfter.reservedAuctionFunds).toBe(0);
    expect(userBAfter.reservedAuctionFunds).toBe(45000);
    expect(userBAfter.balance).toBe(100000); // balance untouched, funds reserved

    const allUsers = await User.find({}).lean();
    for (const u of allUsers) {
      expect(u.reservedAuctionFunds).toBeLessThanOrEqual(u.balance);
    }
  });

  it('does not leave stuck money after concurrent self-raises', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeUser('selfrace', 100000);
    const auction = await makeAuction({ city });

    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 40000 });
    const [r1, r2] = await Promise.all([
      request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 50000 }),
      request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 55000 }),
    ]);
    // at least one of the raises must succeed
    expect(r1.status === 200 || r2.status === 200).toBe(true);

    const reservation = await AuctionReservation.findOne({ userId: user._id, auctionId: auction._id }).lean();
    const updated = await User.findById(user._id);
    expect(updated.reservedAuctionFunds).toBe(reservation.amount);

    // outbid by another user releases everything
    const { token: tokenB } = await makeUser('savior', 1000000);
    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(tokenB)).send({ amount: 60000 });
    const after = await User.findById(user._id);
    expect(after.reservedAuctionFunds).toBe(0);
  });

  it('converts the winner reservation into the payment at settlement', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeUser('winner', 100000);
    const auction = await makeAuction({ city, endTick: 15 });

    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 40000 });

    await setTestTick(16);
    await processAuctions();

    const updated = await User.findById(user._id);
    expect(updated.balance).toBe(60000);
    expect(updated.reservedAuctionFunds).toBe(0);
    expect(await AuctionReservation.countDocuments({ auctionId: auction._id })).toBe(0);

    const settled = await Auction.findById(auction._id);
    expect(settled.winnerId.toString()).toBe(user._id.toString());

    const property = await Property.findById(auction.propertyId);
    expect(property.ownerId.toString()).toBe(user._id.toString());
    expect(property.forSale).toBe(false);
  });

  it('releases all reservations when the winner can no longer pay', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeUser('flaker', 100000);
    const auction = await makeAuction({ city, endTick: 15 });

    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 40000 });

    // Simulate the winner spending their balance elsewhere
    await User.updateOne({ _id: user._id }, { $set: { balance: 500 } });

    await setTestTick(16);
    await processAuctions();

    const updated = await User.findById(user._id);
    expect(updated.reservedAuctionFunds).toBe(0);
    expect(await AuctionReservation.countDocuments({ auctionId: auction._id })).toBe(0);

    const settled = await Auction.findById(auction._id);
    expect(settled.status).toBe('cancelled');
  });

  it('releases reservations when a claimed-but-unsettled ending auction is reconciled as cancelled', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { user, token } = await makeUser('stuck', 100000);
    const auction = await makeAuction({ city });

    await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 40000 });

    await Auction.updateOne({ _id: auction._id }, { $set: { status: 'ending', endingStartedAt: 0 } });
    await setTestTick(30);
    await processAuctions();

    const updated = await User.findById(user._id);
    expect(updated.reservedAuctionFunds).toBe(0);
    expect(await AuctionReservation.countDocuments({ auctionId: auction._id })).toBe(0);
    const stuck = await Auction.findById(auction._id);
    // A claimed-but-never-settled auction must never be silently recorded as
    // 'ended' without a settlement outcome — the stuck-ending recovery
    // cancels it (and releases reservations) instead.
    expect(stuck.status).toBe('cancelled');
  });
});

describe('Auction city ownership limits', () => {
  it('rejects a bid when the user already owns the maximum in the city', async () => {
    const city = await createTestCity({ propertyCount: 20 }); // limit = max(1, floor(20*0.05)) = 1
    const { user, token } = await makeUser('atLimit', 1000000);
    await Property.create({
      cityId: city._id,
      ownerId: user._id,
      name: 'Owned Prop',
      type: 'apartment',
      basePrice: 1000,
      currentPrice: 1000,
    });
    const auction = await makeAuction({ city });

    const res = await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already control the maximum number of properties/i);
  });

  it('rejects a bid that would exceed the limit, counting other auctions the user currently wins', async () => {
    const city = await createTestCity({ propertyCount: 20 }); // limit = 1
    const { token } = await makeUser('pending', 1000000);
    const auctionA = await makeAuction({ city });
    const auctionB = await makeAuction({ city });

    // Win auction A (pending)
    const first = await request(app)
      .post(`/auctions/${auctionA._id}/bid`)
      .set(authHeader(token))
      .send({ amount: 5000 });
    expect(first.status).toBe(200);

    // Bidding on auction B in the same city must now be rejected
    const second = await request(app)
      .post(`/auctions/${auctionB._id}/bid`)
      .set(authHeader(token))
      .send({ amount: 5000 });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/ownership limit/i);
  });

  it('allows the user to bid when not at the limit', async () => {
    const city = await createTestCity({ propertyCount: 200 }); // limit = 10
    const { token } = await makeUser('ok', 1000000);
    const auction = await makeAuction({ city });

    const res = await request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(token)).send({ amount: 5000 });
    expect(res.status).toBe(200);
  });

  it('returns clear errors for invalid auction states', async () => {
    const city = await createTestCity({ propertyCount: 200 });
    const { token } = await makeUser('states', 1000000);
    const ended = await makeAuction({ city, status: 'ending', endTick: 10 });

    const res = await request(app).post(`/auctions/${ended._id}/bid`).set(authHeader(token)).send({ amount: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no longer active/i);
  });
});
