import RealEstateCompany from '../models/RealEstateCompany.js';
import Property from '../models/Property.js';
import Loan from '../models/Loan.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import {
  xpRequiredForNextLevel,
  getLevelFromTotalXP,
  getCompanyLevelBenefits,
  calculateXPReward,
  LEVEL_UP_REWARDS,
  checkMilestones,
} from '../config/companyProgression.js';
import { cancelDelayedJob } from '../utils/delayedJobs.js';
import { triggerMissionProgressForMany } from '../utils/missionTrigger.js';

export { getCompanyLevelBenefits } from '../config/companyProgression.js';

export const TREASURY_TRANSACTION_RETENTION_TICKS = 4;
export const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const MAX_TREASURY_TRANSACTIONS = 100;

export function addTreasuryTransaction(company, transaction, tickNumber) {
  company.treasury.transactions.push({ ...transaction, tick: tickNumber });
  if (company.treasury.transactions.length > MAX_TREASURY_TRANSACTIONS) {
    company.treasury.transactions = company.treasury.transactions.slice(-MAX_TREASURY_TRANSACTIONS);
  }
}

export function pruneTreasuryTransactions(company, tickNumber) {
  const cutoffTick = tickNumber - TREASURY_TRANSACTION_RETENTION_TICKS;
  const cutoffDate = new Date(Date.now() - TREASURY_TRANSACTION_RETENTION_TICKS * TICK_INTERVAL_MS);
  company.treasury.transactions = company.treasury.transactions.filter(
    (t) => (t.tick != null && t.tick >= cutoffTick) || (t.tick == null && t.createdAt >= cutoffDate),
  );
}

export async function pruneCompanyTreasuryTransactions(tickNumber) {
  const companies = await RealEstateCompany.find({
    'treasury.transactions.0': { $exists: true },
  });

  let prunedCount = 0;
  for (const company of companies) {
    const before = company.treasury.transactions.length;
    pruneTreasuryTransactions(company, tickNumber);
    if (company.treasury.transactions.length < before) {
      await company.save();
      prunedCount += before - company.treasury.transactions.length;
    }
  }

  return prunedCount;
}

export async function grantCompanyXP(company, activity, tickNumber, ...args) {
  const xp = calculateXPReward(activity, ...args);
  if (xp <= 0) return 0;

  company.xp += xp;

  // Give immediate level-up rewards when triggered from routes (not batch tick processing)
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
      {
        type: 'deposit',
        amount: treasuryBonus,
        description: `Level ${company.level} reward: $${treasuryBonus.toLocaleString()} treasury bonus`,
      },
      tickNumber,
    );
    company.xp += xpBonus;
    company.reputation += repBonus;

    await CompanyAuditLog.create({
      companyId: company._id,
      action: 'level_up',
      details: {
        newLevel: company.level,
        maxMembers: company.maxMembers,
        treasuryBonus,
        xpBonus,
        reputationBonus: repBonus,
      },
      tick: tickNumber,
    });

    const memberUserIds = company.members.map((m) => m.userId);
    for (const userId of memberUserIds) {
      await enqueueNotification({
        userId,
        type: 'system',
        title: 'Company Level Up!',
        message: `"${company.name}" reached Level ${company.level}! Treasury bonus: $${treasuryBonus.toLocaleString()}. New features unlocked.`,
        route: `/real-estate-companies/${company._id}`,
        tab: 'overview',
        entityType: 'company',
        entityId: company._id,
        relatedId: company._id,
        global: false,
      });
    }
  }

  return xp;
}

