import User from '../models/User.js';
import Property from '../models/Property.js';
import Loan from '../models/Loan.js';
import Transaction from '../models/Transaction.js';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';
import CompetitiveEvent from '../models/CompetitiveEvent.js';
import Season from '../models/Season.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import Company from '../models/Company.js';
import { sendDiscordNotification } from '../services/discordBot.js';
import {
  calculatePropertyRentIncome,
  calculateMaintenanceCost,
  calculateOperatingExpenses,
} from '../config/propertyManagement.js';

const CATEGORIES = ['netWorth', 'properties', 'passiveIncome', 'dealVolume', 'cityInfluence'];
const COMPANY_CATEGORIES = [
  'companyNetWorth',
  'companyProperties',
  'companyIncome',
  'companyReputation',
  'companyGrowth',
];
const IPO_CATEGORIES = ['ipoMarketCap', 'ipoDividendYield', 'ipoPriceGrowth'];

/**
 * Identity key for a ranking entry. Player entries carry `userId`, company and
 * IPO entries carry only `companyId` — both must survive rank-change handling.
 */
export function entryKey(entry) {
  return (entry?.userId || entry?.companyId || '').toString();
}

function rankCompare(a, b) {
  if (b.value !== a.value) return b.value - a.value;
  return entryKey(a).localeCompare(entryKey(b));
}

const UPCOMING_LEAD_TICKS = 12;
const COMPLETED_RETENTION_TICKS = 28;
const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;

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
  if (activeEvents >= 3) {
    return [];
  }

  const upcomingEvents = await CompetitiveEvent.countDocuments({ status: 'upcoming' });
  if (upcomingEvents >= 2) {
    return [];
  }

  const activeSeason = await Season.findOne({ status: 'active' });
  const seasonNumber = activeSeason ? activeSeason.number : 1;

  const recentEvents = await CompetitiveEvent.find({ createdFromSeason: seasonNumber })
    .sort({ createdAt: -1 })
    .limit(10);
  const recentNames = recentEvents.map((e) => e.name);

  const usedTemplates = recentNames;
  const available = EVENT_TEMPLATES.filter((t) => !usedTemplates.includes(t.name));

  let template;
  if (available.length === 0) {
    const usedOrder = EVENT_TEMPLATES.map((t) => ({
      template: t,
      lastUsed: recentEvents.find((e) => e.name === t.name)?.createdAt || new Date(0),
    })).sort((a, b) => a.lastUsed - b.lastUsed);
    template = usedOrder[0].template;
  } else {
    template = available[Math.floor(Math.random() * available.length)];
  }

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
      // ignore â€” event will be populated on next tick
    }
  }

  const event = await CompetitiveEvent.create({
    name: template.name,
    description: template.description,
    type: template.type,
    metric: template.metric,
    status: 'upcoming',
    startDate: new Date(Date.now() + UPCOMING_LEAD_TICKS * TICK_INTERVAL_MS),
    endDate: new Date(Date.now() + (UPCOMING_LEAD_TICKS + template.durationTicks) * TICK_INTERVAL_MS),
    startTick,
    endTick,
    rewards: template.rewards,
    participants: initialParticipants,
    snapshotInterval: Math.max(1, Math.floor(template.durationTicks / 10)),
    lastSnapshotTick: 0,
    createdFromSeason: seasonNumber,
  });

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
  }

  return upcoming;
}

