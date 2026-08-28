import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import CityContract from '../models/CityContract.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import GameState, { getGameState } from '../models/GameState.js';
import { VOTE_THRESHOLD, CONTRACT_PROPOSAL_EXPIRE_TICKS } from '../config/cityContracts.js';
import { addTreasuryTransaction } from '../engine/companyProcessing.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import { onContractStarted, onCompanyVote } from '../utils/cacheInvalidation.js';
import { scheduleVoteExpiration, scheduleContractCompletion, cancelDelayedJob } from '../utils/delayedJobs.js';

const router = Router();

function getMember(company, userId) {
  return company.members.find((m) => m.userId?.toString() === userId.toString());
}

function hasPermission(member, permission) {
  if (!member) return false;
  const perms = {
    ceo: [
      'view_company',
      'invite_members',
      'manage_properties',
      'initiate_investments',
      'view_treasury',
      'manage_treasury',
      'manage_settings',
      'manage_applications',
      'manage_loan_requests',
      'remove_members',
      'manage_contracts',
    ],
    director: [
      'invite_members',
      'manage_properties',
      'initiate_investments',
      'view_treasury',
      'manage_treasury',
      'manage_settings',
      'manage_applications',
      'manage_loan_requests',
      'remove_members',
      'manage_contracts',
    ],
    officer: ['invite_members', 'view_treasury', 'manage_applications'],
    member: ['view_company', 'contribute_funds'],
    recruit: ['view_company', 'contribute_funds'],
  };
  return perms[member.role]?.includes(permission) || false;
}