export async function processCompanyRent(tickNumber) {
  const companies = await RealEstateCompany.find({ active: true });
  if (companies.length === 0) return [];

  const companyIds = companies.map((c) => c._id);
  const properties = await Property.find({ companyId: { $in: companyIds } })
    .populate('cityId')
    .lean();
  if (properties.length === 0) return [];

  const cityMap = new Map();
  for (const prop of properties) {
    if (prop.cityId && typeof prop.cityId === 'object' && !cityMap.has(prop.cityId._id?.toString())) {
      cityMap.set(prop.cityId._id.toString(), prop.cityId);
    }
  }

  const grouped = new Map();
  for (const property of properties) {
    const companyId = property.companyId?.toString();
    if (!companyId) continue;
    if (!grouped.has(companyId)) grouped.set(companyId, []);
    grouped.get(companyId).push(property);
  }

  const results = [];
  const bulkOps = [];

  for (const [companyIdStr, companyProperties] of grouped) {
    let totalRent = 0;
    let totalMaintenance = 0;

    for (const property of companyProperties) {
      let rentIncome = property.rent || 0;
      let maintenanceCost = Math.round((property.currentPrice || 0) * 0.001);

      const city = cityMap.get(property.cityId?._id?.toString() || property.cityId?.toString());
      const demandIndex = city?.demandIndex || 1.0;
      const supplyIndex = city?.supplyIndex || 1.0;
      const rentModifier = Math.min(1.4, Math.max(0.6, 0.7 + 0.3 * (demandIndex / supplyIndex)));

      if (property.units && property.units.length > 0) {
        let tickOccupied = 0;
        let totalPotentialRent = 0;

        for (const unit of property.units) {
          const isOccupied = Math.random() < (property.occupancy || 0) / 100;
          totalPotentialRent += unit.rentPrice || 0;
          if (isOccupied) tickOccupied++;
        }

        const occupancyRate = property.units.length > 0 ? tickOccupied / property.units.length : 0;
        rentIncome = Math.round(totalPotentialRent * occupancyRate * rentModifier);
        maintenanceCost = property.maintenanceCost || Math.round((property.currentPrice || 0) * 0.001);

        const newOccupancy = Math.round(occupancyRate * 100);
        if (
          newOccupancy !== property.occupancy &&
          newOccupancy >= 0 &&
          newOccupancy <= 100 &&
          property.occupancy !== undefined
        ) {
          bulkOps.push({
            updateOne: {
              filter: { _id: property._id },
              update: { $set: { occupancy: newOccupancy } },
            },
          });
        }

        if (rentIncome === 0 && totalPotentialRent > 0) {
          rentIncome = Math.round(totalPotentialRent * 0.3 * rentModifier);
        }
      } else {
        rentIncome = Math.round(rentIncome * rentModifier);
      }

      const netIncome = rentIncome - maintenanceCost;
      if (netIncome > 0) {
        totalRent += netIncome;
      }
      totalMaintenance += maintenanceCost;
    }

    if (totalRent > 0) {
      results.push({ companyId: companyIdStr, rentIncome: totalRent, maintenanceCost: totalMaintenance });
    }
  }

  if (bulkOps.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      await Property.bulkWrite(bulkOps.slice(i, i + BATCH_SIZE));
    }
  }

  if (results.length > 0) {
    const companyBulkOps = [];
    for (const result of results) {
      const xpGain = calculateXPReward('rent_collected', result.rentIncome);
      companyBulkOps.push({
        updateOne: {
          filter: { _id: result.companyId },
          update: {
            $inc: {
              'treasury.balance': result.rentIncome,
              'stats.totalRentalIncome': result.rentIncome,
              xp: xpGain,
            },
            $push: {
              'treasury.transactions': {
                $each: [
                  {
                    type: 'rent_income',
                    amount: result.rentIncome,
                    description: `Rental income: $${result.rentIncome.toLocaleString()}`,
                    tick: tickNumber,
                  },
                ],
                $slice: -100,
              },
            },
          },
        },
      });

      await Transaction.create({
        companyId: result.companyId,
        price: result.rentIncome,
        type: 'rent',
      });
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < companyBulkOps.length; i += BATCH_SIZE) {
      await RealEstateCompany.bulkWrite(companyBulkOps.slice(i, i + BATCH_SIZE));
    }
  }

  return results;
}

export async function processCompanyPayroll(tickNumber) {
  const companies = await RealEstateCompany.find({ active: true, 'employees.count': { $gt: 0 } });
  if (companies.length === 0) return [];

  const results = [];

  for (const company of companies) {
    const payroll = company.employees.totalPayroll || 0;
    if (payroll <= 0) continue;

    if (company.treasury.balance >= payroll) {
      company.treasury.balance -= payroll;
      addTreasuryTransaction(
        company,
        {
          type: 'payroll',
          amount: payroll,
          description: `Employee salaries: $${payroll.toLocaleString()} (${company.employees.count} employees)`,
        },
        tickNumber,
      );
      results.push({ companyId: company._id, paid: payroll, employees: company.employees.count });
    } else {
      const canPay = Math.floor(company.treasury.balance / company.employees.monthlySalaryPerEmployee);
      const layoffs = Math.max(0, company.employees.count - canPay);
      if (layoffs > 0) {
        company.employees.count -= layoffs;
        company.employees.totalPayroll = company.employees.count * company.employees.monthlySalaryPerEmployee;
        if (company.employees.departments && company.employees.departments.length > 0) {
          const totalDept = company.employees.departments.reduce((s, d) => s + d.count, 0);
          if (totalDept > 0) {
            for (const dept of company.employees.departments) {
              const deptLayoffs = Math.round((dept.count / totalDept) * layoffs);
              if (deptLayoffs > 0) {
                dept.count = Math.max(0, dept.count - deptLayoffs);
                dept.budget = dept.count * company.employees.monthlySalaryPerEmployee;
              }
            }
          }
        }

        await CompanyAuditLog.create({
          companyId: company._id,
          action: 'employees_fired',
          details: { count: layoffs, remaining: company.employees.count, reason: 'insufficient_treasury' },
          tick: tickNumber,
        });
      }

      const actualPayroll = company.employees.count * company.employees.monthlySalaryPerEmployee;
      if (company.treasury.balance > 0 && actualPayroll > 0) {
        const partialPay = Math.min(company.treasury.balance, actualPayroll);
        company.treasury.balance -= partialPay;
        addTreasuryTransaction(
          company,
          {
            type: 'payroll',
            amount: partialPay,
            description: `Partial salaries: $${partialPay.toLocaleString()} (${company.employees.count} employees after layoffs)`,
          },
          tickNumber,
        );
        results.push({ companyId: company._id, paid: partialPay, employees: company.employees.count, layoffs });
      } else {
        results.push({ companyId: company._id, paid: 0, employees: company.employees.count, layoffs });
      }
    }

    await company.save();
  }

  return results;
}

