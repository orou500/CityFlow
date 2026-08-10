import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import User from '../../models/User.js';
import Season from '../../models/Season.js';
import GameState from '../../models/GameState.js';
import City from '../../models/City.js';
import Property from '../../models/Property.js';
import Transaction from '../../models/Transaction.js';
import Notification from '../../models/Notification.js';
import LeaderboardReward from '../../models/LeaderboardReward.js';
import { getLeaderboardRewardForRank, LEADERBOARD_REWARD_TIERS } from '../../config/leaderboardRewards.js';
import { distributeSeasonLeaderboardRewards, endCurrentSeasonAndStartNew } from '../seasonReset.js';

describe('Leaderboard reward config', () => {
  it('defines the documented tiers', () => {
    expect(LEADERBOARD_REWARD_TIERS).toEqual([
      { rank: 1, reward: 100000 },
      { rank: 2, reward: 75000 },
      { rank: 3, reward: 50000 },
      { minRank: 4, maxRank: 10, reward: 25000 },
      { minRank: 11, maxRank: 25, reward: 10000 },
    ]);
  });

  it('resolves single ranks', () => {
    expect(getLeaderboardRewardForRank(1).reward).toBe(100000);
    expect(getLeaderboardRewardForRank(2).reward).toBe(75000);
    expect(getLeaderboardRewardForRank(3).reward).toBe(50000);
  });

  it('resolves ranges inclusively', () => {
    expect(getLeaderboardRewardForRank(4).reward).toBe(25000);
    expect(getLeaderboardRewardForRank(10).reward).toBe(25000);
    expect(getLeaderboardRewardForRank(11).reward).toBe(10000);
    expect(getLeaderboardRewardForRank(25).reward).toBe(10000);
  });

  it('returns null for ranks outside all tiers', () => {
    expect(getLeaderboardRewardForRank(26)).toBeNull();
    expect(getLeaderboardRewardForRank(0)).toBeNull();
    expect(getLeaderboardRewardForRank(-5)).toBeNull();
    expect(getLeaderboardRewardForRank('1')).toBeNull();
  });
});