async function computeNetWorthRankings() {
  const users = await User.find({ banned: false, role: 'user', deletedAt: null }).select(
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
  const loans = await Loan.find({ active: true }).select('userId remainingBalance');
  for (const l of loans) {
    const key = l.userId.toString();
    loanMap.set(key, (loanMap.get(key) || 0) + (l.remainingBalance || 0));
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

  rankings.sort(rankCompare);
  return rankings;
}

async function computePropertyRankings() {
  const results = await User.aggregate([
    { $match: { banned: false, role: 'user', deletedAt: null } },
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
    { $sort: { propertyCount: -1, _id: 1 } },
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
  // Authoritative passive income = the exact per-tick net income the rent
  // engine credits (rentProcessing.processRent): occupancy-adjusted gross
  // income minus maintenance (maintenance-tier percentage) minus operating
  // expenses (type-based) — computed with the same functions the engine uses.
  // The old formula (property.rent - property.maintenanceCost) ignored
  // occupancy, operating expenses, and used a stale maintenanceCost field.
  const properties = await Property.find({ ownerId: { $ne: null } })
    .select('ownerId type rent rentPerUnit units occupancy maintenanceLevel')
    .lean();

  const netIncomeMap = new Map();
  for (const p of properties) {
    const uid = p.ownerId?.toString();
    if (!uid) continue;
    const net = Math.max(
      0,
      calculatePropertyRentIncome(p) -
        calculateMaintenanceCost(p, calculatePropertyRentIncome(p)) -
        calculateOperatingExpenses(p, calculatePropertyRentIncome(p)),
    );
    netIncomeMap.set(uid, (netIncomeMap.get(uid) || 0) + net);
  }

  const loanPaymentMap = new Map();
  const activeLoans = await Loan.find({ active: true }).select('userId paymentPerTick');
  for (const l of activeLoans) {
    const key = l.userId.toString();
    loanPaymentMap.set(key, (loanPaymentMap.get(key) || 0) + (l.paymentPerTick || 0));
  }

  const entries = [...netIncomeMap.entries()]
    .map(([uid, netIncome]) => {
      const loanPayments = loanPaymentMap.get(uid) || 0;
      const passiveIncome = Math.max(0, netIncome - loanPayments);
      return { userId: uid, netIncome: passiveIncome };
    })
    .filter((r) => r.netIncome > 0)
    .sort((a, b) => b.netIncome - a.netIncome || a.userId.localeCompare(b.userId));

  const userIds = entries.map((r) => r.userId);
  const users =
    userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).select('username displayName avatar') : [];
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  return entries.map((r) => {
    const user = userMap.get(r.userId);
    return {
      userId: r.userId,
      username: user?.username || 'Unknown',
      displayName: user?.displayName || '',
      avatar: user?.avatar || '',
      value: r.netIncome,
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
    // Company/system transactions can carry a null buyerId — never crash the
    // whole leaderboard on them (production had dealVolume frozen for ~24 days
    // because of exactly this).
    if (!r._id) continue;
    const key = r._id.toString();
    const existing = volumeMap.get(key) || { totalVolume: 0, dealCount: 0 };
    existing.totalVolume += r.totalVolume;
    existing.dealCount += r.dealCount;
    volumeMap.set(key, existing);
  }
  for (const r of sellResults) {
    if (!r._id) continue;
    const key = r._id.toString();
    const existing = volumeMap.get(key) || { totalVolume: 0, dealCount: 0 };
    existing.totalVolume += r.totalVolume;
    existing.dealCount += r.dealCount;
    volumeMap.set(key, existing);
  }

  const entries = [...volumeMap.entries()]
    .filter(([, v]) => v.totalVolume > 0)
    .sort((a, b) => b[1].totalVolume - a[1].totalVolume || a[0].localeCompare(b[0]));

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
    .sort(rankCompare);

  return scored;
}

async function computeCompanyNetWorth() {
  const companies = await RealEstateCompany.find({ active: true })
    .populate('founderId', 'username displayName avatar')
    .select('name logo founderId stats reputation level treasury');

  const companyIds = companies.map((c) => c._id);
  const properties =
    companyIds.length > 0
      ? await Property.find({ companyId: { $in: companyIds } }).select('companyId currentPrice')
      : [];

  const propertyValueMap = new Map();
  for (const p of properties) {
    const key = p.companyId?.toString();
    if (key) propertyValueMap.set(key, (propertyValueMap.get(key) || 0) + (p.currentPrice || 0));
  }

  return companies
    .map((c) => {
      const propertyValue = propertyValueMap.get(c._id.toString()) || 0;
      const netWorth = (c.treasury?.balance || 0) + propertyValue;
      return {
        companyId: c._id,
        username: c.name,
        displayName: c.name,
        avatar: c.logo || '',
        value: netWorth,
      };
    })
    .filter((r) => r.value > 0)
    .sort(rankCompare);
}

async function computeCompanyProperties() {
  const companies = await RealEstateCompany.find({ active: true }).select('name logo stats');

  return companies
    .map((c) => ({
      companyId: c._id,
      username: c.name,
      displayName: c.name,
      avatar: c.logo || '',
      value: c.stats?.propertiesOwned || 0,
    }))
    .filter((r) => r.value > 0)
    .sort(rankCompare);
}

async function computeCompanyIncome() {
  const companies = await RealEstateCompany.find({ active: true }).select('name logo stats');

  return companies
    .map((c) => ({
      companyId: c._id,
      username: c.name,
      displayName: c.name,
      avatar: c.logo || '',
      value: c.stats?.totalRentalIncome || 0,
    }))
    .filter((r) => r.value > 0)
    .sort(rankCompare);
}

async function computeCompanyReputation() {
  const companies = await RealEstateCompany.find({ active: true }).select('name logo reputation');

  return companies
    .map((c) => ({
      companyId: c._id,
      username: c.name,
      displayName: c.name,
      avatar: c.logo || '',
      value: c.reputation || 0,
    }))
    .filter((r) => r.value > 0)
    .sort(rankCompare);
}

async function computeCompanyGrowth() {
  const companies = await RealEstateCompany.find({ active: true }).select('name logo level xp reputation stats');

  return companies
    .map((c) => {
      const growthScore =
        (c.level - 1) * 100 + (c.xp || 0) * 0.1 + (c.reputation || 0) * 0.5 + (c.stats?.propertiesOwned || 0) * 50;
      return {
        companyId: c._id,
        username: c.name,
        displayName: c.name,
        avatar: c.logo || '',
        value: Math.round(growthScore),
      };
    })
    .filter((r) => r.value > 0)
    .sort(rankCompare);
}

async function computeIpoMarketCap() {
  const companies = await Company.find({ isIPO: true, active: true })
    .select('name ticker marketCap sharePrice realEstateCompanyId')
    .lean();

  const reIds = companies.map((c) => c.realEstateCompanyId).filter(Boolean);
  const reCompanies =
    reIds.length > 0
      ? await RealEstateCompany.find({ _id: { $in: reIds } })
          .select('name logo')
          .lean()
      : [];
  const reMap = new Map(reCompanies.map((c) => [c._id.toString(), c]));

  return companies
    .map((c) => {
      const re = reMap.get(c.realEstateCompanyId?.toString());
      return {
        companyId: c._id,
        username: c.ticker,
        displayName: `${c.name} (${c.ticker})`,
        avatar: re?.logo || '',
        value: c.marketCap || 0,
        metadata: { ticker: c.ticker, sharePrice: c.sharePrice },
      };
    })
    .filter((r) => r.value > 0)
    .sort(rankCompare);
}

async function computeIpoDividendYield() {
  const companies = await Company.find({ isIPO: true, active: true })
    .select('name ticker dividendYield sharePrice lastDividendTick realEstateCompanyId')
    .lean();

  return companies
    .map((c) => ({
      companyId: c._id,
      username: c.ticker,
      displayName: `${c.name} (${c.ticker})`,
      avatar: '',
      value: c.dividendYield || 0,
      metadata: { ticker: c.ticker, sharePrice: c.sharePrice, lastDividendTick: c.lastDividendTick },
    }))
    .filter((r) => r.value > 0)
    .sort(rankCompare);
}

async function computeIpoPriceGrowth() {
  const companies = await Company.find({ isIPO: true, active: true })
    .select('name ticker sharePrice dayChangePercent totalReturn realEstateCompanyId')
    .lean();

  return (
    companies
      .map((c) => ({
        companyId: c._id,
        username: c.ticker,
        displayName: `${c.name} (${c.ticker})`,
        avatar: '',
        // Cumulative total return since IPO is the stable metric; fall back to
        // the latest tick change only when no total return has been recorded.
        value: c.totalReturn || c.dayChangePercent || 0,
        metadata: { ticker: c.ticker, sharePrice: c.sharePrice, dayChangePercent: c.dayChangePercent },
      }))
      // Negative growth is a valid ranking position — a declining stock ranks
      // at the bottom, it must never disappear from the board.
      .sort(rankCompare)
  );
}

/**
 * Authoritative current value for a single player in a player category, using
 * the exact same formulas as the snapshot computation. Used by the my-rank
 * endpoint when the player is missing from the latest snapshot (e.g. new
 * player, or a zero-value entry excluded from a category).
 */
export async function computeCategoryValue(category, userId) {
  const uid = userId?.toString();
  if (!uid) return 0;
  const user = await User.findById(uid).select('balance ownedProperties deletedAt').lean();
  if (!user || user.deletedAt) return 0;

  switch (category) {
    case 'netWorth': {
      // Mirror computeNetWorthRankings exactly: value is derived from the
      // user's ownedProperties array (the same source the snapshot uses).
      const propertyIds = user.ownedProperties || [];
      const props =
        propertyIds.length > 0
          ? await Property.find({ _id: { $in: propertyIds } })
              .select('currentPrice')
              .lean()
          : [];
      const portfolioValue = props.reduce((sum, p) => sum + (p.currentPrice || 0), 0);
      const loans = await Loan.find({ userId: user._id, active: true }).select('remainingBalance').lean();
      const debt = loans.reduce((sum, l) => sum + (l.remainingBalance || 0), 0);
      return Math.max(0, (user.balance || 0) + portfolioValue - debt);
    }
    case 'properties': {
      return Property.countDocuments({ ownerId: user._id });
    }
    case 'passiveIncome': {
      const props = await Property.find({ ownerId: user._id })
        .select('type rent rentPerUnit units occupancy maintenanceLevel')
        .lean();
      let net = 0;
      for (const p of props) {
        net += Math.max(
          0,
          calculatePropertyRentIncome(p) -
            calculateMaintenanceCost(p, calculatePropertyRentIncome(p)) -
            calculateOperatingExpenses(p, calculatePropertyRentIncome(p)),
        );
      }
      const loans = await Loan.find({ userId: user._id, active: true }).select('paymentPerTick').lean();
      const loanPayments = loans.reduce((sum, l) => sum + (l.paymentPerTick || 0), 0);
      return Math.max(0, net - loanPayments);
    }
    case 'dealVolume': {
      const [buys, sells] = await Promise.all([
        Transaction.aggregate([
          { $match: { type: 'buy', buyerId: user._id } },
          { $group: { _id: null, total: { $sum: '$price' } } },
        ]),
        Transaction.aggregate([
          { $match: { type: 'sell', sellerId: user._id } },
          { $group: { _id: null, total: { $sum: '$price' } } },
        ]),
      ]);
      return (buys[0]?.total || 0) + (sells[0]?.total || 0);
    }
    case 'cityInfluence': {
      // Mirrors computeCityInfluenceRankings for a single user's properties.
      const props = await Property.find({ ownerId: user._id }).lean();
      if (props.length === 0) return 0;
      const totalValue = props.reduce((sum, p) => sum + (p.currentPrice || 0), 0);
      const allValue = await Property.aggregate([
        { $match: { ownerId: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$currentPrice' } } },
      ]);
      const totalMarketValue = allValue[0]?.total || 0;
      const propertyCount = props.length;
      const avgOccupancy = props.reduce((sum, p) => sum + (p.occupancy || 0), 0) / props.length;
      const totalDevelopment = props.reduce((sum, p) => sum + (p.developmentLevel || 0), 0);
      const totalRent = props.reduce((sum, p) => sum + (p.rent || 0), 0);
      const types = new Set(props.map((p) => p.type));
      const marketShare = totalMarketValue > 0 ? (totalValue / totalMarketValue) * 100 : 0;
      const score = Math.round(
        marketShare * 15 +
          propertyCount * 8 +
          (avgOccupancy / 100) * 20 +
          totalDevelopment * 30 +
          Math.min(totalRent * 0.5, 200) +
          Math.min(types.size * 5, 25),
      );
      return Math.max(0, score);
    }
    default:
      return 0;
  }
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
      prevRankMap.set(entryKey(entry), entry.rank);
    }
  }

  return rankings.map((entry, index) => {
    const rank = index + 1;
    const prevRank = prevRankMap.get(entryKey(entry)) || null;
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
    companyNetWorth: computeCompanyNetWorth,
    companyProperties: computeCompanyProperties,
    companyIncome: computeCompanyIncome,
    companyReputation: computeCompanyReputation,
    companyGrowth: computeCompanyGrowth,
    ipoMarketCap: computeIpoMarketCap,
    ipoDividendYield: computeIpoDividendYield,
    ipoPriceGrowth: computeIpoPriceGrowth,
  };

  const allCategories = [...CATEGORIES, ...COMPANY_CATEGORIES, ...IPO_CATEGORIES];

  // ALL-OR-NOTHING snapshot cycle: compute every category first, validate,
  // then persist. A single failing category must never leave a mixed-state
  // board (some categories at the new tick, others showing stale data) —
  // that was the exact production failure mode before the crash fixes.
  // When any category fails, nothing is written this cycle, the previous
  // consistent snapshots remain visible, and the next cycle retries.
  const computed = [];
  const failures = [];
  for (const category of allCategories) {
    try {
      const rawRankings = await computeFns[category]();
      const previousSnapshot = await getPreviousSnapshot(category, currentTick);
      const rankings = applyRankChanges(rawRankings, previousSnapshot);
      computed.push({ category, rankings });
    } catch (err) {
      failures.push({ category, message: err.message });
      console.error(`[LEADERBOARD] Error computing ${category}:`, err.message);
    }
  }

  if (failures.length > 0) {
    console.error(
      `[LEADERBOARD] ${failures.length}/${allCategories.length} categories failed at tick ${currentTick} — ` +
        `persisting NO snapshots this cycle to keep the board consistent. Failed: ${failures.map((f) => f.category).join(', ')}`,
    );
    return [];
  }

  const snapshots = [];
  for (const { category, rankings } of computed) {
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
    event.status = 'completed';
    const sorted = [...event.participants].sort(rankCompare);
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

  return result.deletedCount;
}
