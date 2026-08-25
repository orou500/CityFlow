import RealEstateCompany from '../models/RealEstateCompany.js';
import CompanyMissionProgress from '../models/CompanyMissionProgress.js';
import Property from '../models/Property.js';
import Transaction from '../models/Transaction.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { emitToUser } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import {
  COMPANY_MISSION_DEFINITIONS,
  getCompanyDailyMissions,
  getCompanyWeeklyMissions,
} from '../config/companyMissions.js';
import { addTreasuryTransaction } from './companyProcessing.js';
import { getLevelFromTotalXP, getCompanyLevelBenefits, LEVEL_UP_REWARDS } from '../config/companyProgression.js';

function getDailyPeriodKey() {
  const d = new Date();
  return `daily:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getWeeklyPeriodKey() {
  const d = new Date();
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((d - jan1) / 86400000);
  const weekNumber = Math.ceil((days + jan1.getUTCDay() + 1) / 7);
  return `weekly:${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

export async function evaluateCompanyCondition(companyId, condition, company) {
  const comp = company || (await RealEstateCompany.findById(companyId).lean());
  if (!comp) return 0;
  const stats = comp.stats || {};

  switch (condition.type) {
    case 'company_properties_owned': {
      return await Property.countDocuments({ companyId, forSale: false });
    }
    case 'company_cities_with_properties': {
      const props = await Property.find({ companyId, forSale: false }).select('cityId').lean();
      return new Set(props.map((p) => String(p.cityId))).size;
    }
    case 'company_districts_with_properties': {
      const props = await Property.find({ companyId, forSale: false }).select('districtId').lean();
      const ids = props.filter((p) => p.districtId).map((p) => String(p.districtId));
      return new Set(ids).size;
    }
    case 'company_total_rent_collected': {
      return stats.totalRentalIncome || 0;
    }
    case 'company_net_worth': {
      return stats.netWorth || 0;
    }
    case 'company_member_count': {
      return comp.members?.length || 0;
    }
    case 'company_developments_total': {
      return stats.totalDevelopments || 0;
    }
    case 'company_profitable_sales': {
      return stats.totalPropertiesSold || 0;
    }
    case 'company_auctions_won': {
      const { default: Auction } = await import('../models/Auction.js');
      return await Auction.countDocuments({ companyId, status: 'ended' });
    }
    case 'company_rent_collected_today': {
      const tickNow = global.currentTick || 0;
      const txns = await Transaction.find({
        companyId,
        type: 'rent',
        tick: { $gte: tickNow },
      }).lean();
      return txns.reduce((sum, t) => sum + (t.amount || 0), 0);
    }
    case 'company_unique_contributors_today': {
      const tickNow = global.currentTick || 0;
      const txns = await Transaction.find({
        companyId,
        tick: { $gte: tickNow },
        buyerId: { $ne: null },
      })
        .select('buyerId')
        .lean();
      return new Set(txns.map((t) => String(t.buyerId))).size;
    }
    case 'company_treasury_deposit_today': {
      const tickNow = global.currentTick || 0;
      const txns = await Transaction.find({
        companyId,
        type: 'deposit',
        tick: { $gte: tickNow },
      }).lean();
      return txns.reduce((sum, t) => sum + (t.amount || 0), 0);
    }
    case 'company_upgrades_today': {
      const tickNow = global.currentTick || 0;
      return await Transaction.countDocuments({
        companyId,
        type: { $in: ['upgrade', 'grade_upgrade'] },
        tick: { $gte: tickNow },
      });
    }
    case 'company_properties_acquired_week': {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - weekMs);
      return await Transaction.countDocuments({
        companyId,
        type: 'buy',
        createdAt: { $gte: cutoff },
      });
    }
    case 'company_rent_collected_week': {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - weekMs);
      const txns = await Transaction.find({
        companyId,
        type: 'rent',
        createdAt: { $gte: cutoff },
      })
        .select('amount')
        .lean();
      return txns.reduce((sum, t) => sum + (t.amount || 0), 0);
    }
    case 'company_unique_contributors_week': {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - weekMs);
      const txns = await Transaction.find({
        companyId,
        buyerId: { $ne: null },
        createdAt: { $gte: cutoff },
      })
        .select('buyerId')
        .lean();
      return new Set(txns.map((t) => String(t.buyerId))).size;
    }
    case 'company_transactions_week': {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - weekMs);
      return await Transaction.countDocuments({
        companyId,
        type: { $in: ['buy', 'sell'] },
        createdAt: { $gte: cutoff },
      });
    }
    case 'company_developments_week': {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - weekMs);
      return await Transaction.countDocuments({
        companyId,
        type: { $in: ['upgrade', 'grade_upgrade'] },
        createdAt: { $gte: cutoff },
      });
    }
    default:
      return 0;
  }
}

