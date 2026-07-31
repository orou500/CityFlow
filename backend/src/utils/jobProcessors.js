import { createWorker, QUEUE_NAMES } from './jobQueue.js';
import { isRedisConnected } from '../config/redis.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import CityContract from '../models/CityContract.js';
import CompanyInvestment from '../models/CompanyInvestment.js';
import { addTreasuryTransaction, grantCompanyXP } from '../engine/companyProcessing.js';
import { getGameState } from '../models/GameState.js';
import { emitToCompany } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { enqueueNotification } from './notificationQueue.js';

let worker = null;

export function startJobProcessors() {
  if (!isRedisConnected()) {
    console.log('[JOB PROCESSORS] Redis not available, skipping worker setup');
    return;
  }

  worker = createWorker(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job) => {
      const { name, data } = job;

      switch (name) {
        case 'vote:expire':
          return handleVoteExpiration(data);
        case 'contract:complete':
          return handleContractCompletion(data);
        case 'investment:mature':
          return handleInvestmentMaturity(data);
        case 'offer:expire':
          return handleOfferExpiration(data);
        default:
          console.warn(`[JOB PROCESSORS] Unknown job type: ${name}`);
      }
    },
    { concurrency: 5 },
  );

  console.log('[JOB PROCESSORS] Delayed job processors started');
}

