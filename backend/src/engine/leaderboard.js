import User from '../models/User.js';
import Property from '../models/Property.js';
import Loan from '../models/Loan.js';
import Transaction from '../models/Transaction.js';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';
import CompetitiveEvent from '../models/CompetitiveEvent.js';
import Season from '../models/Season.js';
import { sendDiscordNotification } from '../services/discordBot.js';

const CATEGORIES = ['netWorth', 'properties', 'passiveIncome', 'dealVolume', 'cityInfluence'];

const UPCOMING_LEAD_TICKS = 12;
const COMPLETED_RETENTION_TICKS = 28;

const EVENT_TEMPLATES = [
  {
    name: 'Wealth Championship',
    description: 'Rise to the top by accumulating the greatest net worth.',
    type: 'wealth',
    metric: 'netWorth',
    durationTicks: 60,
    rewards: {
      first: { type: 'title', value: 'Top Investor', bonus: { type: 'balance', value: 100000 } },
      second: { type: 'badge', value: 'Silver Investor', bonus: { type: 'balance', value: 50000 } },
      third: { type: 'badge', value: 'Bronze Investor', bonus: { type: 'balance', value: 25000 } },
      participation: { type: 'achievement', value: 'Wealth Challenger', bonus: { type: 'xp', value: 50 } },
    },
  },
  {
    name: 'Property Mogul',
    description: 'Acquire the most properties to win this expansion race.',
    type: 'expansion',
    metric: 'propertiesAcquired',
    durationTicks: 48,
    rewards: {
      first: { type: 'title', value: 'Property Mogul', bonus: { type: 'balance', value: 80000 } },
      second: { type: 'badge', value: 'Real Estate Baron', bonus: { type: 'balance', value: 40000 } },
      third: { type: 'badge', value: 'Property Pioneer', bonus: { type: 'balance', value: 20000 } },
      participation: { type: 'achievement', value: 'Expansion Runner', bonus: { type: 'xp', value: 40 } },
    },
  },
  {
    name: 'Passive Income Masters',
    description: 'Build the highest monthly passive income stream.',
    type: 'income',
    metric: 'passiveIncome',
    durationTicks: 48,
    rewards: {
      first: { type: 'title', value: 'Income Titan', bonus: { type: 'balance', value: 75000 } },
      second: { type: 'badge', value: 'Cash Flow King', bonus: { type: 'balance', value: 35000 } },
      third: { type: 'badge', value: 'Rent Wizard', bonus: { type: 'balance', value: 18000 } },
      participation: { type: 'achievement', value: 'Income Seeker', bonus: { type: 'xp', value: 40 } },
    },
  },
  {
    name: 'City Builder Challenge',
    description: 'Develop your properties and dominate city influence.',
    type: 'development',
    metric: 'cityInfluence',
    durationTicks: 60,
    rewards: {
      first: { type: 'title', value: 'City Builder', bonus: { type: 'balance', value: 90000 } },
      second: { type: 'badge', value: 'Urban Developer', bonus: { type: 'balance', value: 45000 } },
      third: { type: 'badge', value: 'City Planner', bonus: { type: 'balance', value: 22000 } },
      participation: { type: 'achievement', value: 'Development Enthusiast', bonus: { type: 'xp', value: 45 } },
    },
  },
  {
    name: 'Deal Maker Showdown',
    description: 'Accumulate the highest total deal volume to claim the crown.',
    type: 'wealth',
    metric: 'dealVolume',
    durationTicks: 42,
    rewards: {
      first: { type: 'title', value: 'Deal Maker', bonus: { type: 'balance', value: 60000 } },
      second: { type: 'badge', value: 'Sharp Buyer', bonus: { type: 'balance', value: 30000 } },
      third: { type: 'badge', value: 'Bargain Hunter', bonus: { type: 'balance', value: 15000 } },
      participation: { type: 'achievement', value: 'Deal Seeker', bonus: { type: 'xp', value: 35 } },
    },
  },
  {
    name: 'Empire Expansion Sprint',
    description: 'Quick sprint to acquire the most properties in a short time.',
    type: 'expansion',
    metric: 'propertiesAcquired',
    durationTicks: 28,
    rewards: {
      first: { type: 'title', value: 'Empire Builder', bonus: { type: 'balance', value: 40000 } },
      second: { type: 'badge', value: 'Fast Tracker', bonus: { type: 'balance', value: 20000 } },
      third: { type: 'badge', value: 'Speed Acquirer', bonus: { type: 'balance', value: 10000 } },
      participation: { type: 'achievement', value: 'Sprint Participant', bonus: { type: 'xp', value: 25 } },
    },
  },
  {
    name: 'Net Worth Surge',
    description: 'Grow your net worth the most during this period.',
    type: 'wealth',
    metric: 'netWorth',
    durationTicks: 42,
    rewards: {
      first: { type: 'title', value: 'Wealth Surge Champion', bonus: { type: 'balance', value: 50000 } },
      second: { type: 'badge', value: 'Rising Star', bonus: { type: 'balance', value: 25000 } },
      third: { type: 'badge', value: 'Growth Player', bonus: { type: 'balance', value: 12000 } },
      participation: { type: 'achievement', value: 'Growth Tracker', bonus: { type: 'xp', value: 30 } },
    },
  },
];

