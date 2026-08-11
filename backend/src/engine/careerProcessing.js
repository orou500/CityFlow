import User from '../models/User.js';
import Property from '../models/Property.js';
import District from '../models/District.js';
import Auction from '../models/Auction.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import Loan from '../models/Loan.js';
import ConstructionProject from '../models/ConstructionProject.js';
import MarketReport from '../models/MarketReport.js';
import StockHolding from '../models/StockHolding.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { getXpForLevel } from '../utils/leveling.js';
import {
  ACHIEVEMENT_DEFINITIONS,
  MAX_LEVEL,
  PRESTIGE_REQUIREMENT_LEVEL,
  MAX_PRESTIGE,
} from '../config/achievements.js';
import { emitToUser } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { cacheDel } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';

export async function awardXpAndLevels(userId, xpAmount) {
  const user = await User.findById(userId);
  if (!user) return null;

  user.xp += xpAmount;

  let levelUps = 0;
  while (user.xp >= user.xpToNextLevel && user.level < MAX_LEVEL) {
    user.xp -= user.xpToNextLevel;
    user.level += 1;
    user.xpToNextLevel = getXpForLevel(user.level);
    levelUps++;
  }

  if (user.level >= MAX_LEVEL) {
    user.xp = 0;
    user.xpToNextLevel = getXpForLevel(MAX_LEVEL);
  }

  await user.save();

  if (levelUps > 0) {
    const levelText =
      levelUps === 1 ? `You reached Level ${user.level}!` : `You reached Level ${user.level}! (${levelUps} level-ups)`;
    await enqueueNotification({
      userId: user._id,
      type: 'system',
      title: 'Level Up!',
      message: levelText,
      eventKey: `levelup:${user._id}:${user.level}`,
      route: '/career',
      tab: 'overview',
      entityType: 'career',
      entityId: user._id,
      global: false,
    });
  }

  return { level: user.level, xp: user.xp, xpToNextLevel: user.xpToNextLevel, levelUps };
}

async function evaluateAchievementCondition(user, condition) {
  const userData = user.toObject ? user.toObject() : user;
  const userId = userData._id;

  switch (condition.type) {
    case 'properties_owned':
      return await Property.countDocuments({ ownerId: userId });
    case 'total_rent_collected':
      return userData.lifetimeStats?.totalRentCollected || 0;
    case 'net_worth': {
      const balance = userData.balance || 0;
      const properties = await Property.find({ ownerId: userId }).lean();
      const propertyValue = properties.reduce((sum, p) => sum + (p.currentPrice || 0), 0);
      return balance + propertyValue;
    }
    case 'auctions_won':
      return await Auction.countDocuments({ winnerId: userId, status: 'ended' });
    case 'companies_created':
      return await RealEstateCompany.countDocuments({ founderId: userId });
    case 'company_role_ceo': {
      return userData.companyId && userData.companyRole === 'ceo' ? 1 : 0;
    }
    case 'company_ipo_completed':
      return await RealEstateCompany.countDocuments({ founderId: userId, 'ipo.listed': true });
    case 'credit_score':
      return userData.creditScore || 0;
    case 'active_loans': {
      const activeCount = await Loan.countDocuments({ userId: userId, active: true });
      if (activeCount > 0) return activeCount;
      const totalLoanCount = await Loan.countDocuments({ userId: userId });
      if (totalLoanCount === 0) return -1;
      return 0;
    }
    case 'total_loans_taken':
      return userData.lifetimeStats?.totalLoansTaken || 0;
    case 'total_construction_completed':
      return await ConstructionProject.countDocuments({ ownerId: userId, status: 'completed' });
    case 'unique_cities': {
      const cities = await Property.distinct('cityId', { ownerId: userId });
      return cities.length;
    }
    case 'district_leader': {
      const districts = await District.find({ 'influence.score': { $gt: 0 } }).lean();
      for (const d of districts) {
        const sorted = [...d.influence].sort((a, b) => b.score - a.score);
        if (sorted.length > 0 && sorted[0].userId?.toString() === userId.toString()) return 1;
      }
      return 0;
    }
    case 'unique_districts': {
      const districts = await Property.distinct('districtId', { ownerId: userId });
      return districts.length;
    }
    case 'reports_purchased':
      return await MarketReport.countDocuments({ userId });
    case 'forecast_accuracy_95': {
      const best = await MarketReport.findOne({ userId }).sort({ forecastAccuracy: -1 }).lean();
      return best && best.forecastAccuracy >= 95 ? 1 : 0;
    }
    case 'prestige_level':
      return userData.prestigeLevel || 0;
    case 'stock_portfolio_value': {
      const holdings = await StockHolding.find({ userId });
      return holdings.reduce((sum, h) => sum + h.shares * h.avgBuyPrice, 0);
    }
    default:
      return 0;
  }
}

