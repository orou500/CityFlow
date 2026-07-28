import mongoose from 'mongoose';
import MissionProgress from '../models/MissionProgress.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Loan from '../models/Loan.js';
import MarketReport from '../models/MarketReport.js';
import Auction from '../models/Auction.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import District from '../models/District.js';
import { MISSION_DEFINITIONS, getMissionById } from '../config/missions.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { emitToUser } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';

function getDailyPeriodKey() {
  const now = new Date();
  return `daily:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function getWeeklyPeriodKey() {
  const now = new Date();
  const startOfYear = new Date(now.getUTCFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / 86400000);
  const weekNumber = Math.ceil((days + startOfYear.getUTCDay() + 1) / 7);
  return `weekly:${now.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

function getSeasonPeriodKey() {
  const currentTick = global.currentTick || 0;
  const seasonNumber = Math.floor(currentTick / 720) + 1;
  return `season:${seasonNumber}`;
}

function getPeriodKey(type) {
  switch (type) {
    case 'daily':
      return getDailyPeriodKey();
    case 'weekly':
      return getWeeklyPeriodKey();
    case 'seasonal':
      return getSeasonPeriodKey();
    default:
      return null;
  }
}

async function evaluateCondition(userId, condition, userData) {
  let value;
  switch (condition.type) {
    case 'properties_owned': {
      value = userData.ownedProperties?.length || 0;
      break;
    }
    case 'total_rent_collected': {
      value = userData.lifetimeStats?.totalRentCollected || 0;
      break;
    }
    case 'total_upgrades': {
      value = userData.lifetimeStats?.totalUpgrades || 0;
      break;
    }
    case 'total_properties_sold': {
      value = await Property.countDocuments({
        lastPurchaseDate: { $ne: null },
        ownerId: { $ne: userId },
        $or: [{ _id: { $in: userData.ownedProperties || [] } }, { priceHistory: { $elemMatch: { tick: { $gt: 0 } } } }],
      });
      break;
    }
    case 'auctions_won': {
      value = condition.periodKey
        ? await Auction.countDocuments({
            currentBidderId: userId,
            status: 'ended',
            periodKey: condition.periodKey,
          })
        : await Auction.countDocuments({ currentBidderId: userId, status: 'ended' });
      break;
    }
    case 'auctions_sold': {
      value = await Auction.countDocuments({ sellerId: userId, status: 'ended' });
      break;
    }
    case 'rare_auctions_won': {
      value = await Auction.countDocuments({
        currentBidderId: userId,
        status: 'ended',
        propertyRating: 'rare',
      });
      break;
    }
    case 'monthly_income': {
      const properties = await Property.find({ ownerId: userId }).lean();
      value = properties.reduce((sum, p) => sum + (p.rent || 0), 0);
      break;
    }
    case 'net_worth': {
      const balance = userData.balance || 0;
      const properties = await Property.find({ ownerId: userId }).lean();
      const propertyValue = properties.reduce((sum, p) => sum + (p.currentPrice || 0), 0);
      value = balance + propertyValue;
      break;
    }
    case 'own_legendary_property': {
      value = await Property.countDocuments({
        ownerId: userId,
        propertyRating: 'elite',
      });
      break;
    }
    case 'unique_cities': {
      const properties = await Property.find({ ownerId: userId }).distinct('cityId');
      value = properties.length;
      break;
    }
    case 'city_owned': {
      const city = await mongoose.model('City').findOne({ name: condition.cityName }).lean();
      if (!city) { value = 0; break; }
      value = await Property.countDocuments({ ownerId: userId, cityId: city._id });
      break;
    }
    case 'total_construction_completed': {
      value = userData.lifetimeStats?.totalConstructionStarted || 0;
      break;
    }
    case 'total_loans_taken': {
      value = userData.lifetimeStats?.totalLoansTaken || 0;
      break;
    }
    case 'total_loan_repayments': {
      value = await Loan.countDocuments({ userId, active: false });
      break;
    }
    case 'credit_score': {
      value = userData.creditScore || 0;
      break;
    }
    case 'total_loan_amount_repaid': {
      const loans = await Loan.find({ userId, active: false }).lean();
      value = loans.reduce((sum, l) => sum + (l.principal || 0), 0);
      break;
    }
    case 'joined_company': {
      value = userData.companyId ? 1 : 0;
      break;
    }
    case 'created_company': {
      value = await RealEstateCompany.countDocuments({ founderId: userId });
      break;
    }
    case 'company_votes_cast': {
      value = userData.lifetimeStats?.totalTransactions || 0;
      break;
    }
    case 'company_projects_completed': {
      value = 0;
      break;
    }
    case 'company_properties_purchased': {
      const company = userData.companyId ? await RealEstateCompany.findById(userData.companyId).lean() : null;
      value = company?.properties?.length || 0;
      break;
    }
    case 'unique_districts': {
      const districts = await Property.find({ ownerId: userId }).distinct('districtId');
      value = districts.filter(Boolean).length;
      break;
    }
    case 'district_leader': {
      const topDistricts = await District.find({
        topInvestor: userId,
      }).lean();
      value = topDistricts.length;
      break;
    }
    case 'reports_purchased': {
      value = await MarketReport.countDocuments({ userId });
      break;
    }
    case 'forecast_accuracy_90': {
      const accurateReport = await MarketReport.findOne({
        userId,
        forecastAccuracy: { $gte: 90 },
      }).lean();
      value = accurateReport ? 1 : 0;
      break;
    }
    case 'properties_bought_today': {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      value = await Property.countDocuments({
        ownerId: userId,
        lastPurchaseDate: { $gte: dayStart },
      });
      break;
    }
    case 'rent_collected_today': {
      if (!userData.lastRentCollectedAt) { value = 0; break; }
      const collected = new Date(userData.lastRentCollectedAt);
      const now = new Date();
      value = collected.getUTCFullYear() === now.getUTCFullYear() &&
        collected.getUTCMonth() === now.getUTCMonth() &&
        collected.getUTCDate() === now.getUTCDate()
        ? 1
        : 0;
      break;
    }
    case 'bonus_claimed_today': {
      if (!userData.lastPeriodBonusClaim) { value = 0; break; }
      const claimed = new Date(userData.lastPeriodBonusClaim);
      const now = new Date();
      value = claimed.getUTCFullYear() === now.getUTCFullYear() &&
        claimed.getUTCMonth() === now.getUTCMonth() &&
        claimed.getUTCDate() === now.getUTCDate()
        ? 1
        : 0;
      break;
    }
    case 'login_today': {
      if (!userData.lastLoginAt) { value = 0; break; }
      const loginDate = new Date(userData.lastLoginAt);
      const now = new Date();
      value = loginDate.getUTCFullYear() === now.getUTCFullYear() &&
        loginDate.getUTCMonth() === now.getUTCMonth() &&
        loginDate.getUTCDate() === now.getUTCDate()
        ? 1
        : 0;
      break;
    }
    case 'upgrades_today': {
      if (!userData.lastUpgradeAt) { value = 0; break; }
      const upgraded = new Date(userData.lastUpgradeAt);
      const now = new Date();
      value = upgraded.getUTCFullYear() === now.getUTCFullYear() &&
        upgraded.getUTCMonth() === now.getUTCMonth() &&
        upgraded.getUTCDate() === now.getUTCDate()
        ? 1
        : 0;
      break;
    }
    case 'auction_bids_today': {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      value = await Auction.countDocuments({
        'bids.bidderId': userId,
        'bids.timestamp': { $gte: dayStart },
      });
      break;
    }
    case 'money_earned_this_week': {
      value = userData.lifetimeStats?.totalMoneyEarned || 0;
      break;
    }
    case 'properties_bought_this_week': {
      const weekStart = new Date();
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      value = await Property.countDocuments({
        ownerId: userId,
        lastPurchaseDate: { $gte: weekStart },
      });
      break;
    }
    case 'auctions_won_this_week': {
      const weekStart = new Date();
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      value = await Auction.countDocuments({
        currentBidderId: userId,
        status: 'ended',
        updatedAt: { $gte: weekStart },
      });
      break;
    }
    case 'stocks_bought':
    case 'dividends_received': {
      value = 0;
      break;
    }
    default:
      value = 0;
  }

  return value;
}

export async function initializeMissionsForUser(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return [];

  const existingProgress = await MissionProgress.find({ userId }).lean();
  const existingMap = new Map(existingProgress.map((ep) => [ep.missionId, ep]));

  const missionsToCreate = [];
  for (const def of MISSION_DEFINITIONS) {
    if (def.hidden) continue;
    if (existingMap.has(def.id)) continue;

    if (def.prerequisiteMissionId) {
      const prereq = existingMap.get(def.prerequisiteMissionId);
      if (!prereq || prereq.status === 'active') continue;
    }

    const periodKey = getPeriodKey(def.type);
    const existingPeriod = periodKey
      ? existingProgress.find((ep) => ep.missionId === def.id && ep.periodKey === periodKey)
      : null;
    if (existingPeriod) continue;

    missionsToCreate.push({
      userId,
      missionId: def.id,
      status: 'active',
      progress: 0,
      target: def.condition.target,
      periodKey,
      startedAt: new Date(),
    });
  }

  if (missionsToCreate.length > 0) {
    await MissionProgress.insertMany(missionsToCreate, { ordered: false }).catch(() => {});
  }

  return missionsToCreate.length;
}

export async function updateMissionProgress(userId, triggerType) {
  await initializeMissionsForUser(userId);

  const user = await User.findById(userId).lean();
  if (!user) return { completed: [], updated: [] };

  const activeMissions = await MissionProgress.find({
    userId,
    status: 'active',
  }).lean();

  if (activeMissions.length === 0) return { completed: [], updated: [] };

  const completedMissions = [];
  const updatedMissions = [];

  for (const mp of activeMissions) {
    const def = getMissionById(mp.missionId);
    if (!def) continue;

    if (def.type === 'daily' || def.type === 'weekly' || def.type === 'seasonal') {
      const currentPeriodKey = getPeriodKey(def.type);
      if (mp.periodKey !== currentPeriodKey) {
        await MissionProgress.deleteOne({ _id: mp._id });
        continue;
      }
    }

    const currentValue = await evaluateCondition(userId, def.condition, user);
    const safeValue = Number.isFinite(currentValue) ? currentValue : 0;
    const safeTarget = Number.isFinite(def.condition.target) ? def.condition.target : 0;
    const newProgress = Math.min(safeValue, safeTarget);

    if (newProgress !== mp.progress) {
      await MissionProgress.updateOne({ _id: mp._id }, { progress: newProgress });

      emitToUser(userId.toString(), SOCKET_EVENTS.MISSION_PROGRESS, {
        missionId: mp.missionId,
        progress: newProgress,
        target: def.condition.target,
      });

      updatedMissions.push({ missionId: mp.missionId, progress: newProgress, target: def.condition.target });
    }

    if (newProgress >= def.condition.target && mp.status === 'active') {
      await MissionProgress.updateOne(
        { _id: mp._id },
        { status: 'completed', completedAt: new Date(), progress: def.condition.target },
      );

      emitToUser(userId.toString(), SOCKET_EVENTS.MISSION_COMPLETED, {
        missionId: mp.missionId,
        name: def.name,
        rewards: def.rewards,
      });

      await enqueueNotification({
        userId,
        type: 'mission_complete',
        title: 'Mission Complete!',
        message: `You completed "${def.name}". Tap to claim your reward!`,
        relatedId: mp._id,
      });

      completedMissions.push({ missionId: mp.missionId, name: def.name, rewards: def.rewards });
    }
  }

  return { completed: completedMissions, updated: updatedMissions };
}

export async function claimMissionReward(userId, missionId) {
  const def = getMissionById(missionId);
  if (!def) throw new Error('Mission not found');

  const mp = await MissionProgress.findOne({ userId, missionId, status: 'completed' });
  if (!mp) throw new Error('Mission not ready to claim');

  const updates = {};
  if (def.rewards.xp) {
    const user = await User.findById(userId);
    user.xp = (user.xp || 0) + def.rewards.xp;
    updates.xp = def.rewards.xp;
    await user.save();
  }
  if (def.rewards.balance) {
    await User.updateOne({ _id: userId }, { $inc: { balance: def.rewards.balance } });
    updates.balance = def.rewards.balance;
  }
  if (def.rewards.badge) {
    await User.updateOne({ _id: userId }, { $addToSet: { achievements: def.rewards.badge } });
    updates.badge = def.rewards.badge;
  }
  if (def.rewards.title) {
    updates.title = def.rewards.title;
  }

  await MissionProgress.updateOne(
    { _id: mp._id },
    {
      status: 'claimed',
      claimedAt: new Date(),
      rewardsClaimed: updates,
    },
  );

  emitToUser(userId.toString(), SOCKET_EVENTS.MISSION_REWARD_CLAIMED, {
    missionId,
    name: def.name,
    rewards: def.rewards,
  });

  await enqueueNotification({
    userId,
    type: 'mission_reward',
    title: 'Reward Claimed!',
    message: `You claimed rewards for "${def.name}"!`,
    relatedId: mp._id,
  });

  await initializeMissionsForUser(userId);

  return { rewards: def.rewards, missionId };
}

export async function refreshDailyMissions(userId) {
  await MissionProgress.deleteMany({
    userId,
    missionId: { $in: MISSION_DEFINITIONS.filter((m) => m.type === 'daily').map((m) => m.id) },
  });
  await initializeMissionsForUser(userId);
}

export async function refreshWeeklyMissions(userId) {
  await MissionProgress.deleteMany({
    userId,
    missionId: { $in: MISSION_DEFINITIONS.filter((m) => m.type === 'weekly').map((m) => m.id) },
  });
  await initializeMissionsForUser(userId);
}

export async function processMissionReset() {
  const dailyPeriodKey = getDailyPeriodKey();
  const dailyMissions = MISSION_DEFINITIONS.filter((m) => m.type === 'daily');
  const dailyIds = dailyMissions.map((m) => m.id);

  const oldDaily = await MissionProgress.find({
    missionId: { $in: dailyIds },
    periodKey: { $ne: dailyPeriodKey },
  }).distinct('userId');

  for (const userId of oldDaily) {
    await refreshDailyMissions(userId);
  }

  const weeklyPeriodKey = getWeeklyPeriodKey();
  const weeklyMissions = MISSION_DEFINITIONS.filter((m) => m.type === 'weekly');
  const weeklyIds = weeklyMissions.map((m) => m.id);

  const oldWeekly = await MissionProgress.find({
    missionId: { $in: weeklyIds },
    periodKey: { $ne: weeklyPeriodKey },
  }).distinct('userId');

  for (const userId of oldWeekly) {
    await refreshWeeklyMissions(userId);
  }

  return { dailyRefreshed: oldDaily.length, weeklyRefreshed: oldWeekly.length };
}

export async function getMissionDashboard(userId) {
  const progresses = await MissionProgress.find({ userId }).sort({ completedAt: -1, startedAt: -1 }).lean();

  const active = [];
  const completed = [];
  const claimed = [];

  for (const mp of progresses) {
    const def = getMissionById(mp.missionId);
    if (!def) continue;
    const enriched = { ...mp, definition: def };
    if (mp.status === 'active') active.push(enriched);
    else if (mp.status === 'completed') completed.push(enriched);
    else if (mp.status === 'claimed') claimed.push(enriched);
  }

  const dailyActive = active.filter((m) => m.definition.type === 'daily');
  const weeklyActive = active.filter((m) => m.definition.type === 'weekly');
  const permanentActive = active.filter(
    (m) => m.definition.type === 'permanent' || m.definition.type === 'seasonal' || m.definition.type === 'event',
  );

  return {
    active,
    completed,
    claimed,
    dailyActive,
    weeklyActive,
    permanentActive,
    stats: {
      totalActive: active.length,
      totalCompleted: completed.length,
      totalClaimed: claimed.length,
      completionRate: progresses.length > 0 ? Math.round((claimed.length / progresses.length) * 100) : 0,
    },
  };
}