export async function generateCompetitiveEvents(tickNumber) {
  const activeEvents = await CompetitiveEvent.countDocuments({ status: 'active' });
  if (activeEvents >= 3) return [];

  const upcomingEvents = await CompetitiveEvent.countDocuments({ status: 'upcoming' });
  if (upcomingEvents >= 2) return [];

  const activeSeason = await Season.findOne({ status: 'active' });
  const seasonNumber = activeSeason ? activeSeason.number : 1;

  const recentEvents = await CompetitiveEvent.find({ createdFromSeason: seasonNumber })
    .sort({ createdAt: -1 })
    .limit(10);
  const recentNames = recentEvents.map((e) => e.name);

  const available = EVENT_TEMPLATES.filter((t) => !recentNames.includes(t.name));
  if (available.length === 0) return [];

  const template = available[Math.floor(Math.random() * available.length)];
  const startTick = tickNumber + UPCOMING_LEAD_TICKS;
  const endTick = startTick + template.durationTicks;

  let initialParticipants = [];
  let metricFn;
  switch (template.metric) {
    case 'netWorth':
    case 'netWorthGain':
      metricFn = computeNetWorthRankings;
      break;
    case 'propertiesAcquired':
      metricFn = computePropertyRankings;
      break;
    case 'passiveIncome':
      metricFn = computePassiveIncomeRankings;
      break;
    case 'dealVolume':
      metricFn = computeDealVolumeRankings;
      break;
    case 'cityInfluence':
      metricFn = computeCityInfluenceRankings;
      break;
  }
  if (metricFn) {
    try {
      const rankings = await metricFn();
      initialParticipants = rankings.slice(0, 50).map((r, i) => ({
        userId: r.userId,
        username: r.username,
        displayName: r.displayName,
        avatar: r.avatar,
        value: r.value,
        rank: i + 1,
      }));
    } catch {
      // ignore — event will be populated on next tick
    }
  }

  const event = await CompetitiveEvent.create({
    name: template.name,
    description: template.description,
    type: template.type,
    metric: template.metric,
    status: 'upcoming',
    startDate: new Date(),
    endDate: new Date(Date.now() + template.durationTicks * 30000),
    startTick,
    endTick,
    rewards: template.rewards,
    participants: initialParticipants,
    snapshotInterval: Math.max(1, Math.floor(template.durationTicks / 10)),
    lastSnapshotTick: 0,
    createdFromSeason: seasonNumber,
  });

  console.log(
    `[LEADERBOARD] Generated upcoming event: "${template.name}" (starts tick ${startTick}, ends tick ${endTick}, ${initialParticipants.length} initial participants)`,
  );

  sendDiscordNotification({
    type: 'announcements',
    title: `Upcoming Event: ${template.name}`,
    description: `${template.description}\nStarts in ${UPCOMING_LEAD_TICKS} ticks.`,
    fields: [
      { name: 'Duration', value: `${template.durationTicks} ticks`, inline: true },
      { name: 'Participants', value: String(initialParticipants.length), inline: true },
    ],
  }).catch(() => {});

  return [event];
}

export async function activateUpcomingEvents(tickNumber) {
  const upcoming = await CompetitiveEvent.find({
    status: 'upcoming',
    startTick: { $lte: tickNumber },
  });

  for (const event of upcoming) {
    event.status = 'active';
    event.lastSnapshotTick = tickNumber;
    await event.save();
    console.log(`[LEADERBOARD] Activated event: "${event.name}" at tick ${tickNumber}`);
  }

  return upcoming;
}

