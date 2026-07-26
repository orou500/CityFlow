import RealEstateCompany from '../models/RealEstateCompany.js';
import CityContract from '../models/CityContract.js';
import City from '../models/City.js';
import Notification from '../models/Notification.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import { getCompanyLevelBenefits, addTreasuryTransaction, grantCompanyXP } from './companyProcessing.js';
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
          await Notification.create({
            userId,
            type: 'system',
            title: 'New City Contract Available',
            message: `"${company.name}" has a new contract opportunity: ${contractData.name} in ${city.name} for $${contractData.cost.toLocaleString()}`,
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
        await Notification.create({
          userId,
          type: 'system',
          title: 'City Contract Completed',
          message: `"${company.name}" completed contract: ${contract.name}. Reward: $${contract.reward.toLocaleString()}`,
          relatedId: company._id,
          global: false,
        });
      }

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
      continue;
    }

    if (ageTicks >= CONTRACT_PROPOSAL_EXPIRE_TICKS && proposal.status === 'pending') {
      contract.status = 'rejected';
      proposal.status = 'rejected';
      proposal.resolvedAt = new Date();
      contract.failedReason = 'Proposal expired';
      expired++;

      await CompanyAuditLog.create({
        companyId: company._id,
        action: 'contract_rejected',
        details: { contractId: contract._id, reason: 'expired' },
        tick: tickNumber,
      });
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
    await Notification.create({
      userId,
      type: 'system',
      title: 'City Contract Started',
      message: `"${company.name}" started contract: ${contract.name}. Completion in ${contract.durationTicks} months.`,
      relatedId: company._id,
      global: false,
    });
  }
}

function cityName(contract) {
  return contract.cityId?.name || 'Unknown City';
}

export { getContractTypesForLevel };
