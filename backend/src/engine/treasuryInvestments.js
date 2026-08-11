import CompanyInvestment from '../models/CompanyInvestment.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import InvestmentOpportunity from '../models/InvestmentOpportunity.js';
import {
  generateInvestmentOpportunities as generateOps,
  expireInvestmentOpportunities,
  getGlobalEconomicState,
  INVESTMENT_TYPES,
} from '../config/investmentOpportunities.js';
import { addTreasuryTransaction, grantCompanyXP } from './companyProcessing.js';
import { cancelDelayedJob } from '../utils/delayedJobs.js';
import { triggerMissionProgressForMany } from '../utils/missionTrigger.js';

const ANNUAL_TICKS = 4 * 365;

export async function generateInvestmentOpportunities(tickNumber) {
  const expired = await expireInvestmentOpportunities(tickNumber);
  const generated = await generateOps(tickNumber);

  return { generated, expired };
}

export async function getAvailableInvestments(level = 1) {
  const typeConfigs = INVESTMENT_TYPES.filter((t) => {
    if (level >= 10) return true;
    if (level >= 5) return t.risk !== 'very_high';
    if (level >= 3) return t.risk !== 'high' && t.risk !== 'very_high';
    return t.risk === 'low' || t.risk === 'very_low';
  });

  const opportunities = await InvestmentOpportunity.find({ active: true }).sort({ currentAnnualReturnRate: -1 });

  if (opportunities.length === 0) {
    return typeConfigs.map((t) => ({
      _id: t.type,
      type: t.type,
      name: t.name,
      description: t.description,
      annualReturnRate: t.baseReturn,
      currentAnnualReturnRate: t.baseReturn,
      durationTicks: t.minDuration,
      risk: t.risk,
      minInvestment: t.minInvestment,
      maxInvestment: t.maxInvestment,
      availableCapital: t.availableCapital,
      isOpportunity: false,
    }));
  }

  return opportunities.map((o) => ({
    _id: o._id.toString(),
    type: o.type,
    name: o.name,
    description: o.description,
    annualReturnRate: o.baseAnnualReturnRate,
    currentAnnualReturnRate: o.currentAnnualReturnRate,
    durationTicks: o.durationTicks,
    risk: o.risk,
    minInvestment: o.minInvestment,
    maxInvestment: o.maxInvestment,
    availableCapital: o.availableCapital,
    economyState: o.economyState,
    globalEconomicIndex: o.globalEconomicIndex,
    expiresAtTick: o.expiresAtTick,
    isOpportunity: true,
  }));
}

export async function processCompanyInvestments(tickNumber) {
  const activeInvestments = await CompanyInvestment.find({ status: { $in: ['active', 'proposed'] } });
  if (activeInvestments.length === 0) return [];

  const { index: globalEconomicIndex } = await getGlobalEconomicState();
  const results = [];

  for (const investment of activeInvestments) {
    if (investment.status === 'proposed') {
      await processInvestmentProposal(investment, tickNumber, globalEconomicIndex);
      continue;
    }

    if (tickNumber >= investment.maturityTick) {
      const finalValue = await matureInvestment(investment, tickNumber, globalEconomicIndex);
      results.push({
        companyId: investment.companyId,
        investmentId: investment._id,
        status: 'matured',
        finalValue,
        profit: finalValue - investment.principal,
      });
      continue;
    }

    await updateInvestmentValue(investment, tickNumber, globalEconomicIndex);
  }

  return results;
}

