import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import Loan from '../../models/Loan.js';
import Transaction from '../../models/Transaction.js';
import Season from '../../models/Season.js';
import LeaderboardSnapshot from '../../models/LeaderboardSnapshot.js';
import Company from '../../models/Company.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import { computeLeaderboards, computeCategoryValue } from '../leaderboard.js';

async function makeUser(name, balance = 0) {
  return User.create({
    username: name,
    normalizedUsername: name.toLowerCase(),
    email: `${name}@test.com`,
    password: 'password123',
    role: 'user',
    balance,
  });
}

async function makeProperty(userId, overrides = {}) {
  return Property.create({
    cityId: new mongoose.Types.ObjectId(),
    ownerId: userId,
    type: 'apartment',
    name: `Prop-${userId.toString().slice(0, 6)}`,
    basePrice: 100000,
    currentPrice: 100000,
    rent: 0,
    ...overrides,
  });
}

async function makeLoan(userId, remainingBalance, paymentPerTick = 0) {
  return Loan.create({
    userId,
    principal: remainingBalance,
    remainingBalance,
    interestRate: 0.05,
    durationTicks: 12,
    ticksRemaining: 12,
    paymentPerTick,
    active: true,
  });
}

describe('computeLeaderboards', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await Loan.deleteMany({});
    await Transaction.deleteMany({});
    await Season.deleteMany({});
    await LeaderboardSnapshot.deleteMany({});
    await Company.deleteMany({});
    await RealEstateCompany.deleteMany({});
    await Season.create({ number: 1, status: 'active' });
  });

  it('creates snapshots for all 13 categories including IPO categories', async () => {
    await makeUser('allcats');
    await computeLeaderboards(6);

    const categories = await LeaderboardSnapshot.find().distinct('category');
    expect(categories.sort()).toEqual(
      [
        'netWorth',
        'properties',
        'passiveIncome',
        'dealVolume',
        'cityInfluence',
        'companyNetWorth',
        'companyProperties',
        'companyIncome',
        'companyReputation',
        'companyGrowth',
        'ipoMarketCap',
        'ipoDividendYield',
        'ipoPriceGrowth',
      ].sort(),
    );
  });

  it('breaks net-worth ties deterministically by user id', async () => {
    const a = await makeUser('tiea', 50000);
    const b = await makeUser('tieb', 50000);

    await computeLeaderboards(6);

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'netWorth', seasonNumber: 1 });
    expect(snapshot.rankings).toHaveLength(2);

    const [first, second] = snapshot.rankings;
    const firstId = first.userId.toString();
    expect(first.value).toBe(50000);
    expect(second.value).toBe(50000);
    expect(first.rank).toBe(1);
    expect(second.rank).toBe(2);
    // deterministic: lower _id ranks first
    expect(a._id.toString() < b._id.toString() ? firstId === a._id.toString() : firstId === b._id.toString()).toBe(
      true,
    );
    expect(new Set(snapshot.rankings.map((r) => r.userId.toString())).size).toBe(2);
  });

  it('subtracts active loan debt from net worth', async () => {
    const rich = await makeUser('rich', 100000);
    const debtor = await makeUser('debtor', 100000);
    await makeLoan(debtor._id, 40000);

    await computeLeaderboards(6);

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'netWorth', seasonNumber: 1 });
    const richEntry = snapshot.rankings.find((r) => r.userId.toString() === rich._id.toString());
    const debtorEntry = snapshot.rankings.find((r) => r.userId.toString() === debtor._id.toString());

    expect(richEntry.value).toBe(100000);
    expect(debtorEntry.value).toBe(60000);
    expect(richEntry.rank).toBe(1);
    expect(debtorEntry.rank).toBe(2);
  });

  it('subtracts loan payments from authoritative passive income', async () => {
    const owner = await makeUser('passive', 0);
    const loaned = await makeUser('loaned', 0);

    // occupancy 100, no maintenance tier -> gross 10000, apartment operating 2%
    await makeProperty(owner._id, { rent: 10000, occupancy: 100, maintenanceLevel: 'none' });
    await makeProperty(loaned._id, { rent: 10000, occupancy: 100, maintenanceLevel: 'none' });
    await makeLoan(loaned._id, 100000, 2000);

    await computeLeaderboards(6);

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'passiveIncome', seasonNumber: 1 });
    const ownerEntry = snapshot.rankings.find((r) => r.userId.toString() === owner._id.toString());
    const loanedEntry = snapshot.rankings.find((r) => r.userId.toString() === loaned._id.toString());

    expect(ownerEntry.value).toBe(9800); // 10000 - 200 operating
    expect(loanedEntry.value).toBe(7800); // 9800 - 2000 loan payment
    expect(ownerEntry.rank).toBe(1);
    expect(loanedEntry.rank).toBe(2);
  });

  it('merges buy and sell volumes per user without duplicates', async () => {
    const user = await makeUser('trader', 0);

    await Transaction.create({ buyerId: user._id, price: 10000, type: 'buy' });
    await Transaction.create({ buyerId: user._id, price: 20000, type: 'buy' });
    await Transaction.create({ sellerId: user._id, price: 15000, type: 'sell' });

    await computeLeaderboards(6);

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'dealVolume', seasonNumber: 1 });
    expect(snapshot.rankings).toHaveLength(1);
    expect(snapshot.rankings[0].userId.toString()).toBe(user._id.toString());
    expect(snapshot.rankings[0].value).toBe(45000);
  });

  it('rank change is computed against the previous snapshot', async () => {
    await makeUser('mov1', 1000);
    await makeUser('mov2', 500);
    await computeLeaderboards(6);

    const snap1 = await LeaderboardSnapshot.findOne({ category: 'netWorth', seasonNumber: 1 });
    expect(snap1.rankings[0].previousRank).toBeNull();

    // invert scores — mov2 now richer
    await User.updateOne({ username: 'mov1' }, { $set: { balance: 100 } });
    await User.updateOne({ username: 'mov2' }, { $set: { balance: 900 } });
    await computeLeaderboards(12);

    const snap2 = await LeaderboardSnapshot.findOne({ category: 'netWorth', seasonNumber: 1 }).sort({ tickNumber: -1 });
    const mov1 = snap2.rankings.find((r) => r.username === 'mov1');
    const mov2 = snap2.rankings.find((r) => r.username === 'mov2');

    expect(mov1.rank).toBe(2);
    expect(mov1.previousRank).toBe(1);
    expect(mov1.rankChange).toBe(-1);
    expect(mov2.rank).toBe(1);
    expect(mov2.previousRank).toBe(2);
    expect(mov2.rankChange).toBe(1);
  });

  it('dealVolume survives company purchases with a null buyerId (production freeze regression)', async () => {
    const user = await makeUser('trader2', 0);
    // Company/system buy transactions carry buyerId null — this crashed the
    // whole dealVolume computation (snapshot frozen for ~24 days in prod).
    await Transaction.create({ companyId: new mongoose.Types.ObjectId(), price: 500000, type: 'buy', buyerId: null });
    await Transaction.create({ buyerId: user._id, price: 25000, type: 'buy' });
    await Transaction.create({ sellerId: user._id, price: 10000, type: 'sell' });

    await computeLeaderboards(6);

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'dealVolume', seasonNumber: 1 });
    expect(snapshot).toBeTruthy();
    expect(snapshot.rankings).toHaveLength(1);
    expect(snapshot.rankings[0].userId.toString()).toBe(user._id.toString());
    expect(snapshot.rankings[0].value).toBe(35000);
  });

  it('company categories compute rank changes without crashing (applyRankChanges userId regression)', async () => {
    const re = await RealEstateCompany.create({
      name: `LBCo_${Date.now()}`,
      founderId: new mongoose.Types.ObjectId(),
      members: [],
      treasury: { balance: 500000, transactions: [] },
      stats: { propertiesOwned: 3, totalRentalIncome: 12000 },
      reputation: 50,
      level: 5,
      xp: 120,
      active: true,
    });

    await computeLeaderboards(6);
    await computeLeaderboards(12); // rank-change pass must not throw on companyId entries

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'companyNetWorth', seasonNumber: 1 });
    expect(snapshot).toBeTruthy();
    expect(snapshot.rankings).toHaveLength(1);
    expect(snapshot.rankings[0].companyId.toString()).toBe(re._id.toString());
    expect(snapshot.rankings[0].value).toBe(500000);
    expect(typeof snapshot.rankings[0].rank).toBe('number');
    expect(snapshot.rankings[0].previousRank).toBeNull();

    const growth = await LeaderboardSnapshot.findOne({ category: 'companyGrowth', seasonNumber: 1 });
    expect(growth).toBeTruthy();
    // The pre-save hook recomputes xp from level, so derive the expectation
    // from the persisted company rather than the input values.
    const persisted = await RealEstateCompany.findById(re._id);
    const expectedGrowth = Math.round(
      (persisted.level - 1) * 100 +
        (persisted.xp || 0) * 0.1 +
        (persisted.reputation || 0) * 0.5 +
        (persisted.stats?.propertiesOwned || 0) * 50,
    );
    expect(growth.rankings[0].value).toBe(expectedGrowth);
  });

  it('passiveIncome uses the authoritative occupancy-adjusted net income (not raw rent)', async () => {
    const owner = await makeUser('occ', 0);
    // 50% occupancy, standard maintenance (25% of rent), apartment operating (2%)
    await makeProperty(owner._id, { rent: 10000, occupancy: 50, maintenanceLevel: 'standard' });

    await computeLeaderboards(6);

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'passiveIncome', seasonNumber: 1 });
    const entry = snapshot.rankings.find((r) => r.userId.toString() === owner._id.toString());
    // occupancy-adjusted gross = 5000; maintenance = 1250; operating = 100
    expect(entry.value).toBe(3650);
    // raw-rent formula (10000 - 0 maintenanceCost) would have been 10000 — never that
    expect(entry.value).not.toBe(10000);
  });

  it('ipoPriceGrowth includes negative performers instead of dropping them', async () => {
    const hqCityId = new mongoose.Types.ObjectId();
    const rising = await Company.create({
      name: 'Riser',
      ticker: 'RISER',
      isIPO: true,
      active: true,
      industry: 'technology',
      hqCityId,
      totalReturn: 40,
      dayChangePercent: 2,
    });
    const falling = await Company.create({
      name: 'Faller',
      ticker: 'FALLR',
      isIPO: true,
      active: true,
      industry: 'technology',
      hqCityId,
      totalReturn: -15,
      dayChangePercent: -3,
    });

    await computeLeaderboards(6);

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'ipoPriceGrowth', seasonNumber: 1 });
    expect(snapshot.rankings).toHaveLength(2);
    expect(snapshot.rankings[0].companyId.toString()).toBe(rising._id.toString());
    expect(snapshot.rankings[1].companyId.toString()).toBe(falling._id.toString());
    expect(snapshot.rankings[1].value).toBe(-15);
  });

  it('soft-deleted users are excluded from net worth and properties rankings', async () => {
    const active = await makeUser('alive', 100000);
    const ghost = await makeUser('ghost', 200000);
    await User.updateOne({ _id: ghost._id }, { $set: { deletedAt: new Date() } });
    await makeProperty(ghost._id, { currentPrice: 500000 });
    await makeProperty(active._id, { currentPrice: 100000 });

    await computeLeaderboards(6);

    const nw = await LeaderboardSnapshot.findOne({ category: 'netWorth', seasonNumber: 1 });
    const ids = nw.rankings.map((r) => r.userId.toString());
    expect(ids).toContain(active._id.toString());
    expect(ids).not.toContain(ghost._id.toString());

    const props = await LeaderboardSnapshot.findOne({ category: 'properties', seasonNumber: 1 });
    const propIds = props.rankings.map((r) => r.userId.toString());
    expect(propIds).not.toContain(ghost._id.toString());
  });

  it('computeCategoryValue returns the authoritative live value for missing players', async () => {
    const user = await makeUser('live', 50000);
    const prop = await makeProperty(user._id, {
      currentPrice: 250000,
      rent: 8000,
      occupancy: 100,
      maintenanceLevel: 'none',
    });
    // The snapshot metric derives from the user's ownedProperties array.
    await User.updateOne({ _id: user._id }, { $set: { ownedProperties: [prop._id] } });
    await makeLoan(user._id, 10000);

    expect(await computeCategoryValue('netWorth', user._id)).toBe(290000); // 50000 + 250000 - 10000
    expect(await computeCategoryValue('properties', user._id)).toBe(1);
    expect(await computeCategoryValue('passiveIncome', user._id)).toBe(7840); // 8000 - 160 operating (apartment 2%)
  });

  it('netWorth live value matches the snapshot metric (ownedProperties source, not ownerId)', async () => {
    const user = await makeUser('drift', 50000);
    await makeProperty(user._id, { currentPrice: 250000 });
    // Simulate ownedProperties drift: a property owned via ownerId but missing
    // from the user's array. The snapshot counts only the array — the live
    // value must match the snapshot, not the ownerId query.
    await User.updateOne({ _id: user._id }, { $set: { ownedProperties: [] } });
    await computeLeaderboards(6);

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'netWorth', seasonNumber: 1 });
    const entry = snapshot.rankings.find((r) => r.userId.toString() === user._id.toString());
    expect(entry.value).toBe(50000); // array empty -> only balance counted

    expect(await computeCategoryValue('netWorth', user._id)).toBe(50000);
    // Sanity: the ownerId-based count would have said 250000 — ensure the
    // snapshot and my-rank agree with each other regardless.
    expect(await Property.countDocuments({ ownerId: user._id })).toBe(1);
  });

  describe('partial snapshot failure safety (all-or-nothing)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('a failing category persists NO snapshot for any category that cycle', async () => {
      await makeUser('atomic', 5000);
      await computeLeaderboards(6);
      const tick6Count = await LeaderboardSnapshot.countDocuments({ tickNumber: 6 });
      expect(tick6Count).toBe(13);

      // One category blows up (e.g. an IPO computation failure).
      const spy = vi.spyOn(Company, 'find').mockImplementationOnce(() => {
        throw new Error('simulated IPO failure');
      });

      await computeLeaderboards(12);

      // All-or-nothing: nothing persisted at tick 12 — no mixed-state board.
      const tick12Count = await LeaderboardSnapshot.countDocuments({ tickNumber: 12 });
      expect(tick12Count).toBe(0);

      // Previous consistent snapshots remain intact.
      expect(await LeaderboardSnapshot.countDocuments({ tickNumber: 6 })).toBe(13);
      spy.mockRestore();
    });
  });
});
