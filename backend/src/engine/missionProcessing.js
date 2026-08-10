import mongoose from 'mongoose';
import MissionProgress from '../models/MissionProgress.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Loan from '../models/Loan.js';
import MarketReport from '../models/MarketReport.js';
import Auction from '../models/Auction.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import District from '../models/District.js';
import Transaction from '../models/Transaction.js';
import ConstructionProject from '../models/ConstructionProject.js';
import { MISSION_DEFINITIONS, getMissionById } from '../config/missions.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { emitToUser } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { awardXp } from '../utils/leveling.js';
import { getMultipleStatuses, STATUS } from '../utils/presence.js';

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

export async function evaluateCondition(userId, missionId, condition, userData) {
  let value;
  switch (condition.type) {
    // ── PROPERTY CONDITIONS ──────────────────────────────
    case 'properties_owned': {
      value = await Property.countDocuments({ ownerId: userId });
      break;
    }
    case 'total_rent_collected': {
      value = await Transaction.countDocuments({ buyerId: userId, type: 'rent' });
      break;
    }
    case 'total_upgrades': {
      value = await Transaction.countDocuments({ buyerId: userId, type: { $in: ['upgrade', 'grade_upgrade'] } });
      break;
    }
    case 'total_properties_sold': {
      value = await Transaction.countDocuments({
        sellerId: userId,
        type: { $in: ['sell', 'buy'] },
      });
      break;
    }

    // ── AUCTION CONDITIONS ───────────────────────────────
    case 'auctions_won': {
      value = await Auction.countDocuments({ winnerId: userId, status: 'ended' });
      break;
    }
    case 'auctions_sold': {
      value = await Auction.countDocuments({ sellerId: userId, status: 'ended' });
      break;
    }
    case 'rare_auctions_won': {
      const wonAuctionPropIds = await Auction.find({ winnerId: userId, status: 'ended' }).distinct('propertyId');
      value = await Property.countDocuments({
        _id: { $in: wonAuctionPropIds },
        propertyRating: 'elite',
      });
      break;
    }

    // ── INCOME / NET WORTH CONDITIONS ────────────────────
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

    // ── PROPERTY QUALITY CONDITIONS ──────────────────────
    case 'own_legendary_property': {
      value = await Property.countDocuments({ ownerId: userId, propertyRating: 'elite' });
      break;
    }

    // ── GEOGRAPHIC CONDITIONS ────────────────────────────
    case 'unique_cities': {
      const cityIds = await Property.find({ ownerId: userId }).distinct('cityId');
      value = cityIds.length;
      break;
    }
    case 'city_owned': {
      const city = await mongoose.model('City').findOne({ name: condition.cityName }).lean();
      value = city ? await Property.countDocuments({ ownerId: userId, cityId: city._id }) : 0;
      break;
    }
    case 'unique_districts': {
      const districtIds = await Property.find({ ownerId: userId }).distinct('districtId');
      value = districtIds.filter(Boolean).length;
      break;
    }
    case 'district_leader': {
      const districts = await District.find({ 'influence.userId': userId }).lean();
      value = 0;
      for (const district of districts) {
        const userEntry = district.influence.find((i) => i.userId.toString() === userId.toString());
        if (!userEntry) continue;
        const topScore = Math.max(...district.influence.map((i) => i.score));
        if (userEntry.score >= topScore) value++;
      }
      break;
    }

    // ── CONSTRUCTION / DEVELOPMENT CONDITIONS ────────────
    case 'total_construction_completed': {
      value = await ConstructionProject.countDocuments({ ownerId: userId, status: 'completed' });
      break;
    }

    // ── BANKING / LOAN CONDITIONS ────────────────────────
    case 'total_loans_taken': {
      value = await Loan.countDocuments({ userId });
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
      const repaidLoans = await Loan.find({ userId, active: false }).lean();
      value = repaidLoans.reduce((sum, l) => sum + (l.principal || 0), 0);
      break;
    }

    // ── COMPANY CONDITIONS ───────────────────────────────
    case 'joined_company': {
      value = (await RealEstateCompany.countDocuments({ 'members.userId': userId })) > 0 ? 1 : 0;
      break;
    }
    case 'created_company': {
      value = await RealEstateCompany.countDocuments({ founderId: userId });
      break;
    }
    case 'company_votes_cast': {
      const companiesWithVotes = await RealEstateCompany.find({
        'members.userId': userId,
      })
        .select('loanRequests propertyPurchaseRequests')
        .lean();
      let voteCount = 0;
      for (const company of companiesWithVotes) {
        for (const lr of company.loanRequests || []) {
          if (lr.votes?.some((v) => v.userId?.toString() === userId.toString())) voteCount++;
        }
        for (const pr of company.propertyPurchaseRequests || []) {
          if (pr.votes?.some((v) => v.userId?.toString() === userId.toString())) voteCount++;
        }
      }
      value = voteCount;
      break;
    }
    case 'company_projects_completed': {
      value = await ConstructionProject.countDocuments({
        ownerId: userId,
        companyId: { $ne: null },
        status: 'completed',
      });
      break;
    }
    case 'company_properties_purchased': {
      const userCompany = await RealEstateCompany.findOne({ 'members.userId': userId }).select('_id').lean();
      value = userCompany ? await Property.countDocuments({ companyId: userCompany._id }) : 0;
      break;
    }

    // ── MARKET INTELLIGENCE CONDITIONS ───────────────────
    case 'reports_purchased': {
      value = await MarketReport.countDocuments({ userId });
      break;
    }
    case 'forecast_accuracy_90': {
      const accurateReport = await MarketReport.findOne({ userId, forecastAccuracy: { $gte: 90 } }).lean();
      value = accurateReport ? 1 : 0;
      break;
    }

    // ── TODAY / THIS WEEK CONDITIONS ─────────────────────
    case 'properties_bought_today': {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      value = await Property.countDocuments({ ownerId: userId, lastPurchaseDate: { $gte: dayStart } });
      break;
    }
    case 'rent_collected_today': {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const rentTxToday = await Transaction.countDocuments({
        buyerId: userId,
        type: 'rent',
        createdAt: { $gte: dayStart },
      });
      value = rentTxToday > 0 ? 1 : 0;
      break;
    }
    case 'bonus_claimed_today': {
      if (!userData.lastPeriodBonusClaim) {
        value = 0;
        break;
      }
      const claimed = new Date(userData.lastPeriodBonusClaim);
      const now = new Date();
      value =
        claimed.getUTCFullYear() === now.getUTCFullYear() &&
        claimed.getUTCMonth() === now.getUTCMonth() &&
        claimed.getUTCDate() === now.getUTCDate()
          ? 1
          : 0;
      break;
    }
    case 'login_today': {
      const now = new Date();
      const isSameUtcDay = (d) => {
        if (!d) return false;
        const date = new Date(d);
        return (
          date.getUTCFullYear() === now.getUTCFullYear() &&
          date.getUTCMonth() === now.getUTCMonth() &&
          date.getUTCDate() === now.getUTCDate()
        );
      };
      if (isSameUtcDay(userData.lastLoginAt) || isSameUtcDay(userData.lastDailyLogin)) {
        value = 1;
        break;
      }
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const loginTxToday = await Transaction.countDocuments({
        buyerId: userId,
        type: 'login',
        createdAt: { $gte: dayStart },
      });
      value = loginTxToday > 0 ? 1 : 0;
      break;
    }
    case 'upgrades_today': {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      value = await Transaction.countDocuments({
        buyerId: userId,
        type: { $in: ['upgrade', 'grade_upgrade'] },
        createdAt: { $gte: dayStart },
      });
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

    // ── WEEKLY CONDITIONS ───────────────────────────────
    case 'money_earned_this_week': {
      const weekStart = new Date();
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      const [sellTxs, rentTxs] = await Promise.all([
        Transaction.find({ sellerId: userId, type: 'sell', createdAt: { $gte: weekStart } }).lean(),
        Transaction.find({ buyerId: userId, type: 'rent', createdAt: { $gte: weekStart } }).lean(),
      ]);
      value = [...sellTxs, ...rentTxs].reduce((sum, t) => sum + (t.price || 0), 0);
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
        winnerId: userId,
        status: 'ended',
        updatedAt: { $gte: weekStart },
      });
      break;
    }
    case 'rent_collected_this_week': {
      const weekStart = new Date();
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      value = await Transaction.countDocuments({
        buyerId: userId,
        type: 'rent',
        createdAt: { $gte: weekStart },
      });
      break;
    }
    case 'bonus_claimed_this_week': {
      const weekStart = new Date();
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      value = await Transaction.countDocuments({
        buyerId: userId,
        type: 'period_bonus',
        createdAt: { $gte: weekStart },
      });
      break;
    }
    case 'login_this_week': {
      if (!userData.lastLoginAt) {
        value = 0;
        break;
      }
      const weekStart = new Date();
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      value = userData.lastLoginAt >= weekStart ? 1 : 0;
      break;
    }
    case 'login_count_this_week': {
      const weekStart = new Date();
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      value = await Transaction.countDocuments({
        buyerId: userId,
        type: 'login',
        createdAt: { $gte: weekStart },
      });
      break;
    }

    // ── FUTURE / STOCK MARKET (placeholder) ──────────────
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
  if (!user) {
    return [];
  }

  const existingProgress = await MissionProgress.find({ userId }).lean();
  const existingMap = new Map(existingProgress.map((ep) => [ep.missionId, ep]));

  const missionsToCreate = [];
  for (const def of MISSION_DEFINITIONS) {
    if (def.hidden) {
      continue;
    }
    if (existingMap.has(def.id)) {
      continue;
    }

    if (def.prerequisiteMissionId) {
      const prereq = existingMap.get(def.prerequisiteMissionId);
      if (!prereq || prereq.status === 'active') {
        continue;
      }
    }

    const periodKey = getPeriodKey(def.type);
    const existingPeriod = periodKey
      ? existingProgress.find((ep) => ep.missionId === def.id && ep.periodKey === periodKey)
      : null;
    if (existingPeriod) {
      continue;
    }

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
    await MissionProgress.insertMany(missionsToCreate, { ordered: false }).catch((err) => {
      console.error(`[MISSION INIT] insertMany error:`, err.message);
    });
  }

  return missionsToCreate.length;
}