async function computeNetWorthRankings() {
  const users = await User.find({ banned: false, role: 'user' }).select(
    'username displayName avatar balance ownedProperties',
  );

  const propertyMap = new Map();
  const propertyIds = users.flatMap((u) => u.ownedProperties);
  if (propertyIds.length > 0) {
    const properties = await Property.find({ _id: { $in: propertyIds } }).select(
      'ownerId currentPrice rent maintenanceCost',
    );
    for (const p of properties) {
      const key = p.ownerId.toString();
      if (!propertyMap.has(key)) propertyMap.set(key, { portfolioValue: 0, rent: 0, maintenance: 0 });
      const acc = propertyMap.get(key);
      acc.portfolioValue += p.currentPrice || 0;
      acc.rent += p.rent || 0;
      acc.maintenance += p.maintenanceCost || 0;
    }
  }

  const loanMap = new Map();
  const loans = await Loan.find({ status: 'active' }).select('userId outstandingBalance');
  for (const l of loans) {
    const key = l.userId.toString();
    loanMap.set(key, (loanMap.get(key) || 0) + (l.outstandingBalance || 0));
  }

  const rankings = users.map((u) => {
    const uid = u._id.toString();
    const propData = propertyMap.get(uid) || { portfolioValue: 0 };
    const debt = loanMap.get(uid) || 0;
    const netWorth = (u.balance || 0) + propData.portfolioValue - debt;
    return {
      userId: u._id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      value: netWorth,
    };
  });

  rankings.sort((a, b) => b.value - a.value);
  return rankings;
}

async function computePropertyRankings() {
  const results = await User.aggregate([
    { $match: { banned: false, role: 'user' } },
    {
      $lookup: {
        from: 'properties',
        localField: '_id',
        foreignField: 'ownerId',
        as: 'props',
      },
    },
    {
      $addFields: {
        propertyCount: { $size: '$props' },
      },
    },
    { $match: { propertyCount: { $gt: 0 } } },
    { $sort: { propertyCount: -1 } },
    { $project: { username: 1, displayName: 1, avatar: 1, propertyCount: 1 } },
  ]);

  return results.map((r) => ({
    userId: r._id,
    username: r.username,
    displayName: r.displayName,
    avatar: r.avatar,
    value: r.propertyCount,
  }));
}

async function computePassiveIncomeRankings() {
  const results = await Property.aggregate([
    { $match: { ownerId: { $ne: null } } },
    {
      $group: {
        _id: '$ownerId',
        totalRent: { $sum: '$rent' },
        totalMaintenance: { $sum: '$maintenanceCost' },
      },
    },
    {
      $addFields: {
        netIncome: { $subtract: ['$totalRent', '$totalMaintenance'] },
      },
    },
    { $match: { netIncome: { $gt: 0 } } },
    { $sort: { netIncome: -1 } },
  ]);

  const loanPaymentMap = new Map();
  const activeLoans = await Loan.find({ status: 'active' }).select('userId monthlyPayment');
  for (const l of activeLoans) {
    const key = l.userId.toString();
    loanPaymentMap.set(key, (loanPaymentMap.get(key) || 0) + (l.monthlyPayment || 0));
  }

  const userIds = results.map((r) => r._id);
  const users =
    userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).select('username displayName avatar') : [];
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  return results.map((r) => {
    const uid = r._id.toString();
    const user = userMap.get(uid);
    const loanPayments = loanPaymentMap.get(uid) || 0;
    const passiveIncome = Math.max(0, r.netIncome - loanPayments);
    return {
      userId: r._id,
      username: user?.username || 'Unknown',
      displayName: user?.displayName || '',
      avatar: user?.avatar || '',
      value: passiveIncome,
    };
  });
}

async function computeDealVolumeRankings() {
  const buyResults = await Transaction.aggregate([
    { $match: { type: 'buy' } },
    {
      $group: {
        _id: '$buyerId',
        totalVolume: { $sum: '$price' },
        dealCount: { $sum: 1 },
      },
    },
  ]);

  const sellResults = await Transaction.aggregate([
    { $match: { type: 'sell' } },
    {
      $group: {
        _id: '$sellerId',
        totalVolume: { $sum: '$price' },
        dealCount: { $sum: 1 },
      },
    },
  ]);

  const volumeMap = new Map();
  for (const r of buyResults) {
    const key = r._id.toString();
    const existing = volumeMap.get(key) || { totalVolume: 0, dealCount: 0 };
    existing.totalVolume += r.totalVolume;
    existing.dealCount += r.dealCount;
    volumeMap.set(key, existing);
  }
  for (const r of sellResults) {
    const key = r._id.toString();
    const existing = volumeMap.get(key) || { totalVolume: 0, dealCount: 0 };
    existing.totalVolume += r.totalVolume;
    existing.dealCount += r.dealCount;
    volumeMap.set(key, existing);
  }

  const entries = [...volumeMap.entries()]
    .filter(([, v]) => v.totalVolume > 0)
    .sort((a, b) => b[1].totalVolume - a[1].totalVolume)
    .slice(0, 200);

  if (entries.length === 0) return [];

  const userIds = entries.map(([id]) => id);
  const users = await User.find({ _id: { $in: userIds } }).select('username displayName avatar');
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  return entries.map(([id, data]) => {
    const user = userMap.get(id);
    return {
      userId: id,
      username: user?.username || 'Unknown',
      displayName: user?.displayName || '',
      avatar: user?.avatar || '',
      value: data.totalVolume,
    };
  });
}

