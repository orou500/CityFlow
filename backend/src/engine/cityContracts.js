import RealEstateCompany from '../models/RealEstateCompany.js';
import CityContract from '../models/CityContract.js';
import City from '../models/City.js';
import Property from '../models/Property.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import { getCompanyLevelBenefits, addTreasuryTransaction, grantCompanyXP } from './companyProcessing.js';
import { cancelDelayedJob } from '../utils/delayedJobs.js';
import { triggerMissionProgressForMany } from '../utils/missionTrigger.js';
import { emitToCompany } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import {
  generateContractForCity,
  getContractTypesForLevel,
  getContractDeliverable,
  CONTRACT_PROPOSAL_EXPIRE_TICKS,
  VOTE_THRESHOLD,
} from '../config/cityContracts.js';

export async function generateCityContracts(tickNumber) {
  const companies = await RealEstateCompany.find({ active: true });
  if (companies.length === 0) return 0;

  const cities = await City.find({});
  if (cities.length === 0) return 0;

  let generated = 0;

  for (const company of companies) {
    const benefits = getCompanyLevelBenefits(company.level);
    if (!benefits.canTakeContracts) continue;

    const existingContracts = await CityContract.countDocuments({
      companyId: company._id,
      status: { $in: ['available', 'proposed', 'active'] },
    });

    const maxContracts = 3 + Math.floor(company.level / 5);
    if (existingContracts >= maxContracts) continue;

    const availableSlots = maxContracts - existingContracts;
    const contractsToGenerate = Math.min(availableSlots, 2);

    for (let i = 0; i < contractsToGenerate; i++) {
      if (Math.random() > 0.6) continue;

      const city = cities[Math.floor(Math.random() * cities.length)];
      const contractData = generateContractForCity(company, city, tickNumber);
      if (!contractData) continue;

      try {
        const contract = await CityContract.create(contractData);
        generated++;

        const memberUserIds = company.members.map((m) => m.userId);
        for (const userId of memberUserIds) {
          await enqueueNotification({
            userId,
            type: 'system',
            title: 'New City Contract Available',
            message: `"${company.name}" has a new contract opportunity: ${contract.name} in ${city.name} for $${contract.cost.toLocaleString()}`,
            eventKey: `company:${company._id}:contract:${contract._id}:available:${userId}`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'contracts',
            subTab: 'available',
            contractId: contract._id,
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        }
      } catch {
        // ignore duplicate or validation errors
      }
    }
  }

  return generated;
}

export async function processCityContracts(tickNumber) {
  const activeContracts = await CityContract.find({ status: 'active' }).populate('cityId', 'name');
  if (activeContracts.length === 0) return [];

  const results = [];

  for (const contract of activeContracts) {
    const company = await RealEstateCompany.findById(contract.companyId);
    if (!company) {
      contract.status = 'failed';
      contract.failedReason = 'Company no longer exists';
      await contract.save();
      continue;
    }

    const elapsedTicks = Math.max(0, tickNumber - (contract.startTick || tickNumber));
    const progress = Math.min(100, Math.round((elapsedTicks / contract.durationTicks) * 100));
    const budgetSpent = Math.min(contract.totalBudget, Math.round((progress / 100) * contract.totalBudget));

    contract.progress = progress;
    contract.budgetSpent = budgetSpent;

    const isDeliverable = contract.completionRule === 'deliverable';
    let delivered = false;

    if (isDeliverable) {
      const evaluation = await evaluateContractDeliverable(contract, company);
      const spec = evaluation.spec;
      contract.deliverable = spec
        ? {
            label: spec.label || '',
            buildingTypes: spec.buildingTypes || [],
            minUnits: spec.minUnits || 0,
            fulfilled: evaluation.fulfilled,
          }
        : null;
      delivered = evaluation.fulfilled;
    }

    if (delivered || (!isDeliverable && (tickNumber >= contract.endTick || contract.progress >= 100))) {
      await finalizeContractCompletion(company, contract, tickNumber);
      results.push({ companyId: company._id, contractId: contract._id, status: 'completed' });
      await contract.save();
      continue;
    }

    if (isDeliverable && tickNumber >= contract.endTick) {
      // The deliverable never arrived before the deadline — the contract fails.
      contract.status = 'failed';
      contract.failedReason = 'Deliverable not delivered by the deadline';
      cancelDelayedJob(`contract:${contract._id}`);

      await CompanyAuditLog.create({
        companyId: company._id,
        action: 'contract_failed',
        details: {
          contractId: contract._id,
          name: contract.name,
          cityId: contract.cityId,
          cost: contract.cost,
          reason: 'deliverable_not_met',
        },
        tick: tickNumber,
      });

      const memberUserIds = company.members.map((m) => m.userId);
      for (const userId of memberUserIds) {
        await enqueueNotification({
          userId,
          type: 'system',
          title: 'City Contract Failed',
          message: `"${company.name}" failed contract: ${contract.name}. The required deliverable was not completed before the deadline.`,
          eventKey: `company:${company._id}:contract:${contract._id}:failed:${userId}`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'contracts',
          subTab: 'history',
          contractId: contract._id,
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      await contract.save();
      continue;
    }

    await contract.save();
  }

  return results;
}

/**
 * Check whether the company currently owns an eligible building for a
 * deliverable contract. A matching property must be company-owned, located in
 * the target city, use one of the required building types, and contain at
 * least the required number of units.
 */
async function evaluateContractDeliverable(contract, company) {
  const spec = contract.deliverable || getContractDeliverable(contract.contractType);
  if (!spec || !Array.isArray(spec.buildingTypes) || spec.buildingTypes.length === 0) {
    return { fulfilled: false, spec: null };
  }

  const properties = await Property.find({
    companyId: company._id,
    cityId: contract.cityId,
    buildingType: { $in: spec.buildingTypes },
  });

  const fulfilled = properties.some((p) => {
    const units = Array.isArray(p.units) ? p.units.length : typeof p.units === 'number' ? p.units : 0;
    return units >= (spec.minUnits || 0);
  });

  return { fulfilled, spec };
}

/**
 * Single authoritative completion path shared by the tick engine and the
 * delayed "contract:complete" job so both produce identical rewards, XP,
 * reputation, treasury transactions, audit logs, notifications and socket
 * events (previously the two paths diverged: the job skipped completedAt and
 * the audit log, granted X from the reward amount with a wrong action name,
 * and used a different reputation delta).
 */
export async function finalizeContractCompletion(company, contract, tickNumber) {
  contract.status = 'completed';
  contract.completedAt = new Date();
  contract.progress = 100;
  contract.budgetSpent = contract.totalBudget;

  company.treasury.balance += contract.reward;
  addTreasuryTransaction(
    company,
    {
      type: 'contract_reward',
      amount: contract.reward,
      description: `Contract completed: ${contract.name}${cityLabel(contract)} — Profit: $${contract.expectedProfit.toLocaleString()}`,
    },
    tickNumber,
  );

  company.reputation += contract.reputationReward;
  await grantCompanyXP(company, 'contract_completed', tickNumber, contract.xpReward);
  company.stats.contractsCompleted = (company.stats.contractsCompleted || 0) + 1;

  await company.save();

  await CompanyAuditLog.create({
    companyId: company._id,
    action: 'contract_completed',
    details: {
      contractId: contract._id,
      name: contract.name,
      cityId: contract.cityId,
      cost: contract.cost,
      reward: contract.reward,
      profit: contract.expectedProfit,
      xpReward: contract.xpReward,
      reputationReward: contract.reputationReward,
    },
    tick: tickNumber,
  });

  const memberUserIds = company.members.map((m) => m.userId);
  for (const userId of memberUserIds) {
    await enqueueNotification({
      userId,
      type: 'system',
      title: 'City Contract Completed',
      message: `"${company.name}" completed contract: ${contract.name}. Reward: $${contract.reward.toLocaleString()}`,
      eventKey: `company:${company._id}:contract:${contract._id}:completed:${userId}`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'contracts',
      subTab: 'history',
      contractId: contract._id,
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });
  }

  triggerMissionProgressForMany(memberUserIds, 'contract_complete');

  emitToCompany(company._id, SOCKET_EVENTS.CONTRACT_COMPLETED, {
    contractId: contract._id,
    companyId: company._id,
    name: contract.name,
    reward: contract.reward,
  });
}

export async function processContractProposals(tickNumber) {
  const proposedContracts = await CityContract.find({ status: 'proposed' });
  if (proposedContracts.length === 0) return { autoVoted: 0, approved: 0, rejected: 0, expired: 0 };

  let autoVoted = 0;
  let approved = 0;
  let rejected = 0;
  let expired = 0;

  for (const contract of proposedContracts) {
    const company = await RealEstateCompany.findById(contract.companyId);
    if (!company) {
      contract.status = 'failed';
      contract.failedReason = 'Company no longer exists';
      await contract.save();
      continue;
    }

    const proposal = contract.proposal;
    if (!proposal) continue;

    const ageTicks = tickNumber - proposal.proposedTick;
    const ceoMember = company.members.find((m) => m.role === 'ceo');
    if (!ceoMember) continue;

    const totalVoters = Math.max(1, company.members.length - 1);
    const noVotes = (proposal.votes || []).filter((v) => v.vote === 'no').length;

    const ceoVoted = (proposal.votes || []).some((v) => v.userId?.toString() === ceoMember.userId?.toString());
    const ceoIsProposer = proposal.proposedBy?.toString() === ceoMember.userId?.toString();

    if (!ceoVoted && !ceoIsProposer && ageTicks >= 4) {
      proposal.votes.push({ userId: ceoMember.userId, vote: 'yes', votedAt: new Date() });
      autoVoted++;

      await CompanyAuditLog.create({
        companyId: company._id,
        userId: ceoMember.userId,
        action: 'contract_vote_cast',
        details: { contractId: contract._id, vote: 'yes', auto: true },
        tick: tickNumber,
      });
    }

    const updatedYesVotes = (proposal.votes || []).filter((v) => v.vote === 'yes').length;
    if (updatedYesVotes / totalVoters >= VOTE_THRESHOLD && noVotes === 0) {
      await approveContract(contract, company, tickNumber);
      approved++;
      continue;
    }

    if (noVotes > 0 && noVotes / totalVoters > 1 - VOTE_THRESHOLD) {
      contract.status = 'rejected';
      proposal.status = 'rejected';
      proposal.resolvedAt = new Date();
      contract.failedReason = 'Rejected by vote';
      rejected++;

      await CompanyAuditLog.create({
        companyId: company._id,
        action: 'contract_rejected',
        details: { contractId: contract._id, reason: 'vote_rejected' },
        tick: tickNumber,
      });
      await contract.save();
      cancelDelayedJob(`vote:contract:${contract._id}`);
      continue;
    }

    if (ageTicks >= CONTRACT_PROPOSAL_EXPIRE_TICKS && proposal.status === 'pending') {
      cancelDelayedJob(`vote:contract:${contract._id}`);
      expired++;

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
            action: 'contract_vote_cast',
            details: { vote: 'yes', contractId: contract._id, auto: true, reason: 'expired_inactive' },
            tick: tickNumber,
          });
        }
      }

      const yesVotes = (proposal.votes || []).filter((v) => v.vote === 'yes').length;
      const noVotes = (proposal.votes || []).filter((v) => v.vote === 'no').length;

      if (totalVoters > 0 && yesVotes / totalVoters >= VOTE_THRESHOLD) {
        await approveContract(contract, company, tickNumber);
        approved++;

        await CompanyAuditLog.create({
          companyId: company._id,
          action: 'contract_approved',
          details: {
            reason: 'expired_auto_yes',
            contractId: contract._id,
            name: contract.name,
            activeYesVotes: yesVotes - autoCount,
            autoYesVotes: autoCount,
            noVotes,
            totalVoters,
          },
          tick: tickNumber,
        });

        await enqueueNotification({
          userId: proposal.proposedBy,
          type: 'system',
          title: 'Contract Proposal Approved',
          message: `Voting expired for the "${contract.name}" contract. ${yesVotes - autoCount} member(s) voted YES and ${autoCount} inactive member(s) were automatically counted as YES.`,
          eventKey: `company:${company._id}:contract:${contract._id}:proposal_approved:${proposal.proposedBy}`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'contracts',
          subTab: 'active',
          contractId: contract._id,
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      } else {
        contract.status = 'rejected';
        proposal.status = 'rejected';
        proposal.resolvedAt = new Date();
        contract.failedReason = 'Proposal expired';

        await CompanyAuditLog.create({
          companyId: company._id,
          action: 'contract_rejected',
          details: {
            reason: 'expired_auto_yes_insufficient',
            contractId: contract._id,
            name: contract.name,
            activeYesVotes: yesVotes - autoCount,
            autoYesVotes: autoCount,
            noVotes,
            totalVoters,
          },
          tick: tickNumber,
        });

        await enqueueNotification({
          userId: proposal.proposedBy,
          type: 'system',
          title: 'Contract Proposal Expired',
          message: `The "${contract.name}" contract proposal expired. ${autoCount} inactive member(s) were counted as YES, but the proposal did not reach the required threshold.`,
          eventKey: `company:${company._id}:contract:${contract._id}:proposal_expired:${proposal.proposedBy}`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'contracts',
          subTab: 'proposed',
          contractId: contract._id,
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      await contract.save();
    }
  }

  return { autoVoted, approved, rejected, expired };
}

export async function expireAvailableContracts(tickNumber) {
  const expiredContracts = await CityContract.find({
    status: 'available',
    expiresAtTick: { $lte: tickNumber },
  });

  for (const contract of expiredContracts) {
    contract.status = 'failed';
    contract.failedReason = 'Contract expired without being accepted';
    await contract.save();
  }

  return expiredContracts.length;
}

async function approveContract(contract, company, tickNumber) {
  contract.status = 'active';
  contract.proposal.status = 'approved';
  contract.proposal.resolvedAt = new Date();
  contract.startTick = tickNumber;
  contract.endTick = tickNumber + contract.durationTicks;
  cancelDelayedJob(`vote:contract:${contract._id}`);
  if (contract.completionRule !== 'deliverable') {
    // Deliverable contracts are evaluated by the tick engine only; a delayed
    // "complete" job must never finish them before the deliverable exists.
    const { scheduleContractCompletion } = await import('../utils/delayedJobs.js');
    scheduleContractCompletion(contract._id, company._id, contract.durationTicks, tickNumber);
  }
  contract.progress = 0;
  contract.budgetSpent = 0;
  contract.acceptedAt = new Date();

  company.treasury.balance -= contract.cost;
  addTreasuryTransaction(
    company,
    {
      type: 'contract_reward',
      amount: contract.cost,
      description: `Contract budget reserved: ${contract.name}${cityLabel(contract)}`,
    },
    tickNumber,
  );

  await company.save();
  await contract.save();

  await CompanyAuditLog.create({
    companyId: company._id,
    userId: contract.proposal.proposedBy,
    action: 'contract_approved',
    details: {
      contractId: contract._id,
      name: contract.name,
      cost: contract.cost,
      reward: contract.reward,
      durationTicks: contract.durationTicks,
    },
    tick: tickNumber,
  });

  const memberUserIds = company.members.map((m) => m.userId);
  for (const userId of memberUserIds) {
    await enqueueNotification({
      userId,
      type: 'system',
      title: 'City Contract Started',
      message: `"${company.name}" started contract: ${contract.name}. Completion in ${contract.durationTicks} months.`,
      eventKey: `company:${company._id}:contract:${contract._id}:started:${userId}`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'contracts',
      subTab: 'active',
      contractId: contract._id,
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });
  }
}

function cityLabel(contract) {
  return contract.cityId?.name ? ` in ${contract.cityId.name}` : '';
}

export { getContractTypesForLevel };
