import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import Loan from '../../models/Loan.js';
import Transaction from '../../models/Transaction.js';
import Season from '../../models/Season.js';
import LeaderboardSnapshot from '../../models/LeaderboardSnapshot.js';
import Company from '../../models/Company.js';
import { computeLeaderboards } from '../leaderboard.js';

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

  it('subtracts loan payments from passive income', async () => {
    const owner = await makeUser('passive', 0);
    const loaned = await makeUser('loaned', 0);

    await makeProperty(owner._id, { rent: 10000, maintenanceCost: 1000 });
    await makeProperty(loaned._id, { rent: 10000, maintenanceCost: 1000 });
    await makeLoan(loaned._id, 100000, 2000);

    await computeLeaderboards(6);

    const snapshot = await LeaderboardSnapshot.findOne({ category: 'passiveIncome', seasonNumber: 1 });
    const ownerEntry = snapshot.rankings.find((r) => r.userId.toString() === owner._id.toString());
    const loanedEntry = snapshot.rankings.find((r) => r.userId.toString() === loaned._id.toString());

    expect(ownerEntry.value).toBe(9000);
    expect(loanedEntry.value).toBe(7000);
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
});