export async function processCompanyLoans(tickNumber) {
  const activeLoans = await Loan.find({ companyId: { $ne: null }, active: true });
  if (activeLoans.length === 0) return [];

  const results = [];
  const companyUpdates = new Map();

  for (const loan of activeLoans) {
    const company = await RealEstateCompany.findById(loan.companyId);
    if (!company) continue;

    const payment = loan.paymentPerTick;
    const interestPortion = Math.round(loan.remainingBalance * (loan.interestRate / loan.durationTicks));
    const principalPortion = payment - interestPortion;

    if (company.treasury.balance >= payment) {
      company.treasury.balance -= payment;
      loan.remainingBalance -= principalPortion;
      loan.ticksRemaining--;
      loan.ticksPaid++;
      loan.missedPayments = 0;

      addTreasuryTransaction(
        company,
        {
          type: 'loan_payment',
          amount: payment,
          description: `Loan payment of $${payment.toLocaleString()}`,
        },
        tickNumber,
      );

      const key = loan.companyId.toString();
      if (!companyUpdates.has(key)) companyUpdates.set(key, { company, totalPayment: 0 });
      companyUpdates.get(key).totalPayment += payment;

      await Transaction.create({
        companyId: loan.companyId,
        price: payment,
        type: 'loan_payment',
      });

      if (loan.ticksRemaining <= 0 || loan.remainingBalance <= 0) {
        loan.active = false;
        loan.remainingBalance = 0;
        loan.ticksRemaining = 0;
        company.stats.totalLoanBalance = Math.max(0, company.stats.totalLoanBalance - principalPortion);
        company.stats.loansRepaid = (company.stats.loansRepaid || 0) + 1;
      } else {
        company.stats.totalLoanBalance = Math.max(0, company.stats.totalLoanBalance - principalPortion);
      }
    } else {
      loan.missedPayments++;
      company.stats.totalLoanBalance = Math.max(0, company.stats.totalLoanBalance - principalPortion);

      if (loan.missedPayments >= 3) {
        const properties = await Property.find({ companyId: company._id });
        for (const prop of properties) {
          prop.companyId = null;
          prop.ownerId = null;
          prop.forSale = true;
          await prop.save();

          company.stats.propertiesOwned = Math.max(0, company.stats.propertiesOwned - 1);

          await Transaction.create({
            propertyId: prop._id,
            companyId: company._id,
            price: prop.currentPrice,
            type: 'repossess',
          });
        }

        loan.active = false;
        loan.remainingBalance = 0;
        loan.ticksRemaining = 0;

        company.reputation = Math.max(0, company.reputation - 50);
      } else {
        company.reputation = Math.max(0, company.reputation - 10);
      }
    }

    await company.save();
    await loan.save();

    triggerMissionProgressForMany(
      company.members.map((m) => m.userId),
      'company_loan_payment',
    );

    results.push({
      loanId: loan._id,
      companyId: loan.companyId,
      payment,
      missedPayments: loan.missedPayments,
      active: loan.active,
    });
  }

  return results;
}