async function processInvestmentProposal(investment, tickNumber, globalEconomicIndex) {
  const company = await RealEstateCompany.findById(investment.companyId);
  if (!company) {
    investment.status = 'rejected';
    investment.proposal.status = 'rejected';
    investment.proposal.resolvedAt = new Date();
    await investment.save();
    return;
  }

  const proposal = investment.proposal;
  if (!proposal || proposal.status !== 'pending') return;

  const ageTicks = tickNumber - proposal.proposedTick;
  const ceoMember = company.members.find((m) => m.role === 'ceo');
  if (!ceoMember) return;

  const ceoVoted = (proposal.votes || []).some((v) => v.userId?.toString() === ceoMember.userId?.toString());
  const ceoIsProposer = proposal.proposedBy?.toString() === ceoMember.userId?.toString();

  if (!ceoVoted && !ceoIsProposer && ageTicks >= 4) {
    proposal.votes.push({ userId: ceoMember.userId, vote: 'yes', votedAt: new Date() });

    await CompanyAuditLog.create({
      companyId: company._id,
      userId: ceoMember.userId,
      action: 'investment_vote_cast',
      details: { investmentId: investment._id, vote: 'yes', auto: true },
      tick: tickNumber,
    });
  }

  const totalVoters = Math.max(1, company.members.length - 1);
  const yesVotes = (proposal.votes || []).filter((v) => v.vote === 'yes').length;
  const noVotes = (proposal.votes || []).filter((v) => v.vote === 'no').length;

  if (yesVotes / totalVoters >= 0.5 && noVotes === 0) {
    investment.status = 'active';
    investment.proposal.status = 'approved';
    investment.proposal.resolvedAt = new Date();
    investment.startTick = tickNumber;
    investment.maturityTick = tickNumber + investment.durationTicks;
    const { scheduleInvestmentMaturity } = await import('../utils/delayedJobs.js');
    scheduleInvestmentMaturity(investment._id, company._id, investment.durationTicks);
    investment.globalEconomicIndex = globalEconomicIndex;

    company.treasury.balance -= investment.principal;
    addTreasuryTransaction(
      company,
      {
        type: 'investment_withdrawal',
        amount: investment.principal,
        description: `Investment approved: ${investment.name}`,
      },
      tickNumber,
    );

    await company.save();
    await investment.save();

    await CompanyAuditLog.create({
      companyId: company._id,
      userId: investment.proposal.proposedBy,
      action: 'investment_approved',
      details: { investmentId: investment._id, name: investment.name, principal: investment.principal },
      tick: tickNumber,
    });

    const memberUserIds = company.members.map((m) => m.userId);
    for (const userId of memberUserIds) {
      await enqueueNotification({
        userId,
        type: 'system',
        title: 'Investment Approved',
        message: `"${company.name}" invested $${investment.principal.toLocaleString()} in ${investment.name}.`,
        eventKey: `company:${company._id}:investment:${investment._id}:approved:${userId}`,
        route: `/real-estate-companies/${company._id}`,
        tab: 'investments',
        entityType: 'company',
        entityId: company._id,
        relatedId: company._id,
        global: false,
      });
    }
  } else if (noVotes > 0 && noVotes / totalVoters > 0.5) {
    investment.status = 'rejected';
    investment.proposal.status = 'rejected';
    investment.proposal.resolvedAt = new Date();
    await investment.save();
    cancelDelayedJob(`vote:investment:${investment._id}`);
  } else if (ageTicks >= 8) {
    cancelDelayedJob(`vote:investment:${investment._id}`);

    const existingVoterIds = new Set((proposal.votes || []).map((v) => v.userId.toString()));
    let autoCount = 0;
    for (const member of company.members) {
      const memberId = member.userId.toString();
      if (memberId !== proposal.proposedBy.toString() && !existingVoterIds.has(memberId)) {
        proposal.votes.push({ userId: member.userId, vote: 'yes', votedAt: new Date() });
        autoCount++;

        await CompanyAuditLog.create({
          companyId: company._id,
          userId: member.userId,
          action: 'investment_vote_cast',
          details: { vote: 'yes', investmentId: investment._id, auto: true, reason: 'expired_inactive' },
          tick: tickNumber,
        });
      }
    }

    const updatedYesVotes = (proposal.votes || []).filter((v) => v.vote === 'yes').length;
    const updatedNoVotes = (proposal.votes || []).filter((v) => v.vote === 'no').length;

    if (totalVoters > 0 && updatedYesVotes / totalVoters >= 0.5) {
      investment.status = 'active';
      investment.proposal.status = 'approved';
      investment.proposal.resolvedAt = new Date();
      investment.startTick = tickNumber;
      investment.maturityTick = tickNumber + investment.durationTicks;
      const { scheduleInvestmentMaturity } = await import('../utils/delayedJobs.js');
      scheduleInvestmentMaturity(investment._id, company._id, investment.durationTicks);
      investment.globalEconomicIndex = globalEconomicIndex;

      company.treasury.balance -= investment.principal;
      addTreasuryTransaction(
        company,
        {
          type: 'investment_withdrawal',
          amount: investment.principal,
          description: `Investment approved: ${investment.name}`,
        },
        tickNumber,
      );

      await company.save();
      await investment.save();

      await CompanyAuditLog.create({
        companyId: company._id,
        userId: investment.proposal.proposedBy,
        action: 'investment_approved',
        details: {
          reason: 'expired_auto_yes',
          investmentId: investment._id,
          name: investment.name,
          principal: investment.principal,
          activeYesVotes: updatedYesVotes - autoCount,
          autoYesVotes: autoCount,
          noVotes: updatedNoVotes,
          totalVoters,
        },
        tick: tickNumber,
      });

      await enqueueNotification({
        userId: proposal.proposedBy,
        type: 'system',
        title: 'Investment Proposal Approved',
        message: `Voting expired for the "${investment.name}" investment. ${updatedYesVotes - autoCount} member(s) voted YES and ${autoCount} inactive member(s) were automatically counted as YES.`,
        eventKey: `company:${company._id}:investment:${investment._id}:proposal_approved:${proposal.proposedBy}`,
        route: `/real-estate-companies/${company._id}`,
        tab: 'investments',
        entityType: 'company',
        entityId: company._id,
        relatedId: company._id,
        global: false,
      });
    } else {
      investment.status = 'rejected';
      investment.proposal.status = 'rejected';
      investment.proposal.resolvedAt = new Date();
      await investment.save();

      await CompanyAuditLog.create({
        companyId: company._id,
        action: 'investment_rejected',
        details: {
          reason: 'expired_auto_yes_insufficient',
          investmentId: investment._id,
          name: investment.name,
          activeYesVotes: updatedYesVotes - autoCount,
          autoYesVotes: autoCount,
          noVotes: updatedNoVotes,
          totalVoters,
        },
        tick: tickNumber,
      });

      await enqueueNotification({
        userId: proposal.proposedBy,
        type: 'system',
        title: 'Investment Proposal Expired',
        message: `The "${investment.name}" investment proposal expired. ${autoCount} inactive member(s) were counted as YES, but the proposal did not reach the required threshold.`,
        eventKey: `company:${company._id}:investment:${investment._id}:proposal_expired:${proposal.proposedBy}`,
        route: `/real-estate-companies/${company._id}`,
        tab: 'investments',
        entityType: 'company',
        entityId: company._id,
        relatedId: company._id,
        global: false,
      });
    }
  }
}