export async function updateMissionProgress(userId, triggerType) {
  await initializeMissionsForUser(userId);

  const user = await User.findById(userId).lean();
  if (!user) {
    return { completed: [], updated: [] };
  }

  const activeMissions = await MissionProgress.find({
    userId,
    status: 'active',
  }).lean();

  if (activeMissions.length === 0) {
    return { completed: [], updated: [] };
  }

  const completedMissions = [];
  const updatedMissions = [];

  for (const mp of activeMissions) {
    const def = getMissionById(mp.missionId);
    if (!def) {
      continue;
    }

    if (def.type === 'daily' || def.type === 'weekly' || def.type === 'seasonal') {
      const currentPeriodKey = getPeriodKey(def.type);
      if (mp.periodKey !== currentPeriodKey) {
        await MissionProgress.deleteOne({ _id: mp._id });
        continue;
      }
    }

    const currentValue = await evaluateCondition(userId, mp.missionId, def.condition, user);
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
        route: '/missions',
        tab: 'completed',
        entityType: 'mission',
      });

      completedMissions.push({ missionId: mp.missionId, name: def.name, rewards: def.rewards });
    }
  }

  return { completed: completedMissions, updated: updatedMissions };
}

export async function claimMissionReward(userId, missionId) {
  const def = getMissionById(missionId);
  if (!def) throw new Error('Mission not found');

  const mp = await MissionProgress.findOneAndUpdate(
    { userId, missionId, status: 'completed' },
    { status: 'claimed', claimedAt: new Date() },
    { new: true },
  );
  if (!mp) throw new Error('Mission not ready to claim');

  const updates = {};
  if (def.rewards.xp) {
    const user = await User.findById(userId);
    await awardXp(user, def.rewards.xp, 'mission_reward');
    updates.xp = def.rewards.xp;
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

  await MissionProgress.updateOne({ _id: mp._id }, { rewardsClaimed: updates });

  emitToUser(userId.toString(), SOCKET_EVENTS.MISSION_REWARD_CLAIMED, {
    missionId,
    name: def.name,
    rewards: def.rewards,
  });

  // No notification on collect: the player was already notified when the
  // mission was completed ("Mission Complete"). Collecting only grants the
  // reward — creating another notification here caused duplicates.

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

export async function markDailyLoginForUser(userId) {
  const user = await User.findById(userId).select('lastDailyLogin lastLoginAt').lean();
  if (!user) return false;

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const isToday = (d) => !!d && new Date(d).toISOString().slice(0, 10) === todayKey;
  if (isToday(user.lastDailyLogin) || isToday(user.lastLoginAt)) {
    return false;
  }

  await refreshDailyMissions(userId);
  await User.updateOne({ _id: userId }, { $set: { lastDailyLogin: now } });
  await updateMissionProgress(userId, 'daily_login');
  return true;
}

export async function processMissionReset() {
  const dailyPeriodKey = getDailyPeriodKey();
  const dailyMissions = MISSION_DEFINITIONS.filter((m) => m.type === 'daily');
  const dailyIds = dailyMissions.map((m) => m.id);

  const oldDaily = await MissionProgress.find({
    missionId: { $in: dailyIds },
    periodKey: { $ne: dailyPeriodKey },
  }).distinct('userId');

  const presenceStatuses = await getMultipleStatuses(oldDaily);
  const presenceMap = new Map(presenceStatuses.map((p) => [p.userId.toString(), p.status]));
  let onlineDailyLogins = 0;

  for (const userId of oldDaily) {
    await refreshDailyMissions(userId);
    if (presenceMap.get(userId.toString()) === STATUS.ONLINE || presenceMap.get(userId.toString()) === STATUS.IDLE) {
      await User.updateOne({ _id: userId }, { $set: { lastDailyLogin: new Date() } });
      await updateMissionProgress(userId, 'daily_login');
      onlineDailyLogins++;
    }
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

  return { dailyRefreshed: oldDaily.length, weeklyRefreshed: oldWeekly.length, onlineDailyLogins };
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