export async function processCompanyLevelUp(tickNumber) {
  const companies = await RealEstateCompany.find({ active: true });
  let leveledUp = 0;

  for (const company of companies) {
    company.stats.ticksExisted = (company.stats.ticksExisted || 0) + 1;

    let dirty = false;

    // Migrate old "remaining XP" format to total accumulated XP
    if (company.level > 1 && company.xp < xpRequiredForNextLevel(company.level - 1)) {
      company.xp += xpRequiredForNextLevel(company.level - 1);
    }

    // Level up as many times as total XP allows (handles XP bonus cascading)
    while (getLevelFromTotalXP(company.xp) > company.level) {
      company.level += 1;
      leveledUp++;

      const benefits = getCompanyLevelBenefits(company.level);
      company.maxMembers = benefits.maxMembers;

      const treasuryBonus = LEVEL_UP_REWARDS.treasuryBonus(company.level);
      const xpBonus = LEVEL_UP_REWARDS.xpBonus(company.level);
      const repBonus = LEVEL_UP_REWARDS.reputationBonus(company.level);

      company.treasury.balance += treasuryBonus;
      addTreasuryTransaction(
        company,
        {
          type: 'deposit',
          amount: treasuryBonus,
          description: `Level ${company.level} reward: $${treasuryBonus.toLocaleString()} treasury bonus`,
        },
        tickNumber,
      );
      company.xp += xpBonus;
      company.reputation += repBonus;

      await CompanyAuditLog.create({
        companyId: company._id,
        action: 'level_up',
        details: {
          newLevel: company.level,
          maxMembers: company.maxMembers,
          treasuryBonus,
          xpBonus,
          reputationBonus: repBonus,
        },
        tick: tickNumber,
      });

      const memberUserIds = company.members.map((m) => m.userId);
      for (const userId of memberUserIds) {
        await enqueueNotification({
          userId,
          type: 'system',
          title: 'Company Level Up!',
          message: `"${company.name}" reached Level ${company.level}! Treasury bonus: $${treasuryBonus.toLocaleString()}. New features unlocked.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'overview',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      triggerMissionProgressForMany(memberUserIds, 'company_level_up');

      dirty = true;
    }

    const newMilestones = checkMilestones(company);
    for (const milestone of newMilestones) {
      company.milestones.push({
        milestoneId: milestone.id,
        name: milestone.name,
        description: milestone.description,
        xpReward: milestone.xpReward,
        reputationReward: milestone.reputationReward,
        treasuryReward: milestone.treasuryReward,
        completedTick: tickNumber,
      });

      company.xp += milestone.xpReward;
      company.reputation += milestone.reputationReward;
      company.treasury.balance += milestone.treasuryReward;
      addTreasuryTransaction(
        company,
        {
          type: 'deposit',
          amount: milestone.treasuryReward,
          description: `Milestone "${milestone.name}" completed: $${milestone.treasuryReward.toLocaleString()} reward`,
        },
        tickNumber,
      );

      await CompanyAuditLog.create({
        companyId: company._id,
        action: 'milestone_completed',
        details: {
          milestoneId: milestone.id,
          name: milestone.name,
          xpReward: milestone.xpReward,
          reputationReward: milestone.reputationReward,
          treasuryReward: milestone.treasuryReward,
        },
        tick: tickNumber,
      });

      const memberUserIds = company.members.map((m) => m.userId);
      for (const userId of memberUserIds) {
        await enqueueNotification({
          userId,
          type: 'system',
          title: 'Milestone Completed!',
          message: `"${company.name}" completed "${milestone.name}"! +${milestone.xpReward} XP, +$${milestone.treasuryReward.toLocaleString()}`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'overview',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      triggerMissionProgressForMany(
        company.members.map((m) => m.userId),
        'company_milestone',
      );

      dirty = true;
    }

    const propertyValue = (await Property.find({ companyId: company._id }).lean()).reduce(
      (sum, p) => sum + (p.currentPrice || 0),
      0,
    );
    const newNetWorth = company.treasury.balance + propertyValue;
    if (newNetWorth !== company.stats.netWorth) {
      company.stats.netWorth = newNetWorth;
      dirty = true;
    }

    const reputationGain = Math.round(
      company.stats.propertiesOwned * 1 +
        company.members.length * 2 +
        (company.stats.netWorth > 0 ? Math.log10(Math.max(1, company.stats.netWorth)) : 0),
    );
    company.reputation += reputationGain;

    if (dirty || leveledUp > 0) {
      await company.save();
    }
  }

  return leveledUp;
}

export async function processCompanyLoanPayments(_tickNumber) {
  const activeLoans = await Loan.find({ companyId: { $ne: null }, active: true });
  if (activeLoans.length === 0) return [];

  const results = [];

  for (const loan of activeLoans) {
    const company = await RealEstateCompany.findById(loan.companyId);
    if (!company) continue;

    const payment = loan.paymentPerTick;
    const interestPortion = Math.round(loan.remainingBalance * (loan.interestRate / Math.max(1, loan.durationTicks)));
    const principalPortion = Math.max(0, payment - interestPortion);

    if (company.treasury.balance >= payment) {
      company.treasury.balance -= payment;
      loan.remainingBalance -= principalPortion;
      loan.ticksRemaining--;
      loan.ticksPaid++;
      loan.missedPayments = 0;

      addTreasuryTransaction(
        company,
        {
          type: 'loan_payment',
          amount: payment,
          description: `Loan payment $${payment.toLocaleString()}`,
        },
        _tickNumber,
      );

      company.stats.totalLoanBalance = Math.max(0, company.stats.totalLoanBalance - principalPortion);

      await Transaction.create({
        companyId: loan.companyId,
        price: payment,
        type: 'loan_payment',
      });

      if (loan.ticksRemaining <= 0 || loan.remainingBalance <= 0) {
        loan.active = false;
        loan.remainingBalance = 0;
        loan.ticksRemaining = 0;
        company.stats.loansRepaid = (company.stats.loansRepaid || 0) + 1;
      }
    } else {
      loan.missedPayments++;
      company.reputation = Math.max(0, company.reputation - 5);

      if (loan.missedPayments >= 3) {
        loan.active = false;
        loan.remainingBalance = 0;
        loan.ticksRemaining = 0;
        company.reputation = Math.max(0, company.reputation - 30);
      }
    }

    await company.save();
    await loan.save();

    results.push({
      loanId: loan._id,
      companyId: loan.companyId,
      payment,
      missed: company.treasury.balance < payment,
      active: loan.active,
    });
  }

  return results;
}

const LOAN_REQUEST_VOTE_THRESHOLD = 0.5;
const FOUNDER_AUTO_VOTE_DELAY_TICKS = 4;
const LOAN_REQUEST_EXPIRE_TICKS = 8;
const MAX_ACTIVE_LOANS = 5;

export async function processCompanyLoanRequests(tickNumber) {
  const companies = await RealEstateCompany.find({ active: true, 'loanRequests.status': 'pending' });
  if (companies.length === 0) return { autoVoted: 0, autoExecuted: 0, expired: 0 };

  let autoVoted = 0;
  let autoExecuted = 0;
  let expired = 0;

  for (const company of companies) {
    let dirty = false;

    for (const lr of company.loanRequests) {
      if (lr.status !== 'pending') continue;

      const ageTicks = tickNumber - (lr.createdTick || 0);

      const founderMember = company.members.find((m) => m.role === 'ceo');
      if (!founderMember) continue;

      const founderVoted = (lr.votes || []).some((v) => v.userId?.toString() === founderMember.userId?.toString());
      const founderIsProposer = lr.requestedBy?.toString() === founderMember.userId?.toString();

      const totalVoters = company.members.length - 1;

      if (!founderVoted && !founderIsProposer && ageTicks >= FOUNDER_AUTO_VOTE_DELAY_TICKS) {
        lr.votes.push({
          userId: founderMember.userId,
          vote: 'yes',
          votedAt: new Date(),
        });
        autoVoted++;
        company.stats.totalVotes = (company.stats.totalVotes || 0) + 1;

        await CompanyAuditLog.create({
          companyId: company._id,
          userId: founderMember.userId,
          action: 'loan_vote_cast',
          details: { vote: 'yes', loanRequestId: lr._id, auto: true },
          tick: tickNumber,
        });

        await enqueueNotification({
          userId: lr.requestedBy,
          type: 'system',
          title: 'Loan Vote Updated',
          message: `Founder auto-approved the loan request due to inactivity.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'loans',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });

        const yesVotes = lr.votes.filter((v) => v.vote === 'yes').length;
        if (totalVoters > 0 && yesVotes / totalVoters >= LOAN_REQUEST_VOTE_THRESHOLD) {
          lr.status = 'approved';
          cancelDelayedJob(`vote:loanRequest:${lr._id}`);
        }

        dirty = true;
      }

      // ── EXPIRATION: inactive members auto-counted as YES ──
      if (ageTicks >= LOAN_REQUEST_EXPIRE_TICKS && lr.status === 'pending') {
        cancelDelayedJob(`vote:loanRequest:${lr._id}`);
        expired++;

        const existingVoterIds = new Set((lr.votes || []).map((v) => v.userId.toString()));
        let autoCount = 0;
        for (const member of company.members) {
          const memberId = member.userId.toString();
          if (memberId !== lr.requestedBy.toString() && !existingVoterIds.has(memberId)) {
            lr.votes.push({ userId: member.userId, vote: 'yes', votedAt: new Date() });
            autoCount++;

            await CompanyAuditLog.create({
              companyId: company._id,
              userId: member.userId,
              action: 'loan_vote_cast',
              details: { vote: 'yes', loanRequestId: lr._id, auto: true, reason: 'expired_inactive' },
              tick: tickNumber,
            });
          }
        }

        if (autoCount > 0) {
          company.stats.totalVotes = (company.stats.totalVotes || 0) + autoCount;
        }

        const yesVotes = (lr.votes || []).filter((v) => v.vote === 'yes').length;
        const noVotes = (lr.votes || []).filter((v) => v.vote === 'no').length;

        if (totalVoters > 0 && yesVotes / totalVoters >= LOAN_REQUEST_VOTE_THRESHOLD) {
          lr.status = 'approved';

          await CompanyAuditLog.create({
            companyId: company._id,
            action: 'loan_approved',
            details: {
              reason: 'expired_auto_yes',
              activeYesVotes: yesVotes - autoCount,
              autoYesVotes: autoCount,
              noVotes,
              totalVoters,
              principal: lr.principal,
            },
            tick: tickNumber,
          });

          await enqueueNotification({
            userId: lr.requestedBy,
            type: 'system',
            title: 'Loan Request Approved',
            message: `Voting expired for your $${lr.principal.toLocaleString()} loan request for "${company.name}". ${yesVotes - autoCount} member(s) voted YES and ${autoCount} inactive member(s) were automatically counted as YES.`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'loans',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        } else {
          lr.status = 'rejected';

          await CompanyAuditLog.create({
            companyId: company._id,
            action: 'loan_rejected',
            details: {
              reason: 'expired_auto_yes_insufficient',
              activeYesVotes: yesVotes - autoCount,
              autoYesVotes: autoCount,
              noVotes,
              totalVoters,
              principal: lr.principal,
            },
            tick: tickNumber,
          });

          await enqueueNotification({
            userId: lr.requestedBy,
            type: 'system',
            title: 'Loan Request Expired',
            message: `Your $${lr.principal.toLocaleString()} loan request for "${company.name}" expired. ${autoCount} inactive member(s) were counted as YES, but the proposal did not reach the required threshold.`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'loans',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        }

        dirty = true;
      }

      // ── EXECUTION (for approved requests) ──
      if (lr.status === 'approved' && lr.loanId == null) {
        const activeLoans = await Loan.find({ companyId: company._id, active: true });
        if (activeLoans.length >= MAX_ACTIVE_LOANS) {
          lr.status = 'rejected';
          await enqueueNotification({
            userId: lr.requestedBy,
            type: 'system',
            title: 'Loan Execution Failed',
            message: `Your $${lr.principal.toLocaleString()} loan was rejected: maximum ${MAX_ACTIVE_LOANS} active loans reached.`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'loans',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
          dirty = true;
          continue;
        }

        const properties = await Property.find({ companyId: company._id });
        const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
        const companyNetWorth = company.treasury.balance + propertyValue;
        const existingDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);

        if (existingDebt + lr.principal > companyNetWorth) {
          lr.status = 'rejected';
          await enqueueNotification({
            userId: lr.requestedBy,
            type: 'system',
            title: 'Loan Execution Failed',
            message: `Your $${lr.principal.toLocaleString()} loan was rejected: company debt would exceed net worth.`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'loans',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
          dirty = true;
          continue;
        }

        const rate = Math.max(0.03, 0.08 - Math.min(0.02, company.reputation * 0.0001));
        const totalInterest = Math.round(lr.principal * rate);
        const payment = Math.ceil((lr.principal + totalInterest) / lr.durationTicks);

        const loan = await Loan.create({
          userId: lr.requestedBy,
          companyId: company._id,
          type: lr.loanType,
          principal: lr.principal,
          remainingBalance: lr.principal + totalInterest,
          interestRate: rate,
          durationTicks: lr.durationTicks,
          ticksRemaining: lr.durationTicks,
          ticksPaid: 0,
          paymentPerTick: payment,
          active: true,
          missedPayments: 0,
          creditScoreAtApply: 700,
        });

        company.treasury.balance += lr.principal;
        addTreasuryTransaction(
          company,
          {
            type: 'loan_disbursement',
            amount: lr.principal,
            userId: lr.requestedBy,
            description: `Loan of $${lr.principal.toLocaleString()} at ${(rate * 100).toFixed(1)}% (member approved)`,
          },
          tickNumber,
        );

        company.stats.totalLoanBalance += lr.principal + totalInterest;
        lr.status = 'executed';
        lr.executedBy = lr.requestedBy;
        lr.executedAt = new Date();
        lr.loanId = loan._id;
        autoExecuted++;

        await CompanyAuditLog.create({
          companyId: company._id,
          userId: lr.requestedBy,
          action: 'loan_taken',
          details: { principal: lr.principal, rate, durationTicks: lr.durationTicks, loanId: loan._id },
          tick: tickNumber,
        });

        await enqueueNotification({
          userId: lr.requestedBy,
          type: 'system',
          title: 'Loan Approved & Executed',
          message: `Your $${lr.principal.toLocaleString()} loan request for "${company.name}" was approved and executed.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'loans',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });

        dirty = true;
      }
    }

    if (dirty) {
      await company.save();
    }
  }

  return { autoVoted, autoExecuted, expired };
}

const DEV_REQUEST_AUTO_VOTE_DELAY_TICKS = 4;
const DEV_REQUEST_EXPIRE_TICKS = 8;

export async function processCompanyDevelopmentRequests(tickNumber) {
  const companies = await RealEstateCompany.find({ active: true, 'developmentRequests.status': 'pending' });
  if (companies.length === 0) return { autoVoted: 0, expired: 0 };

  let autoVoted = 0;
  let expired = 0;

  for (const company of companies) {
    let dirty = false;

    for (const dr of company.developmentRequests) {
      if (dr.status !== 'pending') continue;

      const ageTicks = tickNumber - (dr.createdTick || 0);

      const ceoMember = company.members.find((m) => m.role === 'ceo');
      if (!ceoMember) continue;

      const ceoVoted = (dr.votes || []).some((v) => v.userId?.toString() === ceoMember.userId?.toString());
      const ceoIsProposer = dr.requestedBy?.toString() === ceoMember.userId?.toString();
      const totalVoters = company.members.length - 1;

      if (!ceoVoted && !ceoIsProposer && ageTicks >= DEV_REQUEST_AUTO_VOTE_DELAY_TICKS) {
        dr.votes.push({
          userId: ceoMember.userId,
          vote: 'yes',
          votedAt: new Date(),
        });
        autoVoted++;
        company.stats.totalVotes = (company.stats.totalVotes || 0) + 1;

        await CompanyAuditLog.create({
          companyId: company._id,
          userId: ceoMember.userId,
          action: 'development_vote_cast',
          details: { vote: 'yes', developmentRequestId: dr._id, auto: true },
          tick: tickNumber,
        });

        await enqueueNotification({
          userId: dr.requestedBy,
          type: 'system',
          title: 'Development Vote Updated',
          message: `Founder auto-approved the ${dr.actionType} development request due to inactivity.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'properties',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });

        const yesVotes = dr.votes.filter((v) => v.vote === 'yes').length;
        if (totalVoters > 0 && yesVotes / totalVoters >= LOAN_REQUEST_VOTE_THRESHOLD) {
          dr.status = 'approved';
          cancelDelayedJob(`vote:developmentRequest:${dr._id}`);
        }

        dirty = true;
      }

      if (ageTicks >= DEV_REQUEST_EXPIRE_TICKS && dr.status === 'pending') {
        cancelDelayedJob(`vote:developmentRequest:${dr._id}`);

        const existingVoterIds = new Set((dr.votes || []).map((v) => v.userId.toString()));
        let autoCount = 0;
        for (const member of company.members) {
          const memberId = member.userId.toString();
          if (memberId !== dr.requestedBy.toString() && !existingVoterIds.has(memberId)) {
            dr.votes.push({ userId: member.userId, vote: 'yes', votedAt: new Date() });
            autoCount++;

            await CompanyAuditLog.create({
              companyId: company._id,
              userId: member.userId,
              action: 'development_vote_cast',
              details: { vote: 'yes', developmentRequestId: dr._id, auto: true, reason: 'expired_inactive' },
              tick: tickNumber,
            });
          }
        }

        if (autoCount > 0) {
          company.stats.totalVotes = (company.stats.totalVotes || 0) + autoCount;
        }

        const yesVotes = (dr.votes || []).filter((v) => v.vote === 'yes').length;
        const noVotes = (dr.votes || []).filter((v) => v.vote === 'no').length;

        if (totalVoters > 0 && yesVotes / totalVoters >= LOAN_REQUEST_VOTE_THRESHOLD) {
          dr.status = 'approved';

          await CompanyAuditLog.create({
            companyId: company._id,
            action: 'development_approved',
            details: {
              reason: 'expired_auto_yes',
              actionType: dr.actionType,
              estimatedCost: dr.estimatedCost,
              activeYesVotes: yesVotes - autoCount,
              autoYesVotes: autoCount,
              noVotes,
              totalVoters,
            },
            tick: tickNumber,
          });

          await enqueueNotification({
            userId: dr.requestedBy,
            type: 'system',
            title: 'Development Request Approved',
            message: `Voting expired for your ${dr.actionType} development request for "${company.name}". ${yesVotes - autoCount} member(s) voted YES and ${autoCount} inactive member(s) were automatically counted as YES.`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'properties',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        } else {
          dr.status = 'rejected';
          dr.rejectionReason = 'expired_insufficient_votes';

          await CompanyAuditLog.create({
            companyId: company._id,
            action: 'development_rejected',
            details: {
              reason: 'expired_auto_yes_insufficient',
              actionType: dr.actionType,
              estimatedCost: dr.estimatedCost,
              activeYesVotes: yesVotes - autoCount,
              autoYesVotes: autoCount,
              noVotes,
              totalVoters,
            },
            tick: tickNumber,
          });

          await enqueueNotification({
            userId: dr.requestedBy,
            type: 'system',
            title: 'Development Request Expired',
            message: `Your ${dr.actionType} development request for "${company.name}" expired. ${autoCount} inactive member(s) were counted as YES, but the proposal did not reach the required threshold.`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'properties',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        }

        dirty = true;
      }
    }

    if (dirty) {
      await company.save();
    }
  }

  return { autoVoted, expired };
}

const PROPERTY_PURCHASE_AUTO_VOTE_DELAY_TICKS = 4;
const PROPERTY_PURCHASE_EXPIRE_TICKS = 8;

export async function processCompanyPropertyPurchaseRequests(tickNumber) {
  const companies = await RealEstateCompany.find({ active: true, 'propertyPurchaseRequests.status': 'pending' });
  if (companies.length === 0) return { autoVoted: 0, executed: 0, rejected: 0 };

  let autoVoted = 0;
  let executed = 0;
  let rejected = 0;

  for (const company of companies) {
    let dirty = false;

    for (const ppr of company.propertyPurchaseRequests) {
      if (ppr.status !== 'pending') continue;

      const ageTicks = tickNumber - (ppr.createdTick || 0);

      const ceoMember = company.members.find((m) => m.role === 'ceo');
      if (!ceoMember) continue;

      const ceoVoted = (ppr.votes || []).some((v) => v.userId?.toString() === ceoMember.userId?.toString());
      const ceoIsProposer = ppr.requestedBy?.toString() === ceoMember.userId?.toString();
      const totalVoters = company.members.length - 1;

      if (!ceoVoted && !ceoIsProposer && ageTicks >= PROPERTY_PURCHASE_AUTO_VOTE_DELAY_TICKS) {
        ppr.votes.push({ userId: ceoMember.userId, vote: 'yes', votedAt: new Date() });
        autoVoted++;
        company.stats.totalVotes = (company.stats.totalVotes || 0) + 1;

        await CompanyAuditLog.create({
          companyId: company._id,
          userId: ceoMember.userId,
          action: 'property_purchase_vote_cast',
          details: { vote: 'yes', propertyPurchaseRequestId: ppr._id, auto: true },
          tick: tickNumber,
        });

        await enqueueNotification({
          userId: ppr.requestedBy,
          type: 'system',
          title: 'Property Purchase Vote Updated',
          message: `CEO auto-approved the property purchase request due to inactivity.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'properties',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });

        const yesVotes = ppr.votes.filter((v) => v.vote === 'yes').length;
        if (totalVoters > 0 && yesVotes / totalVoters >= 0.5) {
          ppr.status = 'approved';
          cancelDelayedJob(`vote:propertyPurchase:${ppr._id}`);
        }

        dirty = true;
      }

      if (ageTicks >= PROPERTY_PURCHASE_EXPIRE_TICKS && ppr.status === 'pending') {
        cancelDelayedJob(`vote:propertyPurchase:${ppr._id}`);

        const existingVoterIds = new Set((ppr.votes || []).map((v) => v.userId.toString()));
        let autoCount = 0;
        for (const member of company.members) {
          const memberId = member.userId.toString();
          if (memberId !== ppr.requestedBy.toString() && !existingVoterIds.has(memberId)) {
            ppr.votes.push({ userId: member.userId, vote: 'yes', votedAt: new Date() });
            autoCount++;

            await CompanyAuditLog.create({
              companyId: company._id,
              userId: member.userId,
              action: 'property_purchase_vote_cast',
              details: { vote: 'yes', propertyPurchaseRequestId: ppr._id, auto: true, reason: 'expired_inactive' },
              tick: tickNumber,
            });
          }
        }

        if (autoCount > 0) {
          company.stats.totalVotes = (company.stats.totalVotes || 0) + autoCount;
        }

        const yesVotes = (ppr.votes || []).filter((v) => v.vote === 'yes').length;
        const noVotes = (ppr.votes || []).filter((v) => v.vote === 'no').length;

        if (totalVoters > 0 && yesVotes / totalVoters >= 0.5) {
          const property = await Property.findById(ppr.propertyId);
          if (!property) {
            ppr.status = 'rejected';
            rejected++;

            await CompanyAuditLog.create({
              companyId: company._id,
              action: 'property_purchase_rejected',
              details: {
                reason: 'expired_auto_yes_property_gone',
                propertyPurchaseRequestId: ppr._id,
                activeYesVotes: yesVotes - autoCount,
                autoYesVotes: autoCount,
                noVotes,
                totalVoters,
              },
              tick: tickNumber,
            });

            await enqueueNotification({
              userId: ppr.requestedBy,
              type: 'system',
              title: 'Property Purchase Expired',
              message: `Property purchase request expired and was approved, but the property is no longer available.`,
              route: `/real-estate-companies/${company._id}`,
              tab: 'properties',
              entityType: 'company',
              entityId: company._id,
              relatedId: company._id,
              global: false,
            });

            dirty = true;
            continue;
          }

          if (company.treasury.balance < property.currentPrice) {
            ppr.status = 'rejected';
            rejected++;

            await CompanyAuditLog.create({
              companyId: company._id,
              action: 'property_purchase_rejected',
              details: {
                reason: 'expired_auto_yes_insufficient_funds',
                propertyPurchaseRequestId: ppr._id,
                activeYesVotes: yesVotes - autoCount,
                autoYesVotes: autoCount,
                noVotes,
                totalVoters,
              },
              tick: tickNumber,
            });

            await enqueueNotification({
              userId: ppr.requestedBy,
              type: 'system',
              title: 'Property Purchase Expired',
              message: `Property purchase request expired and was approved, but the treasury lacks sufficient funds.`,
              route: `/real-estate-companies/${company._id}`,
              tab: 'properties',
              entityType: 'company',
              entityId: company._id,
              relatedId: company._id,
              global: false,
            });

            dirty = true;
            continue;
          }

          if (property.ownerId) {
            const seller = await User.findById(property.ownerId);
            if (seller) {
              seller.balance += property.currentPrice;
              seller.ownedProperties = seller.ownedProperties.filter((p) => p.toString() !== ppr.propertyId.toString());
              await seller.save();
            }
          }

          company.treasury.balance -= property.currentPrice;
          addTreasuryTransaction(
            company,
            {
              type: 'property_purchase',
              amount: property.currentPrice,
              description: `Purchased "${property.name}" for $${property.currentPrice.toLocaleString()} (vote expired)`,
            },
            tickNumber,
          );

          company.stats.propertiesOwned += 1;

          property.ownerId = null;
          property.companyId = company._id;
          property.forSale = false;
          property.lastPurchasePrice = property.currentPrice;
          property.lastPurchaseDate = new Date();
          property.activeImprovement = undefined;

          if (!property.investmentHistory) property.investmentHistory = [];
          property.investmentHistory.push({
            type: 'purchase',
            amount: property.currentPrice,
            description: `Purchased by ${company.name} (vote expired)`,
          });

          await property.save();

          await Transaction.create({
            propertyId: property._id,
            companyId: company._id,
            price: property.currentPrice,
            type: 'buy',
          });

          ppr.status = 'executed';
          executed++;

          await CompanyAuditLog.create({
            companyId: company._id,
            action: 'property_purchased',
            details: {
              reason: 'expired_auto_yes',
              propertyPurchaseRequestId: ppr._id,
              propertyName: property.name,
              price: property.currentPrice,
              activeYesVotes: yesVotes - autoCount,
              autoYesVotes: autoCount,
              noVotes,
              totalVoters,
            },
            tick: tickNumber,
          });

          await enqueueNotification({
            userId: ppr.requestedBy,
            type: 'system',
            title: 'Property Purchase Approved',
            message: `Voting expired for the "${property.name}" purchase. ${yesVotes - autoCount} member(s) voted YES and ${autoCount} inactive member(s) were automatically counted as YES.`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'properties',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        } else {
          ppr.status = 'rejected';
          rejected++;

          await CompanyAuditLog.create({
            companyId: company._id,
            action: 'property_purchase_rejected',
            details: {
              reason: 'expired_auto_yes_insufficient',
              propertyPurchaseRequestId: ppr._id,
              activeYesVotes: yesVotes - autoCount,
              autoYesVotes: autoCount,
              noVotes,
              totalVoters,
            },
            tick: tickNumber,
          });

          await enqueueNotification({
            userId: ppr.requestedBy,
            type: 'system',
            title: 'Property Purchase Expired',
            message: `Property purchase request for "${company.name}" expired. ${autoCount} inactive member(s) were counted as YES, but the proposal did not reach the required threshold.`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'properties',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        }

        dirty = true;
      }
    }

    if (dirty) {
      await company.save();
    }
  }

  return { autoVoted, executed, rejected };
}