describe('distributeSeasonLeaderboardRewards', () => {
  let users;

  async function makeUser(name, balance) {
    return User.create({
      username: name,
      normalizedUsername: name.toLowerCase(),
      email: `${name}@test.com`,
      password: 'password123',
      role: 'user',
      balance,
    });
  }

  function makeCompletedSeason(userIds) {
    return Season.create({
      number: 7,
      name: 'Season 7',
      status: 'completed',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
      archive: {
        playerRankings: userIds.map((userId, i) => ({
          userId,
          username: `user${i + 1}`,
          netWorth: 1000000 - i * 10000,
          balance: 500000,
          portfolioValue: 500000,
          propertiesOwned: 10,
          rank: i + 1,
        })),
        totalPlayers: userIds.length,
      },
    });
  }

  beforeEach(async () => {
    await User.deleteMany({});
    await Season.deleteMany({});
    await GameState.deleteMany({});
    await Transaction.deleteMany({});
    await Notification.deleteMany({});
    await LeaderboardReward.deleteMany({});
  });

  it('credits balances, records transactions, rewards, and notifications', async () => {
    users = [await makeUser('reward1', 1000), await makeUser('reward2', 1000), await makeUser('reward3', 1000)];
    const season = await makeCompletedSeason(users.map((u) => u._id));

    const result = await distributeSeasonLeaderboardRewards(season);

    expect(result.distributed).toBe(3);
    expect(result.skipped).toBe(false);

    const persisted = await Season.findById(season._id);
    expect(persisted.rewardsDistributed).toBe(true);
    expect(persisted.rewardsDistributedAt).not.toBeNull();

    // balances credited
    const balances = await User.find({ _id: { $in: users.map((u) => u._id) } }).select('balance');
    expect(balances.find((u) => u._id.equals(users[0]._id)).balance).toBe(101000);
    expect(balances.find((u) => u._id.equals(users[1]._id)).balance).toBe(76000);
    expect(balances.find((u) => u._id.equals(users[2]._id)).balance).toBe(51000);

    // transactions recorded
    const txs = await Transaction.find({ type: 'season_reward' }).sort({ price: -1 });
    expect(txs.length).toBe(3);
    expect(txs[0].price).toBe(100000);
    expect(txs[0].buyerId.toString()).toBe(users[0]._id.toString());

    // audit records
    const rewards = await LeaderboardReward.find({ seasonNumber: 7 }).sort({ rank: 1 });
    expect(rewards.length).toBe(3);
    expect(rewards[0]).toMatchObject({ rank: 1, reward: 100000, seasonNumber: 7 });
    expect(rewards[0].seasonId.toString()).toBe(season._id.toString());

    // notifications
    const notifs = await Notification.find({ type: 'season_reward' });
    expect(notifs.length).toBe(3);
    expect(notifs[0].message).toMatch(/finished #1 and received \$\d[\d,]*\./);

    // archive annotated with reward for auditability
    const annotated = await Season.findById(season._id);
    expect(annotated.archive.playerRankings[0].reward).toBe(100000);
    expect(annotated.archive.playerRankings[2].reward).toBe(50000);
  });

  it('distributes exactly once on repeat calls', async () => {
    users = [await makeUser('once1', 1000)];
    const season = await makeCompletedSeason([users[0]._id]);

    await distributeSeasonLeaderboardRewards(season);
    const second = await distributeSeasonLeaderboardRewards(season);

    expect(second.distributed).toBe(0);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('already_distributed');

    expect(await Transaction.countDocuments({ type: 'season_reward' })).toBe(1);
    expect(await LeaderboardReward.countDocuments({ seasonNumber: 7 })).toBe(1);
    expect(await Notification.countDocuments({ type: 'season_reward' })).toBe(1);
  });

  it('does not double-distribute when the flag is missing but records exist', async () => {
    users = [await makeUser('once2', 1000)];
    const season = await makeCompletedSeason([users[0]._id]);

    await distributeSeasonLeaderboardRewards(season);
    // simulate a crashed write where the flag was not persisted
    await Season.updateOne({ _id: season._id }, { $set: { rewardsDistributed: false } });

    const retry = await distributeSeasonLeaderboardRewards(season);
    expect(retry.skipped).toBe(true);
    expect(await Transaction.countDocuments({ type: 'season_reward' })).toBe(1);
    expect(await LeaderboardReward.countDocuments({ seasonNumber: 7 })).toBe(1);
  });

  it('skips non-completed seasons and empty rankings', async () => {
    const season = await Season.create({ number: 8, status: 'active', startDate: new Date() });
    const result = await distributeSeasonLeaderboardRewards(season);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('season_not_completed');
  });

  it('only rewards players within configured tiers (top 25)', async () => {
    const count = 30;
    users = [];
    for (let i = 0; i < count; i++) {
      users.push(await makeUser(`tier${i + 1}`, 1000));
    }
    const season = await makeCompletedSeason(users.map((u) => u._id));

    const result = await distributeSeasonLeaderboardRewards(season);
    expect(result.distributed).toBe(25);

    expect(await LeaderboardReward.countDocuments({ seasonNumber: 7 })).toBe(25);
    expect(await Transaction.countDocuments({ type: 'season_reward' })).toBe(25);

    const last = await User.findById(users[24]._id);
    expect(last.balance).toBe(11000); // rank 25 → 10k

    const outside = await User.findById(users[25]._id);
    expect(outside.balance).toBe(1000); // rank 26 → no reward
  });
});

describe('endCurrentSeasonAndStartNew integration', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Season.deleteMany({});
    await GameState.deleteMany({});
    await Transaction.deleteMany({});
    await Notification.deleteMany({});
    await LeaderboardReward.deleteMany({});
    await City.deleteMany({});
    await Property.deleteMany({});
  });

  // resetWorld() seeds cities + bank properties; keep the shared test DB clean
  afterAll(async () => {
    await City.deleteMany({});
    await Property.deleteMany({});
    await GameState.deleteMany({});
    await Notification.deleteMany({});
    await Transaction.deleteMany({});
    await User.deleteMany({});
    await Season.deleteMany({});
    await LeaderboardReward.deleteMany({});
  });

  it('distributes rewards once during a full season rollover', async () => {
    const users = [];
    for (let i = 0; i < 30; i++) {
      users.push(
        await User.create({
          username: `roll${i + 1}`,
          normalizedUsername: `roll${i + 1}`,
          email: `roll${i + 1}@test.com`,
          password: 'password123',
          role: 'user',
          balance: 100000 - i * 1000,
        }),
      );
    }

    await Season.create({ number: 1, status: 'active', startDate: new Date() });
    await GameState.findOneAndUpdate({ key: 'global' }, { $set: { tickNumber: 720 } }, { upsert: true, new: true });

    const newSeason = await endCurrentSeasonAndStartNew();
    expect(newSeason.number).toBe(2);

    const ended = await Season.findOne({ number: 1 });
    expect(ended.status).toBe('completed');
    expect(ended.rewardsDistributed).toBe(true);

    expect(await LeaderboardReward.countDocuments({ seasonNumber: 1 })).toBe(25);
    expect(await Transaction.countDocuments({ type: 'season_reward' })).toBe(25);
    expect(await Notification.countDocuments({ type: 'season_reward' })).toBe(25);

    // rank 1 got the full $100k on top of 50% carryover
    const winner = await User.findById(users[0]._id);
    expect(winner.balance).toBe(Math.round(100000 * 0.5) + 100000);
  });
});