async function computeCityInfluenceRankings() {
  const allProperties = await Property.aggregate([
    { $match: { ownerId: { $ne: null } } },
    {
      $group: {
        _id: '$ownerId',
        totalValue: { $sum: '$currentPrice' },
        propertyCount: { $sum: 1 },
        avgOccupancy: { $avg: '$occupancy' },
        totalDevelopment: { $sum: '$developmentLevel' },
        totalRent: { $sum: '$rent' },
        types: { $addToSet: '$type' },
      },
    },
  ]);

  const totalMarketValue = allProperties.reduce((sum, r) => sum + (r.totalValue || 0), 0);

  const userIds = allProperties.map((r) => r._id);
  const users =
    userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).select('username displayName avatar') : [];
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const scored = allProperties
    .map((r) => {
      const marketShare = totalMarketValue > 0 ? (r.totalValue / totalMarketValue) * 100 : 0;
      const marketSharePoints = marketShare * 15;
      const propertyCountPoints = r.propertyCount * 8;
      const occupancyPoints = (r.avgOccupancy / 100) * 20;
      const developmentPoints = r.totalDevelopment * 30;
      const rentPoints = Math.min(r.totalRent * 0.5, 200);
      const varietyPoints = Math.min((r.types?.length || 1) * 5, 25);

      const influenceScore = Math.round(
        marketSharePoints + propertyCountPoints + occupancyPoints + developmentPoints + rentPoints + varietyPoints,
      );

      const uid = r._id.toString();
      const user = userMap.get(uid);
      return {
        userId: r._id,
        username: user?.username || 'Unknown',
        displayName: user?.displayName || '',
        avatar: user?.avatar || '',
        value: influenceScore,
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  return scored;
}

async function getPreviousSnapshot(category, currentTick) {
  return LeaderboardSnapshot.findOne({
    category,
    tickNumber: { $lt: currentTick },
  }).sort({ tickNumber: -1 });
}

function applyRankChanges(rankings, previousSnapshot) {
  const prevRankMap = new Map();
  if (previousSnapshot) {
    for (const entry of previousSnapshot.rankings) {
      prevRankMap.set(entry.userId.toString(), entry.rank);
    }
  }

  return rankings.map((entry, index) => {
    const rank = index + 1;
    const prevRank = prevRankMap.get(entry.userId.toString()) || null;
    const rankChange = prevRank !== null ? prevRank - rank : 0;
    return { ...entry, rank, previousRank: prevRank, rankChange };
  });
}

const SNAPSHOT_INTERVAL = 6;

export async function computeLeaderboards(currentTick) {
  if (currentTick % SNAPSHOT_INTERVAL !== 0) {
    return [];
  }

  const activeSeason = await Season.findOne({ status: 'active' });
  const seasonNumber = activeSeason ? activeSeason.number : 1;

  const computeFns = {
    netWorth: computeNetWorthRankings,
    properties: computePropertyRankings,
    passiveIncome: computePassiveIncomeRankings,
    dealVolume: computeDealVolumeRankings,
    cityInfluence: computeCityInfluenceRankings,
  };

  const snapshots = [];

  for (const category of CATEGORIES) {
    try {
      const rawRankings = await computeFns[category]();
      const previousSnapshot = await getPreviousSnapshot(category, currentTick);
      const rankings = applyRankChanges(rawRankings, previousSnapshot);

      const snapshot = await LeaderboardSnapshot.findOneAndUpdate(
        { category, tickNumber: currentTick },
        {
          category,
          seasonNumber,
          tickNumber: currentTick,
          rankings,
          computedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      snapshots.push(snapshot);
    } catch (err) {
      console.error(`[LEADERBOARD] Error computing ${category}:`, err.message);
    }
  }

  return snapshots;
}

export async function updateCompetitiveEventProgress(tickNumber) {
  const events = await CompetitiveEvent.find({
    status: 'active',
    startTick: { $lte: tickNumber },
    endTick: { $gt: tickNumber },
  });

  for (const event of events) {
    if (tickNumber - event.lastSnapshotTick < event.snapshotInterval) continue;

    let metricFn;
    switch (event.metric) {
      case 'netWorth':
      case 'netWorthGain':
        metricFn = computeNetWorthRankings;
        break;
      case 'propertiesAcquired':
        metricFn = computePropertyRankings;
        break;
      case 'passiveIncome':
        metricFn = computePassiveIncomeRankings;
        break;
      case 'dealVolume':
        metricFn = computeDealVolumeRankings;
        break;
      case 'cityInfluence':
        metricFn = computeCityInfluenceRankings;
        break;
      default:
        continue;
    }

    try {
      const rankings = await metricFn();
      event.participants = rankings.slice(0, 50).map((r) => ({
        userId: r.userId,
        username: r.username,
        displayName: r.displayName,
        avatar: r.avatar,
        value: r.value,
      }));
      event.participants.forEach((p, i) => {
        p.rank = i + 1;
      });
      event.lastSnapshotTick = tickNumber;
      await event.save();
    } catch (err) {
      console.error(`[LEADERBOARD] Error updating event ${event.name}:`, err.message);
    }
  }
}

export async function finalizeExpiredEvents(tickNumber) {
  const expired = await CompetitiveEvent.find({
    status: 'active',
    endTick: { $lte: tickNumber },
  });

  for (const event of expired) {
    event.status = 'completed';
    const sorted = [...event.participants].sort((a, b) => b.value - a.value);
    sorted.forEach((p, i) => {
      p.rank = i + 1;
    });
    event.participants = sorted;

    const bonusUsers = [];

    const assignReward = (participant, tier) => {
      if (!participant) return;
      if (event.rewards[tier]) {
        participant.reward = {
          type: event.rewards[tier].type || 'badge',
          value: event.rewards[tier].value || null,
          claimed: false,
        };
        if (event.rewards[tier].bonus) {
          bonusUsers.push({ userId: participant.userId, bonus: event.rewards[tier].bonus });
        }
      }
    };
    assignReward(sorted[0], 'first');
    assignReward(sorted[1], 'second');
    assignReward(sorted[2], 'third');

    if (event.rewards.participation) {
      for (const p of sorted) {
        if (!p.reward || !p.reward.type) {
          p.reward = {
            type: event.rewards.participation.type || 'achievement',
            value: event.rewards.participation.value || null,
            claimed: false,
          };
          if (event.rewards.participation.bonus) {
            bonusUsers.push({ userId: p.userId, bonus: event.rewards.participation.bonus });
          }
        }
      }
    }

    await event.save();

    if (bonusUsers.length > 0) {
      const bulkOps = [];
      for (const { userId, bonus } of bonusUsers) {
        if (!userId) continue;
        if (bonus.type === 'balance') {
          bulkOps.push({
            updateOne: { filter: { _id: userId }, update: { $inc: { balance: bonus.value } } },
          });
        } else if (bonus.type === 'xp') {
          bulkOps.push({
            updateOne: { filter: { _id: userId }, update: { $inc: { xp: bonus.value } } },
          });
        }
      }
      if (bulkOps.length > 0) {
        await User.bulkWrite(bulkOps);
      }
    }

    console.log(`[LEADERBOARD] Event "${event.name}" finalized. Winner: ${sorted[0]?.username || 'None'}`);

    sendDiscordNotification({
      type: 'announcements',
      title: `Event Complete: ${event.name}`,
      description: `The event has ended. Congratulations to the winners!`,
      fields: [
        { name: 'Winner', value: sorted[0]?.username || 'None', inline: true },
        { name: 'Participants', value: String(sorted.length), inline: true },
        { name: 'Top Score', value: String(sorted[0]?.value || 0), inline: true },
      ],
    }).catch(() => {});
  }

  return expired;
}

export async function cleanupExpiredCompletedEvents(tickNumber) {
  const cutoff = tickNumber - COMPLETED_RETENTION_TICKS;
  const result = await CompetitiveEvent.deleteMany({
    status: 'completed',
    endTick: { $lte: cutoff },
  });

  if (result.deletedCount > 0) {
    console.log(
      `[LEADERBOARD] Cleaned up ${result.deletedCount} completed events older than ${COMPLETED_RETENTION_TICKS} ticks`,
    );
  }

  return result.deletedCount;
}
