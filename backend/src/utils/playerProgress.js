import User from '../models/User.js';
import { updateMissionProgress } from '../engine/missionProcessing.js';
import { checkAndAwardAchievements } from '../engine/careerProcessing.js';
import { awardXp } from './leveling.js';
import { advanceOnboarding } from './onboardingTour.js';
import { cacheDel } from './cache.js';
import { cacheKeys } from './cacheKeys.js';
import { emitToUser } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';

const XP_REWARDS = {
  property_buy: 10,
  property_sell: 5,
  property_upgrade: 15,
  property_grade_upgrade: 15,
  rent_collect: 5,
  construction_start: 15,
  upgrade: 10,
  improvement_start: 10,
  company_construction_start: 15,
  loan_take: 5,
  loan_repay: 3,
  company_create: 25,
  company_ipo: 50,
  email_verified: 10,
  friend_add: 5,
  auction_create: 5,
  auction_bid: 2,
  auction_won: 20,
  auction_sold: 10,
  company_apply: 5,
  treasury_deposit: 3,
  company_property_purchase: 10,
  company_property_sell: 5,
  company_loan_take: 3,
  company_loan_repay: 2,
  stocks_buy: 2,
  stocks_sell: 2,
  stocks_dividend: 2,
  report_purchase: 5,
  contract_propose: 5,
  offer_create: 2,
  investment_create: 5,
  visit: 1,
  login: 0,
};

export async function processPlayerProgress(userId, event, options = {}) {
  const { skipXp, xpAmount } = options;
  const userIdStr = userId?.toString?.() || userId;
  if (!userIdStr) return { missionResult: null, newAchievements: [], xpResult: null };

  let missionResult = null;
  let newAchievements = [];
  let xpResult = null;

  try {
    missionResult = await updateMissionProgress(userId, event);
  } catch (err) {
    console.error(`[PROGRESS] ERROR in updateMissionProgress:`, err);
  }

  try {
    newAchievements = await checkAndAwardAchievements(userId, event);
  } catch (err) {
    console.error(`[PROGRESS] ERROR in checkAndAwardAchievements:`, err);
  }

  if (!skipXp) {
    try {
      const amount = xpAmount !== undefined ? xpAmount : XP_REWARDS[event];
      if (amount && amount > 0) {
        const user = await User.findById(userIdStr);
        if (user) {
          xpResult = await awardXp(user, amount, event);
        }
      }
    } catch (err) {
      console.error(`[PROGRESS] ERROR in awardXp:`, err);
    }
  }

  try {
    await advanceOnboarding(userIdStr, event);
  } catch (err) {
    console.error(`[PROGRESS] ERROR in advanceOnboarding:`, err);
  }

  try {
    await Promise.all([
      cacheDel(cacheKeys.missionDashboard(userIdStr)).catch(() => {}),
      cacheDel(cacheKeys.careerDashboard(userIdStr)).catch(() => {}),
    ]);
  } catch (err) {
    console.error(`[PROGRESS] ERROR in cache invalidation:`, err);
  }

  try {
    emitToUser(userIdStr, SOCKET_EVENTS.CAREER_UPDATED, {});
  } catch (err) {
    console.error(`[PROGRESS] ERROR in socket emit:`, err);
  }

  return { missionResult, newAchievements, xpResult };
}