export async function checkAndAwardAchievements(userId, _triggerType) {
  const user = await User.findById(userId);
  if (!user) return [];

  const existingBadges = user.achievements || [];
  const existingTitles = user.titles || [];
  const newlyCompleted = [];

  const visibleAchievements = ACHIEVEMENT_DEFINITIONS;

  for (const ach of visibleAchievements) {
    if (existingBadges.includes(ach.id)) continue;

    const currentValue = await evaluateAchievementCondition(user, ach.condition);
    if (currentValue >= ach.condition.target) {
      const updates = {};

      if (ach.points) {
        user.achievementPoints = (user.achievementPoints || 0) + ach.points;
        updates.achievementPoints = ach.points;
      }

      user.achievements.push(ach.id);

      if (ach.rewardBadge && !existingBadges.includes(ach.rewardBadge)) {
        user.achievements.push(ach.rewardBadge);
      }

      if (ach.rewardTitle && !existingTitles.includes(ach.rewardTitle)) {
        user.titles.push(ach.rewardTitle);
      }

      newlyCompleted.push({
        id: ach.id,
        name: ach.name,
        points: ach.points,
        rewardBadge: ach.rewardBadge,
        rewardTitle: ach.rewardTitle,
      });
    }
  }

  if (newlyCompleted.length > 0) {
    await user.save();

    for (const ach of newlyCompleted) {
      let message = `Achievement unlocked: ${ach.name}`;
      if (ach.points) message += ` (+${ach.points} pts)`;

      await enqueueNotification({
        userId: user._id,
        type: 'system',
        title: 'Achievement Unlocked!',
        message,
        eventKey: `achievement:${user._id}:${ach.id}:unlocked`,
        route: '/career',
        tab: 'achievements',
        entityType: 'achievement',
        global: false,
      });
    }

    emitToUser(user._id.toString(), SOCKET_EVENTS.ACHIEVEMENT_UNLOCKED, { achievements: newlyCompleted });
    emitToUser(user._id.toString(), SOCKET_EVENTS.CAREER_UPDATED, {});

    await cacheDel(cacheKeys.careerDashboard(user._id.toString())).catch(() => {});
  }

  return newlyCompleted;
}

export async function processPrestige(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  if (user.level < PRESTIGE_REQUIREMENT_LEVEL) {
    throw new Error(`Must be at least level ${PRESTIGE_REQUIREMENT_LEVEL} to prestige`);
  }

  if (user.prestigeLevel >= MAX_PRESTIGE) {
    throw new Error('Maximum prestige level reached');
  }

  user.prestigeLevel += 1;
  user.level = 1;
  user.xp = 0;
  user.xpToNextLevel = getXpForLevel(1);

  let message = `You have reached Prestige Level ${user.prestigeLevel}!`;
  await enqueueNotification({
    userId: user._id,
    type: 'system',
    title: 'Prestige!',
    message,
    eventKey: `prestige:${user._id}:${user.prestigeLevel}`,
    route: '/career',
    tab: 'overview',
    entityType: 'career',
    entityId: user._id,
    global: false,
  });

  await user.save();

  return {
    prestigeLevel: user.prestigeLevel,
    level: user.level,
    xp: user.xp,
    xpToNextLevel: user.xpToNextLevel,
  };
}

export async function getCareerDashboard(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return null;

  const allAchievements = ACHIEVEMENT_DEFINITIONS;
  const earnedIds = user.achievements || [];

  const achievementsWithStatus = allAchievements.map((ach) => ({
    ...ach,
    earned: earnedIds.includes(ach.id),
  }));

  const totalPoints = ACHIEVEMENT_DEFINITIONS.reduce((sum, a) => sum + a.points, 0);

  return {
    level: user.level,
    xp: user.xp,
    xpToNextLevel: user.xpToNextLevel,
    prestigeLevel: user.prestigeLevel || 0,
    title: user.title || '',
    titles: user.titles || [],
    achievements: achievementsWithStatus,
    achievementPoints: user.achievementPoints || 0,
    totalAchievementPoints: totalPoints,
    earnedAchievementCount: achievementsWithStatus.filter((a) => a.earned).length,
    totalAchievementCount: allAchievements.length,
    maxLevel: MAX_LEVEL,
    maxPrestige: MAX_PRESTIGE,
    prestigeRequirementLevel: PRESTIGE_REQUIREMENT_LEVEL,
  };
}

export async function setDisplayTitle(userId, title) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  if (!title) {
    user.title = '';
    await user.save();
    return { title: '' };
  }

  if (!user.titles.includes(title)) {
    throw new Error('Title not earned');
  }

  user.title = title;
  await user.save();
  return { title };
}