router.get('/:id/contracts', authenticate, async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const contracts = await CityContract.find({
      companyId: company._id,
      status: { $in: ['available', 'proposed', 'active'] },
    })
      .populate('cityId', 'name population economicCondition demandIndex supplyIndex growthRate')
      .populate('proposal.proposedBy', 'username')
      .populate('proposal.votes.userId', 'username');

    const gameState = await GameState.findOne().sort({ tickNumber: -1 }).lean();
    const currentTick = gameState?.tickNumber || 0;

    res.json(contracts.map((c) => ({ ...c.toJSON(), currentTick })));
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/:id/contracts/history', authenticate, async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const contracts = await CityContract.find({
      companyId: company._id,
      status: { $in: ['completed', 'failed', 'rejected'] },
    })
      .populate('cityId', 'name')
      .sort({ updatedAt: -1 })
      .limit(50);

    const gameState = await GameState.findOne().sort({ tickNumber: -1 }).lean();
    const currentTick = gameState?.tickNumber || 0;

    res.json(contracts.map((c) => ({ ...c.toJSON(), currentTick })));
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/:id/contracts/:contractId/propose', authenticate, async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || !hasPermission(caller, 'manage_contracts')) {
      return res.status(403).json({ error: 'Only directors or CEO can propose contracts' });
    }

    const contract = await CityContract.findById(req.params.contractId);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if (contract.companyId.toString() !== company._id.toString()) {
      return res.status(400).json({ error: 'Contract does not belong to this company' });
    }
    if (contract.status !== 'available') {
      return res.status(400).json({ error: 'Contract is not available' });
    }
    if (company.level < contract.requiredLevel) {
      return res.status(400).json({ error: `Requires level ${contract.requiredLevel}` });
    }
    if (company.treasury.balance < contract.requiredTreasury) {
      return res.status(400).json({
        error: `Insufficient treasury balance. Required: $${contract.requiredTreasury.toLocaleString()}, Available: $${company.treasury.balance.toLocaleString()}`,
      });
    }

    const gameState = await getGameState();
    const pendingProposals = await CityContract.countDocuments({
      companyId: company._id,
      status: 'proposed',
    });
    if (pendingProposals >= 3) {
      return res.status(400).json({ error: 'Maximum 3 pending contract proposals' });
    }

    contract.status = 'proposed';
    contract.proposal = {
      proposedBy: req.user._id,
      status: 'pending',
      votes: [],
      proposedAt: new Date(),
      proposedTick: gameState.tickNumber,
      expiresAtTick: gameState.tickNumber + CONTRACT_PROPOSAL_EXPIRE_TICKS,
    };
    await contract.save();
    scheduleVoteExpiration(company._id, 'contract', contract._id, 8);
    await onCompanyVote(company._id);

    await CompanyAuditLog.create({
      companyId: company._id,
      userId: req.user._id,
      action: 'contract_proposed',
      details: {
        contractId: contract._id,
        name: contract.name,
        cost: contract.cost,
        reward: contract.reward,
        durationTicks: contract.durationTicks,
      },
      tick: gameState.tickNumber,
    });

    const memberUserIds = company.members.map((m) => m.userId);
    for (const userId of memberUserIds) {
      if (userId.toString() === req.user._id.toString()) continue;
      await enqueueNotification({
        userId,
        type: 'company_vote',
        title: 'Contract Proposal',
        message: `${caller.role} proposed contract: ${contract.name} ($${contract.cost.toLocaleString()}). Vote to approve.`,
        eventKey: `company:${company._id}:contract:${contract._id}:vote_request:${userId}`,
        route: `/real-estate-companies/${company._id}`,
        tab: 'contracts',
        entityType: 'company',
        entityId: company._id,
        relatedId: company._id,
        global: false,
      });
    }

    await enqueueNotification({
      userId: req.user._id,
      type: 'company_vote',
      title: 'Contract Proposal Submitted',
      message: `You proposed contract: ${contract.name}. Members will vote in the contracts tab.`,
      eventKey: `company:${company._id}:contract:${contract._id}:submitted`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'contracts',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });

    await processPlayerProgress(req.user._id, 'contract_propose');

    res.json(contract);
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/:id/contracts/:contractId/vote', authenticate, async (req, res) => {
  try {
    const { vote } = req.body;
    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'Vote must be "yes" or "no"' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller) return res.status(403).json({ error: 'Not a member' });

    const contract = await CityContract.findById(req.params.contractId);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if (contract.companyId.toString() !== company._id.toString()) {
      return res.status(400).json({ error: 'Contract does not belong to this company' });
    }
    if (contract.status !== 'proposed') {
      return res.status(400).json({ error: 'Contract is not pending approval' });
    }

    const proposal = contract.proposal;
    if (!proposal || proposal.status !== 'pending') {
      return res.status(400).json({ error: 'Proposal is not pending' });
    }

    if (proposal.proposedBy?.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot vote on your own proposal' });
    }

    const existingVote = proposal.votes.find((v) => v.userId?.toString() === req.user._id.toString());
    if (existingVote) {
      return res.status(400).json({ error: 'You have already voted on this proposal' });
    }

    proposal.votes.push({ userId: req.user._id, vote, votedAt: new Date() });
    company.stats.totalVotes = (company.stats.totalVotes || 0) + 1;
    await company.save();

    const gameState = await getGameState();
    await CompanyAuditLog.create({
      companyId: company._id,
      userId: req.user._id,
      action: 'contract_vote_cast',
      details: { contractId: contract._id, vote },
      tick: gameState.tickNumber,
    });

    const totalVoters = Math.max(1, company.members.length - 1);
    const yesVotes = proposal.votes.filter((v) => v.vote === 'yes').length;
    const noVotes = proposal.votes.filter((v) => v.vote === 'no').length;

    if (yesVotes / totalVoters >= VOTE_THRESHOLD && noVotes === 0) {
      proposal.status = 'approved';
      proposal.resolvedAt = new Date();
      contract.status = 'active';
      contract.startTick = gameState.tickNumber;
      contract.endTick = gameState.tickNumber + contract.durationTicks;
      contract.progress = 0;
      contract.budgetSpent = 0;
      contract.acceptedAt = new Date();
      contract.acceptedBy = req.user._id;

      company.treasury.balance -= contract.cost;
      addTreasuryTransaction(
        company,
        {
          type: 'contract_reward',
          amount: contract.cost,
          description: `Contract budget reserved: ${contract.name}`,
        },
        gameState.tickNumber,
      );
      await company.save();
      try {
        await contract.save();
      } catch (contractErr) {
        company.treasury.balance += contract.cost;
        company.treasury.transactions.pop();
        await company.save();
        throw contractErr;
      }
      cancelDelayedJob(`vote:contract:${contract._id}`);
      scheduleContractCompletion(contract._id, company._id, contract.durationTicks, gameState.tickNumber);
      await onContractStarted(company._id);

      await CompanyAuditLog.create({
        companyId: company._id,
        userId: req.user._id,
        action: 'contract_approved',
        details: {
          contractId: contract._id,
          name: contract.name,
          cost: contract.cost,
          reward: contract.reward,
          durationTicks: contract.durationTicks,
        },
        tick: gameState.tickNumber,
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
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      return res.json({ contract, approved: true, treasury: company.treasury });
    }

    if (noVotes > 0 && noVotes / totalVoters > 1 - VOTE_THRESHOLD) {
      proposal.status = 'rejected';
      proposal.resolvedAt = new Date();
      contract.status = 'rejected';
      contract.failedReason = 'Rejected by vote';
      await contract.save();
      cancelDelayedJob(`vote:contract:${contract._id}`);

      return res.json({ contract, approved: false, rejected: true });
    }

    await contract.save();
    await onCompanyVote(company._id);
    res.json({ contract, approved: false });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