export async function updateCompanyMissionProgress(companyId, triggerType, userId) {
  const company = await RealEstateCompany.findById(companyId);
  if (!company || !company.active) return [];

  const active = await CompanyMissionProgress.find({
    companyId,
    status: 'active',
  });

  const completed = [];

  for (const mission of active) {
    const def = COMPANY_MISSION_DEFINITIONS.find((m) => m.id === mission.missionId);
    if (!def) continue;

    const progress = await evaluateCompanyCondition(companyId, def.condition, company);
    if (progress <= mission.progress) continue;

    mission.progress = progress;

    if (userId) {
      const existing = mission.contributors.find((c) => String(c.userId) === String(userId));
      if (existing) {
        existing.contribution += 1;
        existing.contributedAt = new Date();
      } else {
        mission.contributors.push({ userId, contribution: 1, contributedAt: new Date() });
      }
    }

    if (mission.progress >= mission.target) {
      mission.status = 'completed';
      mission.completedAt = new Date();
      completed.push(mission);

      const memberUserIds = company.members.map((m) => m.userId);
      for (const uid of memberUserIds) {
        await enqueueNotification({
          userId: uid,
          type: 'system',
          title: 'Company Mission Completed!',
          message: `"${company.name}" completed "${def.name}"!`,
          eventKey: `company:${companyId}:mission:${mission.missionId}:completed:${uid}`,
          route: `/real-estate-companies/${companyId}`,
          tab: 'missions',
          entityType: 'companyMission',
          entityId: mission._id,
          relatedId: companyId,
          global: false,
        });

        emitToUser(uid, SOCKET_EVENTS.COMPANY_MISSION_COMPLETED, {
          companyId,
          missionId: mission.missionId,
          name: def.name,
          rewards: def.rewards,
        });
      }
    }

    await mission.save();
  }

  return completed;
}

export async function claimCompanyMissionReward(companyId, missionId, userId) {
  const mission = await CompanyMissionProgress.findOneAndUpdate(
    { companyId, missionId, status: 'completed' },
    { status: 'claimed', claimedAt: new Date() },
    { new: true },
  );

  if (!mission) return null;

  const def = COMPANY_MISSION_DEFINITIONS.find((m) => m.id === missionId);
  if (!def) return null;

  const company = await RealEstateCompany.findById(companyId);
  if (!company) return null;

  const tickNumber = global.currentTick || 0;

  if (def.rewards.xp > 0) {
    company.xp += def.rewards.xp;
    while (getLevelFromTotalXP(company.xp) > company.level) {
      company.level += 1;
      const benefits = getCompanyLevelBenefits(company.level);
      company.maxMembers = benefits.maxMembers;
      const treasuryBonus = LEVEL_UP_REWARDS.treasuryBonus(company.level);
      const xpBonus = LEVEL_UP_REWARDS.xpBonus(company.level);
      const repBonus = LEVEL_UP_REWARDS.reputationBonus(company.level);
      company.treasury.balance += treasuryBonus;
      addTreasuryTransaction(
        company,
        { type: 'deposit', amount: treasuryBonus, description: `Level ${company.level} reward` },
        tickNumber,
      );
      company.xp += xpBonus;
      company.reputation += repBonus;
    }
  }

  if (def.rewards.treasury > 0) {
    company.treasury.balance += def.rewards.treasury;
    addTreasuryTransaction(
      company,
      { type: 'deposit', amount: def.rewards.treasury, userId, description: `Mission reward: "${def.name}"` },
      tickNumber,
    );
  }

  if (def.rewards.reputation > 0) {
    company.reputation += def.rewards.reputation;
  }

  mission.rewardsClaimed = {
    xp: def.rewards.xp,
    treasury: def.rewards.treasury,
    reputation: def.rewards.reputation,
  };

  await Promise.all([company.save(), mission.save()]);

  await CompanyAuditLog.create({
    companyId,
    action: 'mission_reward_claimed',
    details: { missionId, name: def.name, rewards: def.rewards },
    tick: tickNumber,
  });

  const memberUserIds = company.members.map((m) => m.userId);
  for (const uid of memberUserIds) {
    await enqueueNotification({
      userId: uid,
      type: 'system',
      title: 'Mission Reward Claimed!',
      message: `"${company.name}" claimed "${def.name}"! +${def.rewards.xp} XP, +$${def.rewards.treasury.toLocaleString()}`,
      eventKey: `company:${companyId}:mission:${missionId}:claimed:${uid}`,
      route: `/real-estate-companies/${companyId}`,
      tab: 'missions',
      entityType: 'companyMission',
      entityId: mission._id,
      relatedId: companyId,
      global: false,
    });
  }

  return { mission, rewards: def.rewards };
}