async function updateInvestmentValue(investment, tickNumber, globalEconomicIndex) {
  const riskMultipliers = {
    very_low: 0.05,
    low: 0.1,
    medium: 0.2,
    high: 0.35,
    very_high: 0.5,
  };

  const riskVolatility = riskMultipliers[investment.risk] || 0.1;
  const economyEffect = (globalEconomicIndex - investment.globalEconomicIndex) * 0.2;
  const randomShock = (Math.random() - 0.5) * riskVolatility;
  const tickReturn = investment.annualReturnRate / ANNUAL_TICKS + economyEffect + randomShock;

  const newValue = Math.max(1, Math.round(investment.currentValue * (1 + tickReturn)));
  const appliedRate = (newValue - investment.currentValue) / Math.max(1, investment.currentValue);

  investment.currentValue = newValue;
  investment.performanceHistory.push({
    tick: tickNumber,
    currentValue: newValue,
    returnRate: appliedRate,
    economyModifier: globalEconomicIndex,
    riskModifier: randomShock,
  });

  if (investment.performanceHistory.length > 50) {
    investment.performanceHistory = investment.performanceHistory.slice(-50);
  }

  await investment.save();
}

async function matureInvestment(investment, tickNumber, globalEconomicIndex) {
  await updateInvestmentValue(investment, tickNumber, globalEconomicIndex);

  const company = await RealEstateCompany.findById(investment.companyId);
  if (!company) {
    investment.status = 'matured';
    await investment.save();
    return investment.currentValue;
  }

  company.treasury.balance += investment.currentValue;
  addTreasuryTransaction(
    company,
    {
      type: 'investment_return',
      amount: investment.currentValue,
      description: `Investment matured: ${investment.name} — Principal: $${investment.principal.toLocaleString()}, Return: $${investment.currentValue.toLocaleString()}`,
    },
    tickNumber,
  );

  const profit = investment.currentValue - investment.principal;
  await grantCompanyXP(company, 'investment_matured', tickNumber, profit);

  investment.status = 'matured';

  await company.save();
  await investment.save();

  const memberUserIds = company.members.map((m) => m.userId);
  for (const userId of memberUserIds) {
    await enqueueNotification({
      userId,
      type: 'system',
      title: 'Investment Matured',
      message: `"${company.name}" investment "${investment.name}" matured. Return: $${investment.currentValue.toLocaleString()}${profit >= 0 ? ` (+$${profit.toLocaleString()} profit)` : ` ($${Math.abs(profit).toLocaleString()} loss)`}.`,
      eventKey: `company:${company._id}:investment:${investment._id}:matured:${userId}`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'treasury',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });
  }

  triggerMissionProgressForMany(memberUserIds, 'investment_matured');

  return investment.currentValue;
}

export async function getInvestmentPerformanceSummary(companyId) {
  const investments = await CompanyInvestment.find({ companyId });
  const totalInvested = investments.reduce((sum, inv) => sum + inv.principal, 0);
  const currentValue = investments.reduce((sum, inv) => sum + (inv.currentValue || inv.principal), 0);
  const maturedProfit = investments
    .filter((inv) => inv.status === 'matured')
    .reduce((sum, inv) => sum + (inv.currentValue - inv.principal), 0);

  return {
    totalInvested,
    currentValue,
    unrealizedProfit: currentValue - totalInvested,
    maturedProfit,
    activeCount: investments.filter((inv) => inv.status === 'active').length,
    maturedCount: investments.filter((inv) => inv.status === 'matured').length,
  };
}
