import RealEstateCompany from '../models/RealEstateCompany.js';
import CityContract from '../models/CityContract.js';
import City from '../models/City.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import { getCompanyLevelBenefits, addTreasuryTransaction, grantCompanyXP } from './companyProcessing.js';
import { cancelDelayedJob } from '../utils/delayedJobs.js';
import { triggerMissionProgressForMany } from '../utils/missionTrigger.js';
import {
  generateContractForCity,
  getContractTypesForLevel,
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
        await CityContract.create(contractData);
        generated++;

        const memberUserIds = company.members.map((m) => m.userId);
        for (const userId of memberUserIds) {
          await enqueueNotification({
            userId,
            type: 'system',
            title: 'New City Contract Available',
            message: `"${company.name}" has a new contract opportunity: ${contractData.name} in ${city.name} for $${contractData.cost.toLocaleString()}`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'contracts',
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

    if (tickNumber >= contract.endTick || contract.progress >= 100) {
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
          description: `Contract completed: ${contract.name} in ${cityName(contract)} — Profit: $${contract.expectedProfit.toLocaleString()}`,
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
          route: `/real-estate-companies/${company._id}`,
          tab: 'contracts',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      triggerMissionProgressForMany(memberUserIds, 'contract_complete');

      results.push({ companyId: company._id, contractId: contract._id, status: 'completed' });
    }

    await contract.save();
  }

  return results;
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
          details: { reason: 'expired_auto_yes', contractId: contract._id, name: contract.name, activeYesVotes: yesVotes - autoCount, autoYesVotes: autoCount, noVotes, totalVoters },
          tick: tickNumber,
        });

        await enqueueNotification({
          userId: proposal.proposedBy,
          type: 'system',
          title: 'Contract Proposal Approved',
          message: `Voting expired for the "${contract.name}" contract. ${yesVotes - autoCount} member(s) voted YES and ${autoCount} inactive member(s) were automatically counted as YES.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'contracts',
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
          details: { reason: 'expired_auto_yes_insufficient', contractId: contract._id, name: contract.name, activeYesVotes: yesVotes - autoCount, autoYesVotes: autoCount, noVotes, totalVoters },
          tick: tickNumber,
        });

        await enqueueNotification({
          userId: proposal.proposedBy,
          type: 'system',
          title: 'Contract Proposal Expired',
          message: `The "${contract.name}" contract proposal expired. ${autoCount} inactive member(s) were counted as YES, but the proposal did not reach the required threshold.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'contracts',
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
  const { scheduleContractCompletion } = await import('../utils/delayedJobs.js');
  scheduleContractCompletion(contract._id, company._id, contract.durationTicks, tickNumber);
  contract.progress = 0;
  contract.budgetSpent = 0;
  contract.acceptedAt = new Date();

  company.treasury.balance -= contract.cost;
  addTreasuryTransaction(
    company,
    {
      type: 'contract_reward',
      amount: contract.cost,
      description: `Contract budget reserved: ${contract.name} in ${cityName(contract)}`,
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
      route: `/real-estate-companies/${company._id}`,
      tab: 'contracts',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });
  }
}

function cityName(contract) {
  return contract.cityId?.name || 'Unknown City';
}

export { getContractTypesForLevel };