export async function initializeCompanyMissions(companyId) {
  const existing = await CompanyMissionProgress.find({ companyId }).lean();
  const existingIds = new Set(existing.map((m) => m.missionId));

  const toCreate = COMPANY_MISSION_DEFINITIONS.filter((m) => !existingIds.has(m.id)).map((def) => ({
    companyId,
    missionId: def.id,
    status: 'active',
    target: def.condition.target,
    periodKey: def.type === 'daily' ? getDailyPeriodKey() : def.type === 'weekly' ? getWeeklyPeriodKey() : null,
  }));

  if (toCreate.length > 0) {
    await CompanyMissionProgress.insertMany(toCreate, { ordered: false }).catch(() => {});
  }

  return toCreate.length;
}

export async function refreshCompanyDailyMissions(companyId) {
  const currentPeriod = getDailyPeriodKey();
  const dailyIds = getCompanyDailyMissions().map((d) => d.id);

  const expired = await CompanyMissionProgress.find({
    companyId,
    missionId: { $in: dailyIds },
    periodKey: { $ne: currentPeriod },
    status: 'active',
  });

  for (const m of expired) {
    m.status = 'completed';
    m.completedAt = new Date();
    m.progress = m.target;
    await m.save();
  }

  const existing = await CompanyMissionProgress.find({
    companyId,
    missionId: { $in: dailyIds },
    periodKey: currentPeriod,
  })
    .select('missionId')
    .lean();
  const existingIds = new Set(existing.map((m) => m.missionId));

  const toCreate = getCompanyDailyMissions()
    .filter((def) => !existingIds.has(def.id))
    .map((def) => ({
      companyId,
      missionId: def.id,
      status: 'active',
      target: def.condition.target,
      periodKey: currentPeriod,
    }));

  if (toCreate.length > 0) {
    await CompanyMissionProgress.insertMany(toCreate, { ordered: false }).catch(() => {});
  }

  return toCreate.length;
}

export async function refreshCompanyWeeklyMissions(companyId) {
  const currentPeriod = getWeeklyPeriodKey();
  const weeklyIds = getCompanyWeeklyMissions().map((d) => d.id);

  const expired = await CompanyMissionProgress.find({
    companyId,
    missionId: { $in: weeklyIds },
    periodKey: { $ne: currentPeriod },
    status: 'active',
  });

  for (const m of expired) {
    m.status = 'completed';
    m.completedAt = new Date();
    m.progress = m.target;
    await m.save();
  }

  const existing = await CompanyMissionProgress.find({
    companyId,
    missionId: { $in: weeklyIds },
    periodKey: currentPeriod,
  })
    .select('missionId')
    .lean();
  const existingIds = new Set(existing.map((m) => m.missionId));

  const toCreate = getCompanyWeeklyMissions()
    .filter((def) => !existingIds.has(def.id))
    .map((def) => ({
      companyId,
      missionId: def.id,
      status: 'active',
      target: def.condition.target,
      periodKey: currentPeriod,
    }));

  if (toCreate.length > 0) {
    await CompanyMissionProgress.insertMany(toCreate, { ordered: false }).catch(() => {});
  }

  return toCreate.length;
}

export async function processCompanyMissionReset() {
  const companies = await RealEstateCompany.find({ active: true });
  let totalRefreshed = 0;

  for (const company of companies) {
    totalRefreshed += await refreshCompanyDailyMissions(company._id);
    totalRefreshed += await refreshCompanyWeeklyMissions(company._id);
    await initializeCompanyMissions(company._id);
  }

  return totalRefreshed;
}

export async function processAllCompanyMissionProgress() {
  const companies = await RealEstateCompany.find({ active: true });
  let totalCompleted = 0;

  for (const company of companies) {
    const completed = await updateCompanyMissionProgress(company._id);
    totalCompleted += completed.length;
  }

  return totalCompleted;
}

export async function getCompanyMissionDashboard(companyId) {
  const missions = await CompanyMissionProgress.find({ companyId }).populate('contributors.userId', 'username').lean();

  const active = missions.filter((m) => m.status === 'active');
  const completed = missions.filter((m) => m.status === 'completed');
  const claimed = missions.filter((m) => m.status === 'claimed');

  const enrich = (m) => {
    const def = COMPANY_MISSION_DEFINITIONS.find((d) => d.id === m.missionId);
    return {
      ...m,
      definition: def || null,
      percentage: m.target > 0 ? Math.min(100, Math.round((m.progress / m.target) * 100)) : 0,
    };
  };

  return {
    active: active.map(enrich),
    completed: completed.map(enrich),
    claimed: claimed.map(enrich),
    stats: {
      totalActive: active.length,
      totalCompleted: completed.length,
      totalClaimed: claimed.length,
      totalXP: claimed.reduce((s, m) => s + (m.rewardsClaimed?.xp || 0), 0),
      totalTreasury: claimed.reduce((s, m) => s + (m.rewardsClaimed?.treasury || 0), 0),
      totalReputation: claimed.reduce((s, m) => s + (m.rewardsClaimed?.reputation || 0), 0),
    },
  };
}