async function handleVoteExpiration(data) {
  const { companyId, proposalType, proposalId } = data;

  const company = await RealEstateCompany.findById(companyId);
  if (!company || !company.active) return;

  if (proposalType === 'loanRequest') {
    const request = company.loanRequests.id(proposalId);
    if (request && request.status === 'pending') {
      request.status = 'expired';
      await company.save();

      for (const member of company.members) {
        await enqueueNotification({
          userId: member.userId,
          type: 'system',
          title: 'Loan Request Expired',
          message: `Loan request for $${request.amount?.toLocaleString() || 'N/A'} has expired without resolution.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'loans',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      emitToCompany(companyId, SOCKET_EVENTS.VOTE_EXPIRED, {
        proposalType,
        proposalId,
        companyId,
      });
    }
  } else if (proposalType === 'developmentRequest') {
    const request = company.developmentRequests.id(proposalId);
    if (request && request.status === 'pending') {
      request.status = 'expired';
      await company.save();

      for (const member of company.members) {
        await enqueueNotification({
          userId: member.userId,
          type: 'system',
          title: 'Development Request Expired',
          message: `Development request has expired without resolution.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'properties',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      emitToCompany(companyId, SOCKET_EVENTS.VOTE_EXPIRED, {
        proposalType,
        proposalId,
        companyId,
      });
    }
  } else if (proposalType === 'investment') {
    const investment = await CompanyInvestment.findById(proposalId);
    if (investment && investment.proposal?.status === 'pending') {
      investment.proposal.status = 'rejected';
      investment.proposal.resolvedAt = new Date();
      investment.status = 'rejected';
      await investment.save();

      const companyInvestments = await RealEstateCompany.findById(companyId);
      if (companyInvestments) {
        for (const member of companyInvestments.members) {
          await enqueueNotification({
            userId: member.userId,
            type: 'system',
            title: 'Investment Proposal Expired',
            message: `Investment proposal "${investment.name}" has expired without resolution.`,
            route: `/real-estate-companies/${companyId}`,
            tab: 'investments',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        }

        emitToCompany(companyId, SOCKET_EVENTS.VOTE_EXPIRED, {
          proposalType,
          proposalId,
          companyId,
        });
      }
    }
  } else if (proposalType === 'propertyPurchase') {
    const request = company.propertyPurchaseRequests.id(proposalId);
    if (request && request.status === 'pending') {
      request.status = 'expired';
      await company.save();

      for (const member of company.members) {
        await enqueueNotification({
          userId: member.userId,
          type: 'system',
          title: 'Property Purchase Expired',
          message: `Property purchase request has expired without resolution.`,
          route: `/real-estate-companies/${companyId}`,
          tab: 'properties',
          entityType: 'company',
          entityId: companyId,
          relatedId: companyId,
          global: false,
        });
      }

      emitToCompany(companyId, SOCKET_EVENTS.VOTE_EXPIRED, {
        proposalType,
        proposalId,
        companyId,
      });
    }
  } else if (proposalType === 'contract') {
    const contract = await CityContract.findById(proposalId);
    if (contract && contract.proposal?.status === 'pending') {
      contract.proposal.status = 'expired';
      contract.status = 'available';
      contract.proposal = undefined;
      await contract.save();

      const companyContracts = await RealEstateCompany.findById(companyId);
      if (companyContracts) {
        for (const member of companyContracts.members) {
          await enqueueNotification({
            userId: member.userId,
            type: 'system',
            title: 'Contract Proposal Expired',
            message: `Contract proposal has expired without resolution.`,
            route: `/real-estate-companies/${companyId}`,
            tab: 'contracts',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        }

        emitToCompany(companyId, SOCKET_EVENTS.VOTE_EXPIRED, {
          proposalType,
          proposalId,
          companyId,
        });
      }
    }
  }
}

async function handleContractCompletion(data) {
  const { contractId, companyId } = data;

  const contract = await CityContract.findById(contractId);
  if (!contract || contract.status !== 'active') return;

  const company = await RealEstateCompany.findById(companyId);
  if (!company || !company.active) return;

  const gameState = await getGameState();
  const currentTick = gameState.tickNumber;

  contract.status = 'completed';
  contract.progress = 100;
  await contract.save();

  company.treasury.balance += contract.reward;
  addTreasuryTransaction(
    company,
    {
      type: 'contract_reward',
      amount: contract.reward,
      description: `Contract completed: ${contract.name}`,
    },
    currentTick,
  );
  await grantCompanyXP(company, 'contract_completion', currentTick, contract.reward);
  company.reputation = Math.min(100, (company.reputation || 0) + 5);
  await company.save();

  for (const member of company.members) {
    await enqueueNotification({
      userId: member.userId,
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

  emitToCompany(companyId, SOCKET_EVENTS.CONTRACT_COMPLETED, {
    contractId,
    companyId,
    name: contract.name,
    reward: contract.reward,
  });
}

async function handleInvestmentMaturity(data) {
  const { investmentId, companyId } = data;

  const investment = await CompanyInvestment.findById(investmentId);
  if (!investment || investment.status !== 'active') return;

  const company = await RealEstateCompany.findById(companyId);
  if (!company || !company.active) return;

  const gameState = await getGameState();
  const currentTick = gameState.tickNumber;

  const profit = investment.currentValue - investment.principal;
  const netReturn = investment.currentValue;

  investment.status = 'matured';
  investment.maturityTick = currentTick;
  investment.currentValue = netReturn;
  await investment.save();

  company.treasury.balance += netReturn;
  addTreasuryTransaction(
    company,
    {
      type: 'investment_return',
      amount: netReturn,
      description: `Investment matured: ${investment.name} (profit: $${profit.toLocaleString()})`,
    },
    currentTick,
  );
  await company.save();

  for (const member of company.members) {
    await enqueueNotification({
      userId: member.userId,
      type: 'system',
      title: 'Investment Matured',
      message: `Investment "${investment.name}" matured. ${profit >= 0 ? 'Profit' : 'Loss'}: $${Math.abs(profit).toLocaleString()}. Capital returned: $${netReturn.toLocaleString()}.`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'investments',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });
  }

  emitToCompany(companyId, SOCKET_EVENTS.INVESTMENT_MATURED, {
    investmentId,
    companyId,
    name: investment.name,
    profit,
    returnedAmount: netReturn,
  });
}

async function handleOfferExpiration(data) {
  const { offerId } = data;

  const PropertyOffer = (await import('../models/PropertyOffer.js')).default;
  const offer = await PropertyOffer.findById(offerId);
  if (!offer || offer.status !== 'pending') return;

  offer.status = 'expired';
  await offer.save();

  await enqueueNotification({
    userId: offer.buyerId,
    type: 'system',
    title: 'Offer Expired',
    message: `Your offer of $${(offer.counterOffer || offer.offerAmount)?.toLocaleString() || 'N/A'} has expired.`,
    route: '/marketplace',
    entityType: 'marketplace',
    relatedId: offer.propertyId,
    global: false,
  });

  if (offer.sellerId) {
    await enqueueNotification({
      userId: offer.sellerId,
      type: 'system',
      title: 'Offer Expired',
      message: `An offer for your property has expired.`,
      route: '/marketplace',
      entityType: 'marketplace',
      relatedId: offer.propertyId,
      global: false,
    });
  }
}

export function shutdownJobProcessors() {
  if (worker) {
    worker.close();
    worker = null;
  }
}
