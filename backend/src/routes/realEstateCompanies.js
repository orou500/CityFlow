import { Router } from 'express';
import RealEstateCompany from '../models/RealEstateCompany.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Loan from '../models/Loan.js';
import Transaction from '../models/Transaction.js';
import City from '../models/City.js';
import Company from '../models/Company.js';
import CompanyInvestment from '../models/CompanyInvestment.js';
import InvestmentOpportunity from '../models/InvestmentOpportunity.js';
import { authenticate } from '../middleware/auth.js';
import { getGameState } from '../models/GameState.js';
import { awardXp } from '../utils/leveling.js';
import { getAvailableInvestments } from '../engine/treasuryInvestments.js';
import {
  getInvestmentTypeConfig,
  LARGE_INVESTMENT_THRESHOLD,
  LARGE_INVESTMENT_TREASURY_PCT,
  INVESTMENT_PROPOSAL_EXPIRE_TICKS,
} from '../config/investmentOpportunities.js';
import {
  UPGRADE_TYPES,
  calculateUpgradeCost,
  calculateUpgradeEffects,
  countUpgradesByType,
} from '../config/upgradeProjects.js';
import { IMPROVEMENT_PROJECTS, calculateImprovementCost } from '../config/improvementProjects.js';
import { getAllProjects, calculateProjectCost, calculateUnitRent } from '../config/developmentProjects.js';
import { trackEvent, EVENTS } from '../utils/analytics.js';
import ConstructionProject from '../models/ConstructionProject.js';
import { grantCompanyXP, addTreasuryTransaction } from '../engine/companyProcessing.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import {
  getCompanyLevelBenefits,
  xpRequiredForLevel,
  xpRequiredForNextLevel,
  COMPANY_MILESTONES,
  MAX_COMPANY_LEVEL,
} from '../config/companyProgression.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { cacheKeys, cacheTTL } from '../utils/cacheKeys.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import {
  invalidateCompany,
  invalidateUser,
  invalidateLeaderboards,
  onCompanyCreated,
  onCompanyUpdated,
  onCompanyTreasuryChanged,
  onCompanyVote,
  onCompanyVoteCompleted,
} from '../utils/cacheInvalidation.js';
import { scheduleVoteExpiration, cancelDelayedJob } from '../utils/delayedJobs.js';
import { emitToCompany, emitToAll } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { publish, CHANNELS } from '../utils/pubsub.js';
import { cacheDel } from '../utils/cache.js';
import { cacheKeys as ck } from '../utils/cacheKeys.js';
import StockMarketEvent from '../models/StockMarketEvent.js';
import StockHolding from '../models/StockHolding.js';

const router = Router();
router.use(authenticate);

const COMPANY_CREATION_FEE = 5_000_000;
const MIN_FOUNDER_LEVEL = 15;
const MIN_FOUNDER_NET_WORTH = 5_000_000;
const MIN_FOUNDER_PORTFOLIO = 3_000_000;
const MIN_FOUNDER_ACCOUNT_AGE_DAYS = 28;
const MAX_MEMBERS_BASE = 10;
const IPO_FEE = 100_000_000;
const MIN_IPO_LEVEL = 15;
const MIN_IPO_MEMBERS = 5;
const MIN_IPO_NET_WORTH = 100_000_000;
const IPO_MIN_PROPERTIES = 10;
const IPO_MAX_DEBT_RATIO = 0.5;
const LOAN_REQUEST_VOTE_THRESHOLD = 0.5;
const MAX_ACTIVE_LOANS = 5;
const MAX_PENDING_LOAN_REQUESTS = 3;

function getMember(company, userId) {
  return company.members.find((m) => m.userId?.toString() === userId.toString());
}

function hasPermission(member, permission) {
  if (!member) return false;
  if (member.role === 'ceo') return true;
  if (member.role === 'director') {
    return [
      'invite_members',
      'manage_properties',
      'initiate_investments',
      'view_treasury',
      'manage_treasury',
      'manage_settings',
      'manage_applications',
      'manage_loan_requests',
      'remove_members',
    ].includes(permission);
  }
  if (member.role === 'officer') {
    return ['invite_members', 'view_treasury', 'manage_applications'].includes(permission);
  }
  return ['view_company', 'contribute_funds'].includes(permission);
}

async function addAuditLog(companyId, userId, action, details = {}, tick = 0) {
  await CompanyAuditLog.create({ companyId, userId, action, details, tick });
}

function computeShares(members, totalShares, treasuryShares) {
  const memberTotal = members.reduce((sum, m) => sum + m.shares, 0);
  const effectiveTotal = totalShares || memberTotal + (treasuryShares || 0);
  const breakdown = members.map((m) => ({
    userId: m.userId,
    shares: m.shares,
    percentage: effectiveTotal > 0 ? Math.round((m.shares / effectiveTotal) * 10000) / 100 : 0,
  }));
  if (treasuryShares > 0) {
    breakdown.push({
      userId: null,
      shares: treasuryShares,
      percentage: effectiveTotal > 0 ? Math.round((treasuryShares / effectiveTotal) * 10000) / 100 : 0,
      isTreasury: true,
    });
  }
  return breakdown;
}

router.get('/', async (req, res) => {
  try {
    const { search, sort, page = '1', limit = '20' } = req.query;
    const filter = { active: true };

    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    let sortOpts = { reputation: -1 };
    if (sort === 'networth') sortOpts = { 'stats.netWorth': -1 };
    else if (sort === 'members') sortOpts = { 'members.1': -1 };
    else if (sort === 'properties') sortOpts = { 'stats.propertiesOwned': -1 };
    else if (sort === 'level') sortOpts = { level: -1 };
    else if (sort === 'newest') sortOpts = { createdAt: -1 };
    else if (sort === 'name') sortOpts = { name: 1 };

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [total, companies] = await Promise.all([
      RealEstateCompany.countDocuments(filter),
      RealEstateCompany.find(filter)
        .populate('founderId', 'username avatar')
        .populate('members.userId', 'username avatar')
        .sort(sortOpts)
        .skip(skip)
        .limit(limitNum)
        .select('-treasury.transactions -invitations'),
    ]);

    res.json({ companies, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my', async (req, res) => {
  try {
    const companies = await RealEstateCompany.find({
      'members.userId': req.user._id,
      active: true,
    })
      .populate('founderId', 'username avatar')
      .populate('members.userId', 'username avatar')
      .select('-treasury.transactions -invitations');

    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/invitations', async (req, res) => {
  try {
    const companies = await RealEstateCompany.find({
      'invitations.userId': req.user._id,
      'invitations.status': 'pending',
      active: true,
    })
      .populate('founderId', 'username avatar')
      .select('name description logo founderId members level reputation stats');

    const invitations = [];
    for (const company of companies) {
      const inv = company.invitations.find(
        (i) => i.userId?.toString() === req.user._id.toString() && i.status === 'pending',
      );
      if (inv) {
        invitations.push({
          _id: inv._id,
          company: {
            _id: company._id,
            name: company.name,
            description: company.description,
            logo: company.logo,
            founderId: company.founderId,
            memberCount: company.members.length,
            level: company.level,
            reputation: company.reputation,
            stats: company.stats,
          },
          invitedAt: inv.createdAt,
          invitedBy: inv.invitedBy,
        });
      }
    }

    res.json(invitations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, logo, hqCityId } = req.body;

    if (!name || name.trim().length < 3) {
      return res.status(400).json({ error: 'Company name must be at least 3 characters' });
    }
    if (name.length > 50) {
      return res.status(400).json({ error: 'Company name must be 50 characters or less' });
    }

    if (!hqCityId) {
      return res.status(400).json({ error: 'You must select a headquarters city' });
    }

    const hqCity = await City.findById(hqCityId);
    if (!hqCity) {
      return res.status(400).json({ error: 'Selected city not found' });
    }

    const existing = await RealEstateCompany.findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } });
    if (existing) {
      return res.status(400).json({ error: 'A company with this name already exists' });
    }

    const user = await User.findById(req.user._id);
    if (user.companyId) {
      return res.status(400).json({ error: 'You are already a member of a company' });
    }

    if (user.balance < COMPANY_CREATION_FEE) {
      return res
        .status(400)
        .json({ error: `Insufficient funds. Company creation costs $${COMPANY_CREATION_FEE.toLocaleString()}` });
    }

    if (user.level < MIN_FOUNDER_LEVEL) {
      return res.status(400).json({ error: `You must be at least Level ${MIN_FOUNDER_LEVEL} to create a company` });
    }

    const ownedProperties = await Property.find({ ownerId: user._id }).lean();
    const portfolioValue = ownedProperties.reduce((sum, p) => sum + (p.currentPrice || 0), 0);
    if (portfolioValue < MIN_FOUNDER_PORTFOLIO) {
      return res.status(400).json({
        error: `Your portfolio must be worth at least $${MIN_FOUNDER_PORTFOLIO.toLocaleString()} to create a company`,
      });
    }

    const netWorth = user.balance + portfolioValue;
    if (netWorth < MIN_FOUNDER_NET_WORTH) {
      return res.status(400).json({
        error: `Your net worth must be at least $${MIN_FOUNDER_NET_WORTH.toLocaleString()} to create a company`,
      });
    }

    const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
    const accountAgeDays = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24));
    if (accountAgeDays < MIN_FOUNDER_ACCOUNT_AGE_DAYS) {
      return res.status(400).json({
        error: `Your account must be at least ${MIN_FOUNDER_ACCOUNT_AGE_DAYS} days old to create a company`,
      });
    }

    user.balance -= COMPANY_CREATION_FEE;
    await user.save();

    const gameState = await getGameState();

    const founderShares = 700;
    const treasuryShares = 300;
    const totalShares = 1000;

    const company = await RealEstateCompany.create({
      name: name.trim(),
      description: description || '',
      logo: logo || '',
      founderId: user._id,
      hqCityId: hqCity._id,
      members: [{ userId: user._id, role: 'ceo', shares: founderShares }],
      invitations: [],
      shares: { totalShares, treasuryShares, parValue: 100 },
      treasury: { balance: 0, transactions: [] },
      stats: {
        netWorth: 0,
        propertiesOwned: 0,
        totalRentalIncome: 0,
        totalTreasuryDeposits: 0,
        activeProjects: 0,
        totalLoanBalance: 0,
      },
      reputation: 0,
      level: 1,
      xp: 0,
      xpToNextLevel: 1000,
      maxMembers: MAX_MEMBERS_BASE,
      active: true,
      foundedTick: gameState.tickNumber || 0,
      creationFee: COMPANY_CREATION_FEE,
    });

    user.companyId = company._id;
    await user.save();

    await Transaction.create({
      buyerId: user._id,
      companyId: company._id,
      price: COMPANY_CREATION_FEE,
      type: 'buy',
    });

    await addAuditLog(
      company._id,
      user._id,
      'company_created',
      { name: company.name, fee: COMPANY_CREATION_FEE },
      gameState.tickNumber,
    );

    await awardXp(user, 25, 'company_create');

    await onCompanyCreated(company._id, user._id);
    trackEvent(EVENTS.COMPANY_CREATED, { userId: user._id, companyId: company._id });

    await processPlayerProgress(user._id, 'company_create', { skipXp: true });

    res.status(201).json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await cacheGetOrSet(
      cacheKeys.company(req.params.id),
      async () => {
        const company = await RealEstateCompany.findById(req.params.id)
          .populate('founderId', 'username avatar level')
          .populate('members.userId', 'username avatar level')
          .populate('invitations.userId', 'username avatar')
          .populate('invitations.invitedBy', 'username')
          .populate('hqCityId', 'name country');

        if (!company) return null;

        const shareBreakdown = computeShares(company.members, company.shares?.totalShares, company.shares?.treasuryShares);

        const properties = await Property.find({ companyId: company._id })
          .populate('cityId', 'name country')
          .select('name type currentPrice rent cityId condition occupancy forSale');

        const loans = await Loan.find({ companyId: company._id, active: true }).select(
          'type principal remainingBalance interestRate ticksRemaining paymentPerTick',
        );

        const isMember = getMember(company, req.user._id);
        const pendingInvites = company.invitations.filter((i) => i.status === 'pending');
        const hasPendingApplication =
          !isMember &&
          company.applications.some((a) => a.userId?.toString() === req.user._id.toString() && a.status === 'pending');

        const levelBenefits = getCompanyLevelBenefits(company.level);
        const xpForCurrentLevel = xpRequiredForLevel(company.level);
        const xpForNextLevel = company.xpToNextLevel || xpRequiredForNextLevel(company.level);
        const xpInCurrentLevel = Math.max(0, company.xp - xpForCurrentLevel);
        const xpNeededForLevel = Math.max(1, xpForNextLevel - xpForCurrentLevel);

        return {
          ...company.toJSON(),
          xpForCurrentLevel,
          xpToNextLevel: xpForNextLevel,
          xpInCurrentLevel,
          xpNeededForLevel,
          shareBreakdown,
          properties,
          loans,
          isMember: !!isMember,
          memberRole: isMember?.role || null,
          pendingInvitations: pendingInvites.length,
          hasPendingApplication,
          levelBenefits,
        };
      },
      cacheTTL.standard,
    );

    if (!data) return res.status(404).json({ error: 'Company not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member || !hasPermission(member, 'manage_settings')) {
      return res.status(403).json({ error: 'Only the CEO can update company settings' });
    }

    const { description, logo } = req.body;
    if (description !== undefined) company.description = description;
    if (logo !== undefined) company.logo = logo;

    await company.save();

    const gameState = await getGameState();
    await addAuditLog(company._id, req.user._id, 'settings_updated', { description, logo }, gameState.tickNumber);

    await onCompanyUpdated(company._id);

    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/invite', async (req, res) => {
  try {
    const { userId } = req.body;
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const inviter = getMember(company, req.user._id);
    if (!inviter || !hasPermission(inviter, 'invite_members')) {
      return res.status(403).json({ error: 'You do not have permission to invite members' });
    }

    if (company.members.length >= company.maxMembers) {
      return res.status(400).json({ error: `Company is full. Maximum ${company.maxMembers} members.` });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.companyId) {
      return res.status(400).json({ error: 'This player is already in a company' });
    }

    const existingInvite = company.invitations.find((i) => i.userId?.toString() === userId && i.status === 'pending');
    if (existingInvite) {
      return res.status(400).json({ error: 'Invitation already pending' });
    }

    company.invitations.push({ userId, invitedBy: req.user._id, status: 'pending' });
    await company.save();

    await enqueueNotification({
      userId,
      type: 'system',
      title: 'Company Invitation',
      message: `You have been invited to join "${company.name}"`,
      route: `/real-estate-companies/${company._id}`,
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'member_invited',
      { targetUserId: userId, targetUsername: targetUser.username },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/invite/:invitationId/accept', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const invitation = company.invitations.id(req.params.invitationId);
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });
    if (invitation.userId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'This invitation is not for you' });
    }
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation already processed' });
    }

    const user = await User.findById(req.user._id);
    if (user.companyId) {
      return res.status(400).json({ error: 'You are already in a company. Leave your current company first.' });
    }

    if (company.members.length >= company.maxMembers) {
      return res.status(400).json({ error: 'Company is full' });
    }

    invitation.status = 'accepted';

    const newMemberShares = Math.min(50, company.shares.treasuryShares || 0);
    company.shares.treasuryShares = Math.max(0, (company.shares.treasuryShares || 0) - newMemberShares);
    company.members.push({
      userId: req.user._id,
      role: 'recruit',
      shares: newMemberShares,
      invitedBy: invitation.invitedBy,
    });

    await company.save();

    user.companyId = company._id;
    await user.save();

    const gameState = await getGameState();
    await addAuditLog(company._id, req.user._id, 'member_joined', { username: user.username }, gameState.tickNumber);

    await enqueueNotification({
      userId: company.founderId,
      type: 'system',
      title: 'Member Joined',
      message: `${user.username} has joined "${company.name}"`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'members',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });

    await invalidateCompany(company._id);
    await invalidateUser(req.user._id);
    emitToCompany(company._id, SOCKET_EVENTS.COMPANY_MEMBER_JOINED, {
      companyId: company._id,
      userId: req.user._id,
      username: req.user.username,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Employee Management ───────────────────────────────────────────────

router.post('/:id/employees/hire', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || caller.role !== 'ceo') {
      return res.status(403).json({ error: 'Only the CEO can hire employees' });
    }

    const { count } = req.body;
    if (!count || count <= 0 || !Number.isInteger(count)) {
      return res.status(400).json({ error: 'Invalid employee count' });
    }

    const newTotal = (company.employees.count || 0) + count;
    if (newTotal > (company.employees.maxEmployees || 10)) {
      return res.status(400).json({ error: `Cannot exceed maximum ${company.employees.maxEmployees} employees` });
    }

    const salaryCost = count * (company.employees.monthlySalaryPerEmployee || 5000);
    if (company.treasury.balance < salaryCost) {
      return res.status(400).json({ error: `Insufficient treasury balance for first month salary ($${salaryCost.toLocaleString()})` });
    }

    company.employees.count = newTotal;
    company.employees.totalPayroll = newTotal * (company.employees.monthlySalaryPerEmployee || 5000);
    await company.save();

    const gameState = await getGameState();
    await addAuditLog(company._id, req.user._id, 'employees_hired', { count, total: newTotal }, gameState.tickNumber);
    await invalidateCompany(company._id);

    res.json({ employees: company.employees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/employees/fire', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || caller.role !== 'ceo') {
      return res.status(403).json({ error: 'Only the CEO can fire employees' });
    }

    const { count } = req.body;
    if (!count || count <= 0 || !Number.isInteger(count)) {
      return res.status(400).json({ error: 'Invalid employee count' });
    }

    const currentCount = company.employees.count || 0;
    if (count > currentCount) {
      return res.status(400).json({ error: `Company only has ${currentCount} employees` });
    }

    company.employees.count = currentCount - count;
    company.employees.totalPayroll = company.employees.count * (company.employees.monthlySalaryPerEmployee || 5000);
    await company.save();

    const gameState = await getGameState();
    await addAuditLog(company._id, req.user._id, 'employees_fired', { count, remaining: company.employees.count }, gameState.tickNumber);
    await invalidateCompany(company._id);

    res.json({ employees: company.employees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/employees/salary', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || caller.role !== 'ceo') {
      return res.status(403).json({ error: 'Only the CEO can set employee salaries' });
    }

    const { monthlySalary } = req.body;
    if (!monthlySalary || monthlySalary < 1000 || monthlySalary > 100000) {
      return res.status(400).json({ error: 'Monthly salary must be between $1,000 and $100,000' });
    }

    company.employees.monthlySalaryPerEmployee = monthlySalary;
    company.employees.totalPayroll = (company.employees.count || 0) * monthlySalary;
    await company.save();

    const gameState = await getGameState();
    await addAuditLog(company._id, req.user._id, 'salary_updated', { monthlySalary, totalPayroll: company.employees.totalPayroll }, gameState.tickNumber);
    await invalidateCompany(company._id);

    res.json({ employees: company.employees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/employees/departments', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || caller.role !== 'ceo') {
      return res.status(403).json({ error: 'Only the CEO can manage departments' });
    }

    const { departments } = req.body;
    if (!Array.isArray(departments)) {
      return res.status(400).json({ error: 'Departments must be an array' });
    }

    const totalDeptEmployees = departments.reduce((s, d) => s + (d.count || 0), 0);
    if (totalDeptEmployees > (company.employees.count || 0)) {
      return res.status(400).json({ error: 'Total department employees exceeds company employee count' });
    }

    company.employees.departments = departments.map((d) => ({
      name: d.name,
      count: d.count || 0,
      budget: (d.count || 0) * (company.employees.monthlySalaryPerEmployee || 5000),
    }));
    await company.save();

    await invalidateCompany(company._id);
    res.json({ departments: company.employees.departments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/invite/:invitationId/decline', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const invitation = company.invitations.id(req.params.invitationId);
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });
    if (invitation.userId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'This invitation is not for you' });
    }

    invitation.status = 'declined';
    await company.save();

    const gameState = await getGameState();
    await addAuditLog(company._id, req.user._id, 'invitation_declined', {}, gameState.tickNumber);

    await invalidateCompany(company._id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(400).json({ error: 'You are not a member of this company' });

    if (member.role === 'ceo' && company.members.filter((m) => m.role !== 'ceo').length === 0) {
      return res.status(400).json({ error: 'CEO cannot leave a company with no other members. Disband instead.' });
    }

    // Return departing member's shares to treasury
    company.shares.treasuryShares = (company.shares.treasuryShares || 0) + member.shares;

    if (member.role === 'ceo') {
      const nextDirector = company.members.find(
        (m) => m.role === 'director' && m.userId?.toString() !== req.user._id.toString(),
      );
      if (nextDirector) {
        nextDirector.role = 'ceo';
      } else {
        const nextMember = company.members.find((m) => m.userId?.toString() !== req.user._id.toString());
        if (nextMember) {
          nextMember.role = 'ceo';
        }
      }
    }

    company.members = company.members.filter((m) => m.userId?.toString() !== req.user._id.toString());
    await company.save();

    const user = await User.findById(req.user._id);
    user.companyId = null;
    await user.save();

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'member_left',
      { username: user.username, role: member.role },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);
    await invalidateUser(user._id);
    emitToCompany(company._id, SOCKET_EVENTS.COMPANY_MEMBER_LEFT, {
      companyId: company._id,
      userId: user._id,
      username: user.username,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || !hasPermission(caller, 'remove_members')) {
      return res.status(403).json({ error: 'You do not have permission to remove members' });
    }

    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot remove yourself. Use leave instead.' });
    }

    const targetMember = getMember(company, req.params.userId);
    if (!targetMember) return res.status(404).json({ error: 'Member not found' });
    if (targetMember.role === 'ceo') {
      return res.status(400).json({ error: 'Cannot remove the CEO' });
    }

    // Return removed member's shares to treasury
    company.shares.treasuryShares = (company.shares.treasuryShares || 0) + targetMember.shares;
    company.members = company.members.filter((m) => m.userId?.toString() !== req.params.userId);
    await company.save();

    const user = await User.findById(req.params.userId);
    if (user) {
      user.companyId = null;
      await user.save();
    }

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'member_removed',
      { targetUserId: req.params.userId, targetUsername: user?.username },
      gameState.tickNumber,
    );

    await enqueueNotification({
      userId: req.params.userId,
      type: 'system',
      title: 'Removed from Company',
      message: `You have been removed from "${company.name}"`,
      route: '/real-estate-companies',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });

    await invalidateCompany(company._id);
    await invalidateUser(req.params.userId);
    emitToCompany(company._id, SOCKET_EVENTS.COMPANY_MEMBER_LEFT, {
      companyId: company._id,
      userId: req.params.userId,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/members/:userId/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['director', 'officer', 'member', 'recruit'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be director, officer, member, or recruit.' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || caller.role !== 'ceo') {
      return res.status(403).json({ error: 'Only the CEO can change roles' });
    }

    const targetMember = getMember(company, req.params.userId);
    if (!targetMember) return res.status(404).json({ error: 'Member not found' });
    if (targetMember.role === 'ceo') {
      return res.status(400).json({ error: 'Cannot change CEO role' });
    }

    const oldRole = targetMember.role;
    const userId = req.params.userId;
    const newRole = role;
    targetMember.role = role;
    await company.save();

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'role_changed',
      { targetUserId: req.params.userId, newRole: role },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);
    const roleRank = { director: 4, officer: 3, member: 2, recruit: 1 };
    const isPromotion = roleRank[newRole] > roleRank[oldRole];
    const eventName = isPromotion ? SOCKET_EVENTS.COMPANY_MEMBER_PROMOTED : SOCKET_EVENTS.COMPANY_MEMBER_DEMOTED;
    emitToCompany(company._id, eventName, { companyId: company._id, userId, newRole, oldRole });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/treasury/deposit', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'You are not a member of this company' });

    const user = await User.findById(req.user._id);
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    user.balance -= amount;
    await user.save();

    const gameState = await getGameState();
    company.treasury.balance += amount;
    addTreasuryTransaction(
      company,
      {
        type: 'deposit',
        amount,
        userId: req.user._id,
        description: `${user.username} contributed $${amount.toLocaleString()}`,
      },
      gameState.tickNumber,
    );

    company.stats.totalTreasuryDeposits += amount;
    await company.save();

    await Transaction.create({
      buyerId: req.user._id,
      companyId: company._id,
      price: amount,
      type: 'buy',
    });

    await addAuditLog(
      company._id,
      req.user._id,
      'treasury_deposit',
      { amount, balance: company.treasury.balance },
      gameState.tickNumber,
    );

    await onCompanyTreasuryChanged(company._id, req.user._id);

    await processPlayerProgress(req.user._id, 'treasury_deposit');

    res.json({ treasury: company.treasury, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/treasury/withdraw', async (req, res) => {
  try {
    const { amount, targetUserId } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member || !hasPermission(member, 'manage_treasury')) {
      return res.status(403).json({ error: 'Only CEO or Directors can withdraw from treasury' });
    }

    if (amount > company.treasury.balance) {
      return res.status(400).json({ error: 'Insufficient treasury balance' });
    }

    const recipientId = targetUserId || req.user._id;
    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ error: 'Recipient user not found' });

    company.treasury.balance -= amount;
    const gameState = await getGameState();
    addTreasuryTransaction(
      company,
      {
        type: 'withdrawal',
        amount,
        userId: req.user._id,
        description: `Withdrawn $${amount.toLocaleString()} to ${recipient.username}`,
      },
      gameState.tickNumber,
    );

    await company.save();

    recipient.balance += amount;
    await recipient.save();

    await Transaction.create({
      sellerId: recipientId,
      companyId: company._id,
      price: amount,
      type: 'sell',
    });

    await addAuditLog(
      company._id,
      req.user._id,
      'treasury_withdrawal',
      { amount, recipient: recipient.username, balance: company.treasury.balance },
      gameState.tickNumber,
    );

    await onCompanyTreasuryChanged(company._id, req.user._id);

    res.json({ treasury: company.treasury, balance: recipient.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/treasury/transactions', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id)
      .populate('treasury.transactions.userId', 'username')
      .select('treasury.transactions');

    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'You are not a member of this company' });

    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const allTransactions = [...company.treasury.transactions].reverse();
    const start = (pageNum - 1) * limitNum;
    const transactions = allTransactions.slice(start, start + limitNum);

    res.json({
      transactions,
      total: allTransactions.length,
      page: pageNum,
      totalPages: Math.ceil(allTransactions.length / limitNum),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/properties/purchase', async (req, res) => {
  try {
    const { propertyId } = req.body;
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member || !hasPermission(member, 'manage_properties')) {
      return res.status(403).json({ error: 'Only CEO or Directors can purchase properties' });
    }

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.forSale) return res.status(400).json({ error: 'Property is not for sale' });

    const price = property.currentPrice;
    if (company.treasury.balance < price) {
      return res.status(400).json({
        error: `Insufficient treasury balance. Required: $${price.toLocaleString()}, Available: $${company.treasury.balance.toLocaleString()}`,
      });
    }

    if (property.ownerId) {
      const seller = await User.findById(property.ownerId);
      if (seller) {
        seller.balance += price;
        seller.ownedProperties = seller.ownedProperties.filter((p) => p.toString() !== propertyId);
        await seller.save();
      }
    }

    company.treasury.balance -= price;
    const gameState = await getGameState();
    addTreasuryTransaction(
      company,
      {
        type: 'property_purchase',
        amount: price,
        userId: req.user._id,
        description: `Purchased "${property.name}" for $${price.toLocaleString()}`,
      },
      gameState.tickNumber,
    );

    company.stats.propertiesOwned += 1;
    await grantCompanyXP(company, 'property_purchased', gameState.tickNumber, price);
    await company.save();

    property.ownerId = null;
    property.companyId = company._id;
    property.forSale = false;
    property.lastPurchasePrice = price;
    property.lastPurchaseDate = new Date();
    property.activeImprovement = undefined;

    if (!property.investmentHistory) property.investmentHistory = [];
    property.investmentHistory.push({
      type: 'purchase',
      amount: price,
      description: `Purchased by ${company.name}`,
    });

    await property.save();

    await Transaction.create({
      propertyId: property._id,
      companyId: company._id,
      price,
      type: 'buy',
    });

    await addAuditLog(
      company._id,
      req.user._id,
      'property_purchased',
      { propertyId, propertyName: property.name, price },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);

    await processPlayerProgress(req.user._id, 'company_property_purchase');

    res.json({ property, treasury: company.treasury });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/properties/:propertyId/sell', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member || !hasPermission(member, 'manage_properties')) {
      return res.status(403).json({ error: 'Only CEO or Directors can sell properties' });
    }

    const property = await Property.findById(req.params.propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.companyId || property.companyId.toString() !== company._id.toString()) {
      return res.status(400).json({ error: 'This property does not belong to the company' });
    }

    const salePrice = property.currentPrice;

    company.treasury.balance += salePrice;
    const saleGameState = await getGameState();
    addTreasuryTransaction(
      company,
      {
        type: 'property_sale',
        amount: salePrice,
        userId: req.user._id,
        description: `Sold "${property.name}" for $${salePrice.toLocaleString()}`,
      },
      saleGameState.tickNumber,
    );

    company.stats.propertiesOwned = Math.max(0, company.stats.propertiesOwned - 1);
    await grantCompanyXP(company, 'property_sold', saleGameState.tickNumber, salePrice);
    await company.save();

    property.companyId = null;
    property.ownerId = null;
    property.forSale = true;
    property.lastPurchasePrice = salePrice;
    property.lastPurchaseDate = new Date();
    await property.save();

    await Transaction.create({
      propertyId: property._id,
      companyId: company._id,
      price: salePrice,
      type: 'sell',
    });

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'property_sold',
      { propertyId: property._id, propertyName: property.name, price: salePrice },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);
    await invalidateUser(req.user._id);

    await processPlayerProgress(req.user._id, 'company_property_sell');

    res.json({ treasury: company.treasury });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/properties', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const data = await cacheGetOrSet(
      cacheKeys.company(req.params.id) + ':properties',
      async () => {
        const filter = { companyId: company._id };
        const [total, properties] = await Promise.all([
          Property.countDocuments(filter),
          Property.find(filter)
            .populate('cityId', 'name country')
            .select(
              'name type currentPrice rent cityId condition occupancy forSale upgradeLevel propertyRating activeImprovement improvements',
            )
            .sort({ currentPrice: -1 })
            .skip(skip)
            .limit(limitNum),
        ]);

        return { properties, total, page: pageNum, totalPages: Math.ceil(total / limitNum) };
      },
      cacheTTL.medium,
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/loans', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const loans = await cacheGetOrSet(
      cacheKeys.companyLoans(req.params.id),
      async () => {
        return Loan.find({ companyId: company._id })
          .sort({ createdAt: -1 })
          .select(
            'type principal remainingBalance interestRate ticksRemaining durationTicks paymentPerTick active missedPayments createdAt',
          );
      },
      cacheTTL.medium,
    );

    res.json(loans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/loans/:loanId/repay', async (req, res) => {
  try {
    const { amount } = req.body;
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member || !hasPermission(member, 'manage_treasury')) {
      return res.status(403).json({ error: 'Only CEO or Directors can repay loans' });
    }

    const loan = await Loan.findOne({ _id: req.params.loanId, companyId: company._id, active: true });
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    const repayAmount = Math.min(amount || loan.remainingBalance, loan.remainingBalance, company.treasury.balance);
    if (repayAmount <= 0) {
      return res.status(400).json({ error: 'Invalid repayment amount' });
    }

    company.treasury.balance -= repayAmount;
    const repayGameState = await getGameState();
    addTreasuryTransaction(
      company,
      {
        type: 'loan_payment',
        amount: repayAmount,
        userId: req.user._id,
        description: `Loan repayment of $${repayAmount.toLocaleString()}`,
      },
      repayGameState.tickNumber,
    );

    loan.remainingBalance -= repayAmount;
    company.stats.totalLoanBalance = Math.max(0, company.stats.totalLoanBalance - repayAmount);

    if (loan.remainingBalance <= 0) {
      loan.active = false;
      loan.remainingBalance = 0;
      loan.ticksRemaining = 0;
      company.stats.loansRepaid = (company.stats.loansRepaid || 0) + 1;
    }

    await grantCompanyXP(company, 'loan_repaid', repayGameState.tickNumber, repayAmount);

    await company.save();
    await loan.save();

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'loan_payment',
      { amount: repayAmount, loanId: loan._id },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);

    await processPlayerProgress(req.user._id, 'company_loan_repay');

    res.json({ loan, treasury: company.treasury });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/audit', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'You are not a member of this company' });

    const { page = '1', limit = '30', action } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 30));
    const skip = (pageNum - 1) * limitNum;

    const filter = { companyId: company._id };
    if (action) filter.action = action;

    const [total, logs] = await Promise.all([
      CompanyAuditLog.countDocuments(filter),
      CompanyAuditLog.find(filter).populate('userId', 'username').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    ]);

    res.json({ logs, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/stats', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const statsData = await cacheGetOrSet(
      cacheKeys.companyStats(req.params.id),
      async () => {
        const properties = await Property.find({ companyId: company._id });
        const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
        const totalRent = properties.reduce((sum, p) => sum + (p.rent || 0), 0);

        const activeLoans = await Loan.find({ companyId: company._id, active: true });
        const totalDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);
        const monthlyLoanPayments = activeLoans.reduce((sum, l) => sum + l.paymentPerTick, 0);

        const activeProjects = await import('../models/ConstructionProject.js').then((m) =>
          m.default.countDocuments({ companyId: company._id, status: 'under_construction' }),
        );

        const netWorth = company.treasury.balance + propertyValue - totalDebt;

        company.stats.netWorth = netWorth;
        company.stats.totalRentalIncome = totalRent;
        company.stats.activeProjects = activeProjects;
        await company.save();

        const xpForCurrentLevel = xpRequiredForLevel(company.level);
        const xpForNextLevel = company.xpToNextLevel || xpRequiredForNextLevel(company.level);
        const xpInCurrentLevel = Math.max(0, company.xp - xpForCurrentLevel);
        const xpNeededForLevel = Math.max(1, xpForNextLevel - xpForCurrentLevel);

        return {
          netWorth,
          treasuryBalance: company.treasury.balance,
          propertyValue,
          propertiesOwned: properties.length,
          totalRentalIncome: totalRent,
          activeProjects,
          totalDebt,
          monthlyLoanPayments,
          members: company.members.length,
          maxMembers: company.maxMembers,
          reputation: company.reputation,
          level: company.level,
          xp: company.xp,
          xpForCurrentLevel,
          xpToNextLevel: xpForNextLevel,
          xpInCurrentLevel,
          xpNeededForLevel,
          shareBreakdown: computeShares(company.members, company.shares?.totalShares, company.shares?.treasuryShares),
        };
      },
      cacheTTL.medium,
    );

    res.json(statsData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/apply', async (req, res) => {
  try {
    const { message } = req.body;
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const user = await User.findById(req.user._id);
    if (user.companyId) {
      return res.status(400).json({ error: 'You are already in a company. Leave your current company first.' });
    }

    if (company.members.length >= company.maxMembers) {
      return res.status(400).json({ error: 'Company is full' });
    }

    const existing = company.applications.find(
      (a) => a.userId?.toString() === req.user._id.toString() && a.status === 'pending',
    );
    if (existing) {
      return res.status(400).json({ error: 'You already have a pending application' });
    }

    company.applications.push({ userId: req.user._id, message: message || '' });
    await company.save();

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'application_submitted',
      { username: user.username, message: message || '' },
      gameState.tickNumber,
    );

    const appRoute = `/real-estate-companies/${company._id}`;
    await enqueueNotification({
      userId: company.founderId,
      type: 'system',
      title: 'New Application',
      message: `${user.username} applied to join "${company.name}"`,
      route: appRoute,
      tab: 'members',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });

    for (const m of company.members) {
      if (m.userId?.toString() !== company.founderId?.toString() && m.userId?.toString() !== req.user._id.toString()) {
        if (['ceo', 'director', 'officer'].includes(m.role)) {
          await enqueueNotification({
            userId: m.userId,
            type: 'system',
            title: 'New Application',
            message: `${user.username} applied to join "${company.name}"`,
            route: appRoute,
            tab: 'members',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        }
      }
    }

    await invalidateCompany(company._id);

    await processPlayerProgress(req.user._id, 'company_apply');

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/applications', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id)
      .populate('applications.userId', 'username avatar level')
      .populate('applications.reviewedBy', 'username');

    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && (!member || !hasPermission(member, 'manage_applications'))) {
      return res.status(403).json({ error: 'You do not have permission to view applications' });
    }

    res.json(company.applications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/applications/:appId/approve', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && (!caller || !hasPermission(caller, 'manage_applications'))) {
      return res.status(403).json({ error: 'You do not have permission to approve applications' });
    }

    if (company.members.length >= company.maxMembers) {
      return res.status(400).json({ error: 'Company is full' });
    }

    const application = company.applications.id(req.params.appId);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Application already processed' });
    }

    const applicant = await User.findById(application.userId);
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' });
    if (applicant.companyId) {
      return res.status(400).json({ error: 'Applicant is already in a company' });
    }

    application.status = 'approved';
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();

    const newMemberShares = Math.min(50, company.shares.treasuryShares || 0);
    company.shares.treasuryShares = Math.max(0, (company.shares.treasuryShares || 0) - newMemberShares);
    company.members.push({
      userId: applicant._id,
      role: 'recruit',
      shares: newMemberShares,
      invitedBy: req.user._id,
    });

    await company.save();
    applicant.companyId = company._id;
    await applicant.save();

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'application_approved',
      { username: applicant.username },
      gameState.tickNumber,
    );

    await enqueueNotification({
      userId: applicant._id,
      type: 'system',
      title: 'Application Approved',
      message: `Your application to join "${company.name}" has been approved!`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'members',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });

    await invalidateCompany(company._id);
    await invalidateUser(applicant._id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/applications/:appId/reject', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && (!caller || !hasPermission(caller, 'manage_applications'))) {
      return res.status(403).json({ error: 'You do not have permission to reject applications' });
    }

    const application = company.applications.id(req.params.appId);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Application already processed' });
    }

    application.status = 'rejected';
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await company.save();

    const applicant = await User.findById(application.userId);
    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'application_rejected',
      { username: applicant?.username || 'Unknown' },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/applications/:appId/cancel', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const application = company.applications.id(req.params.appId);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    if (application.userId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You can only cancel your own application' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Application already processed' });
    }

    company.applications.pull({ _id: application._id });
    await company.save();

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'application_cancelled',
      { username: req.user.username || 'Unknown' },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/loan-requests', async (req, res) => {
  try {
    const { principal, durationTicks, loanType = 'business' } = req.body;
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const isAdmin = req.user.role === 'admin';
    const isFounder = company.founderId?.toString() === req.user._id.toString();
    const member = getMember(company, req.user._id);
    if (!isAdmin && !isFounder && (!member || !hasPermission(member, 'initiate_investments'))) {
      return res.status(403).json({ error: 'Only CEO or Directors can request loans' });
    }

    if (!principal || principal <= 0 || principal > 100_000_000) {
      return res.status(400).json({ error: 'Invalid loan amount' });
    }
    if (!durationTicks || durationTicks <= 0 || durationTicks > 120) {
      return res.status(400).json({ error: 'Invalid loan duration' });
    }

    const pendingRequests = company.loanRequests.filter((lr) => lr.status === 'pending').length;
    if (pendingRequests >= MAX_PENDING_LOAN_REQUESTS) {
      return res.status(400).json({
        error: `Maximum ${MAX_PENDING_LOAN_REQUESTS} pending loan requests. Wait for existing requests to be resolved.`,
      });
    }

    const properties = await Property.find({ companyId: company._id });
    const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const companyNetWorth = company.treasury.balance + propertyValue;
    const activeLoans = await Loan.find({ companyId: company._id, active: true });
    const existingDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);

    const maxLoan = companyNetWorth * 0.8;
    if (existingDebt + principal > maxLoan) {
      return res.status(400).json({
        error: `Maximum company debt is $${Math.round(maxLoan).toLocaleString()} (80% of net worth). Current debt: $${existingDebt.toLocaleString()}`,
      });
    }

    if (principal > company.treasury.balance * 5) {
      return res.status(400).json({ error: 'Loan amount cannot exceed 5x the company treasury balance' });
    }

    const gameState = await getGameState();
    company.loanRequests.push({
      requestedBy: req.user._id,
      principal,
      durationTicks,
      loanType,
      createdTick: gameState.tickNumber,
    });
    await company.save();
    const loanRequest = company.loanRequests[company.loanRequests.length - 1];
    scheduleVoteExpiration(company._id, 'loanRequest', loanRequest._id, 8);

    await addAuditLog(
      company._id,
      req.user._id,
      'loan_requested',
      { principal, durationTicks, loanType },
      gameState.tickNumber,
    );

    for (const m of company.members) {
      if (m.userId?.toString() !== req.user._id.toString()) {
        await enqueueNotification({
          userId: m.userId,
          type: 'company_vote',
          title: 'Loan Vote Requested',
          message: `${member.role} requested a $${principal.toLocaleString()} loan. Vote to approve.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'loans',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }
    }

    await enqueueNotification({
      userId: req.user._id,
      type: 'company_vote',
      title: 'Loan Proposal Submitted',
      message: `You requested a $${principal.toLocaleString()} loan. Members will vote in the company loans tab.`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'loans',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });

    await onCompanyVote(company._id);

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/loan-requests', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id)
      .populate('loanRequests.requestedBy', 'username avatar')
      .populate('loanRequests.votes.userId', 'username')
      .populate('loanRequests.loanId', 'type principal remainingBalance active');

    if (!company) return res.status(404).json({ error: 'Company not found' });

    const isAdmin = req.user.role === 'admin';
    const isFounder = company.founderId?.toString() === req.user._id.toString();
    const member = getMember(company, req.user._id);
    if (!isAdmin && !isFounder && !member)
      return res.status(403).json({ error: 'You are not a member of this company' });

    res.json(company.loanRequests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/loan-requests/:reqId/vote', async (req, res) => {
  try {
    const { vote } = req.body;
    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'Vote must be "yes" or "no"' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller) return res.status(403).json({ error: 'You are not a member of this company' });

    const loanReq = company.loanRequests.id(req.params.reqId);
    if (!loanReq) return res.status(404).json({ error: 'Loan request not found' });
    if (loanReq.status !== 'pending') {
      return res.status(400).json({ error: 'Loan request is no longer pending' });
    }

    if (loanReq.requestedBy?.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot vote on your own loan request' });
    }

    const existingVote = loanReq.votes.find((v) => v.userId?.toString() === req.user._id.toString());
    if (existingVote) {
      return res.status(400).json({ error: 'You have already voted on this request' });
    }

    loanReq.votes.push({ userId: req.user._id, vote });

    company.stats.totalVotes = (company.stats.totalVotes || 0) + 1;

    const totalVoters = company.members.length - 1;
    const yesVotes = loanReq.votes.filter((v) => v.vote === 'yes').length;

    const gameState = await getGameState();
    await grantCompanyXP(company, 'vote_completed', gameState.tickNumber);
    await addAuditLog(
      company._id,
      req.user._id,
      'loan_vote_cast',
      { vote, loanRequestId: loanReq._id },
      gameState.tickNumber,
    );

    if (totalVoters > 0 && yesVotes / totalVoters >= LOAN_REQUEST_VOTE_THRESHOLD) {
      const activeLoanCount = await Loan.countDocuments({ companyId: company._id, active: true });
      if (activeLoanCount >= MAX_ACTIVE_LOANS) {
        loanReq.status = 'rejected';
        await company.save();
        return res.status(400).json({ error: `Maximum ${MAX_ACTIVE_LOANS} active loans. Cannot approve more.` });
      }
      loanReq.status = 'approved';
      await company.save();
      cancelDelayedJob(`vote:loanRequest:${loanReq._id}`);
      await addAuditLog(
        company._id,
        null,
        'loan_approved',
        { principal: loanReq.principal, durationTicks: loanReq.durationTicks },
        gameState.tickNumber,
      );
    } else {
      await company.save();
    }

    await onCompanyVoteCompleted(company._id);

    res.json({ success: true, loanRequest: loanReq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/loan-requests/:reqId/execute', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || caller.role !== 'ceo') {
      return res.status(403).json({ error: 'Only the CEO can execute approved loans' });
    }

    const loanReq = company.loanRequests.id(req.params.reqId);
    if (!loanReq) return res.status(404).json({ error: 'Loan request not found' });
    if (loanReq.status !== 'approved') {
      return res.status(400).json({ error: 'Loan request is not approved' });
    }

    const reputationDiscount = Math.min(0.02, company.reputation * 0.0001);
    const baseRate = 0.08 - reputationDiscount;
    const rate = Math.max(0.03, baseRate);
    const totalInterest = Math.round(loanReq.principal * rate);
    const payment = Math.ceil((loanReq.principal + totalInterest) / loanReq.durationTicks);

    const loan = await Loan.create({
      userId: req.user._id,
      companyId: company._id,
      type: loanReq.loanType,
      principal: loanReq.principal,
      remainingBalance: loanReq.principal + totalInterest,
      interestRate: rate,
      durationTicks: loanReq.durationTicks,
      ticksRemaining: loanReq.durationTicks,
      paymentPerTick: payment,
      active: true,
      creditScoreAtApply: 700,
    });

    company.treasury.balance += loanReq.principal;
    const gameState = await getGameState();
    addTreasuryTransaction(
      company,
      {
        type: 'loan_disbursement',
        amount: loanReq.principal,
        userId: req.user._id,
        description: `Loan of $${loanReq.principal.toLocaleString()} at ${(rate * 100).toFixed(1)}% (member approved)`,
      },
      gameState.tickNumber,
    );

    company.stats.totalLoanBalance += loanReq.principal + totalInterest;
    loanReq.status = 'executed';
    loanReq.executedBy = req.user._id;
    loanReq.executedAt = new Date();
    loanReq.loanId = loan._id;
    await company.save();
    cancelDelayedJob(`vote:loanRequest:${loanReq._id}`);
    await addAuditLog(
      company._id,
      req.user._id,
      'loan_taken',
      { principal: loanReq.principal, rate, durationTicks: loanReq.durationTicks, loanId: loan._id },
      gameState.tickNumber,
    );

    await onCompanyTreasuryChanged(company._id, req.user._id);

    res.json({ loan, treasury: company.treasury });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getCompanyLoanProducts(company, netWorth) {
  const reputation = company.reputation || 0;
  const level = company.level || 1;
  const products = [];

  const maxDebt = Math.round(netWorth * 0.8);
  const startupMax = Math.min(maxDebt, Math.round(500_000 * level));
  if (startupMax >= 10_000) {
    products.push({
      id: 'startup',
      name: 'Startup Business Loan',
      minPrincipal: 10_000,
      maxPrincipal: startupMax,
      durations: [6, 12, 24],
      baseInterestRate: 0.08,
      reputationRequirement: 0,
      description: 'Short-term capital for growing companies',
    });
  }

  const termMax = Math.min(maxDebt, Math.round(2_000_000 * level));
  if (termMax >= 100_000 && reputation >= 100) {
    products.push({
      id: 'business_term',
      name: 'Business Term Loan',
      minPrincipal: 100_000,
      maxPrincipal: termMax,
      durations: [12, 24, 36, 48],
      baseInterestRate: 0.06,
      reputationRequirement: 100,
      description: 'Medium-term financing for established companies',
    });
  }

  const corporateMax = Math.min(maxDebt, Math.round(10_000_000 * level));
  if (corporateMax >= 1_000_000 && reputation >= 500) {
    products.push({
      id: 'corporate_expansion',
      name: 'Corporate Expansion Loan',
      minPrincipal: 1_000_000,
      maxPrincipal: corporateMax,
      durations: [24, 36, 48, 60],
      baseInterestRate: 0.045,
      reputationRequirement: 500,
      description: 'Large-scale financing for major expansion',
    });
  }

  const lineMax = Math.min(maxDebt, Math.round(1_000_000 * level));
  if (lineMax >= 50_000 && reputation >= 250) {
    products.push({
      id: 'line_of_credit',
      name: 'Commercial Line of Credit',
      minPrincipal: 50_000,
      maxPrincipal: lineMax,
      durations: [6, 12],
      baseInterestRate: 0.065,
      reputationRequirement: 250,
      description: 'Revolving credit for operational flexibility',
    });
  }

  return products.map((p) => {
    const rate = Math.max(0.03, p.baseInterestRate - Math.min(0.02, reputation * 0.00005));
    return { ...p, interestRate: rate };
  });
}

function getCompanyLoanRate(product, company) {
  const reputation = company.reputation || 0;
  const discount = Math.min(0.02, reputation * 0.00005);
  return Math.max(0.03, product.baseInterestRate - discount);
}

router.get('/:id/loan-options', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const isAdmin = req.user.role === 'admin';
    const isFounder = company.founderId?.toString() === req.user._id.toString();
    const caller = getMember(company, req.user._id);
    if (!isAdmin && !isFounder && (!caller || caller.role !== 'ceo')) {
      return res.status(403).json({ error: 'Only the CEO can view company loan options' });
    }

    const properties = await Property.find({ companyId: company._id });
    const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const netWorth = company.treasury.balance + propertyValue;
    const products = getCompanyLoanProducts(company, netWorth);

    res.json({
      companyName: company.name,
      reputation: company.reputation,
      level: company.level,
      netWorth,
      maxDebt: Math.round(netWorth * 0.8),
      products,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/direct-loan', async (req, res) => {
  try {
    const { principal, durationTicks, productId, loanType = 'business' } = req.body;
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const isAdmin = req.user.role === 'admin';
    const isFounder = company.founderId?.toString() === req.user._id.toString();
    const caller = getMember(company, req.user._id);
    if (!isAdmin && !isFounder && (!caller || caller.role !== 'ceo')) {
      return res.status(403).json({ error: 'Only the CEO can take direct loans' });
    }

    if (!principal || principal <= 0 || principal > 100_000_000) {
      return res.status(400).json({ error: 'Invalid loan amount' });
    }
    if (!durationTicks || durationTicks <= 0 || durationTicks > 120) {
      return res.status(400).json({ error: 'Invalid loan duration' });
    }

    const properties = await Property.find({ companyId: company._id });
    const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const companyNetWorth = company.treasury.balance + propertyValue;
    const products = getCompanyLoanProducts(company, companyNetWorth);
    const product = products.find((p) => p.id === productId) || products[0];
    if (!product) {
      return res.status(400).json({ error: 'No loan product available for this company' });
    }

    if (principal < product.minPrincipal || principal > product.maxPrincipal) {
      return res.status(400).json({
        error: `Amount must be between $${product.minPrincipal.toLocaleString()} and $${product.maxPrincipal.toLocaleString()} for ${product.name}`,
      });
    }
    if (!product.durations.includes(Number(durationTicks))) {
      return res.status(400).json({ error: `Invalid duration for ${product.name}` });
    }

    const activeLoans = await Loan.find({ companyId: company._id, active: true });
    const existingDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);

    const maxLoan = companyNetWorth * 0.8;
    if (existingDebt + principal > maxLoan) {
      return res.status(400).json({
        error: `Maximum company debt is $${Math.round(maxLoan).toLocaleString()} (80% of net worth). Current debt: $${existingDebt.toLocaleString()}`,
      });
    }

    if (company.levelBenefits) {
      const maxLoanAmount = company.levelBenefits.maxLoanAmount;
      if (maxLoanAmount && principal > maxLoanAmount) {
        return res.status(400).json({ error: `Loan exceeds your level maximum of $${maxLoanAmount.toLocaleString()}` });
      }
    }

    const rate = getCompanyLoanRate(product, company);
    const totalInterest = Math.round(principal * rate);
    const payment = Math.ceil((principal + totalInterest) / durationTicks);

    const loan = await Loan.create({
      userId: req.user._id,
      companyId: company._id,
      type: loanType,
      principal,
      remainingBalance: principal + totalInterest,
      interestRate: rate,
      durationTicks,
      ticksRemaining: durationTicks,
      paymentPerTick: payment,
      active: true,
      creditScoreAtApply: 700,
    });

    company.treasury.balance += principal;
    const gameState = await getGameState();
    addTreasuryTransaction(
      company,
      {
        type: 'loan_disbursement',
        amount: principal,
        userId: req.user._id,
        description: `${product.name}: $${principal.toLocaleString()} at ${(rate * 100).toFixed(1)}% (${durationTicks} ticks)`,
      },
      gameState.tickNumber,
    );

    company.stats.totalLoanBalance += principal + totalInterest;
    await company.save();
    await addAuditLog(
      company._id,
      req.user._id,
      'loan_taken',
      { principal, rate, durationTicks, loanId: loan._id, product: product.name },
      gameState.tickNumber,
    );

    await onCompanyTreasuryChanged(company._id, req.user._id);

    await processPlayerProgress(req.user._id, 'company_loan_take');

    res.json({ loan, treasury: company.treasury, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/property-purchase-requests', async (req, res) => {
  try {
    const { propertyId } = req.body;
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const isAdmin = req.user.role === 'admin';
    const isFounder = company.founderId?.toString() === req.user._id.toString();
    const member = getMember(company, req.user._id);
    if (!isAdmin && !isFounder && (!member || member.role !== 'ceo')) {
      return res.status(403).json({ error: 'Only the CEO can propose property purchases' });
    }

    if (company.members.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 members for a vote' });
    }

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.forSale) return res.status(400).json({ error: 'Property is not for sale' });

    if (company.treasury.balance < property.currentPrice) {
      return res.status(400).json({ error: 'Insufficient treasury balance for this purchase' });
    }

    const existingPending = company.propertyPurchaseRequests.find(
      (r) => r.propertyId?.toString() === propertyId && r.status === 'pending',
    );
    if (existingPending) {
      return res.status(400).json({ error: 'A pending request already exists for this property' });
    }

    const gameState = await getGameState();
    company.propertyPurchaseRequests.push({
      requestedBy: req.user._id,
      propertyId,
      createdTick: gameState.tickNumber,
    });
    await company.save();
    const purchaseRequest = company.propertyPurchaseRequests[company.propertyPurchaseRequests.length - 1];
    scheduleVoteExpiration(company._id, 'propertyPurchase', purchaseRequest._id, 8);

    for (const m of company.members) {
      if (m.userId?.toString() !== req.user._id.toString()) {
        await enqueueNotification({
          userId: m.userId,
          type: 'company_vote',
          title: 'Property Purchase Vote',
          message: `${member.role} proposed purchasing "${property.name}" for $${property.currentPrice.toLocaleString()}. Vote to approve.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'properties',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }
    }

    await enqueueNotification({
      userId: req.user._id,
      type: 'company_vote',
      title: 'Property Purchase Proposal Submitted',
      message: `You proposed purchasing "${property.name}" for $${property.currentPrice.toLocaleString()}. Members will vote in the company properties tab.`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'properties',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });

    await addAuditLog(
      company._id,
      req.user._id,
      'property_purchase_requested',
      { propertyId, propertyName: property.name, price: property.currentPrice },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/property-purchase-requests', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id)
      .populate('propertyPurchaseRequests.requestedBy', 'username avatar')
      .populate('propertyPurchaseRequests.votes.userId', 'username')
      .populate('propertyPurchaseRequests.propertyId', 'name currentPrice cityId type rent');

    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'You are not a member of this company' });

    res.json(company.propertyPurchaseRequests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/property-purchase-requests/:reqId/vote', async (req, res) => {
  try {
    const { vote } = req.body;
    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'Vote must be "yes" or "no"' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller) return res.status(403).json({ error: 'You are not a member of this company' });

    const purchaseReq = company.propertyPurchaseRequests.id(req.params.reqId);
    if (!purchaseReq) return res.status(404).json({ error: 'Purchase request not found' });
    if (purchaseReq.status !== 'pending') {
      return res.status(400).json({ error: 'Request is no longer pending' });
    }

    if (purchaseReq.requestedBy?.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot vote on your own request' });
    }

    const existingVote = purchaseReq.votes.find((v) => v.userId?.toString() === req.user._id.toString());
    if (existingVote) {
      return res.status(400).json({ error: 'You have already voted on this request' });
    }

    purchaseReq.votes.push({ userId: req.user._id, vote });

    company.stats.totalVotes = (company.stats.totalVotes || 0) + 1;

    const totalVoters = company.members.length - 1;
    const yesVotes = purchaseReq.votes.filter((v) => v.vote === 'yes').length;

    const gameState = await getGameState();
    await grantCompanyXP(company, 'vote_completed', gameState.tickNumber);
    await addAuditLog(
      company._id,
      req.user._id,
      'property_purchase_vote_cast',
      { vote, propertyPurchaseRequestId: purchaseReq._id },
      gameState.tickNumber,
    );

    if (totalVoters > 0 && yesVotes / totalVoters >= LOAN_REQUEST_VOTE_THRESHOLD) {
      const property = await Property.findById(purchaseReq.propertyId);
      if (!property) {
        purchaseReq.status = 'rejected';
        await company.save();
        return res.status(400).json({ error: 'Property no longer available' });
      }

      if (company.treasury.balance < property.currentPrice) {
        purchaseReq.status = 'rejected';
        await company.save();
        return res.status(400).json({ error: 'Insufficient treasury balance' });
      }

      if (property.ownerId) {
        const seller = await User.findById(property.ownerId);
        if (seller) {
          seller.balance += property.currentPrice;
          seller.ownedProperties = seller.ownedProperties.filter(
            (p) => p.toString() !== purchaseReq.propertyId.toString(),
          );
          await seller.save();
        }
      }

      company.treasury.balance -= property.currentPrice;
      addTreasuryTransaction(
        company,
        {
          type: 'property_purchase',
          amount: property.currentPrice,
          userId: req.user._id,
          description: `Purchased "${property.name}" for $${property.currentPrice.toLocaleString()} (member approved)`,
        },
        gameState.tickNumber,
      );

      company.stats.propertiesOwned += 1;
      await grantCompanyXP(company, 'property_purchased', gameState.tickNumber, property.currentPrice);

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
        description: `Purchased by ${company.name} (member vote)`,
      });

      await property.save();

      await Transaction.create({
        propertyId: property._id,
        companyId: company._id,
        price: property.currentPrice,
        type: 'buy',
      });

      purchaseReq.status = 'executed';
      purchaseReq.executedBy = req.user._id;
      purchaseReq.executedAt = new Date();

      await addAuditLog(
        company._id,
        null,
        'property_purchased',
        { propertyId: property._id, propertyName: property.name, price: property.currentPrice },
        gameState.tickNumber,
      );
    }

    await company.save();
    await onCompanyVoteCompleted(company._id);
    res.json({ success: true, purchaseRequest: purchaseReq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/development-requests', async (req, res) => {
  try {
    const { propertyId, actionType, actionData } = req.body;
    if (!propertyId || !actionType || !actionData) {
      return res.status(400).json({ error: 'propertyId, actionType, and actionData are required' });
    }
    if (!['upgrade', 'improvement', 'construction'].includes(actionType)) {
      return res.status(400).json({ error: 'Invalid actionType' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const isAdmin = req.user.role === 'admin';
    const member = getMember(company, req.user._id);
    if (!isAdmin && (!member || !hasPermission(member, 'manage_properties'))) {
      return res.status(403).json({ error: 'Not authorized to propose development' });
    }

    if (company.members.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 members for a vote' });
    }

    const property = await Property.findById(propertyId).populate('cityId');
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.companyId || property.companyId.toString() !== company._id.toString()) {
      return res.status(400).json({ error: 'Company does not own this property' });
    }

    let estimatedCost = 0;
    let estimatedValueIncrease = 0;
    let estimatedRentIncrease = 0;
    let actionLabel = '';

    const gameState = await getGameState();
    const currentPeriod = gameState.tickNumber;

    if (actionType === 'upgrade') {
      const { upgradeType } = actionData;
      const upgradeDef = UPGRADE_TYPES[upgradeType];
      if (!upgradeDef) return res.status(400).json({ error: 'Invalid upgrade type' });
      if (property.type === 'land') {
        return res.status(400).json({ error: 'Only developed properties can be upgraded' });
      }

      const upgradeCounts = countUpgradesByType(property.upgrades || []);
      const currentLevel = upgradeCounts[upgradeType] || 0;
      estimatedCost = calculateUpgradeCost(upgradeType, property.currentPrice, currentLevel);
      const effects = calculateUpgradeEffects(upgradeType, currentLevel);
      estimatedValueIncrease = Math.round(property.currentPrice * effects.valueBoost);
      estimatedRentIncrease = Math.round((property.rent || 0) * effects.rentBoost);
      actionLabel = `Upgrade: ${upgradeDef.name} (Level ${currentLevel + 1})`;
    } else if (actionType === 'improvement') {
      const { improvementId } = actionData;
      const improvement = IMPROVEMENT_PROJECTS[improvementId];
      if (!improvement) return res.status(400).json({ error: 'Invalid improvement type' });
      if (property.type === 'land') {
        return res.status(400).json({ error: 'Only developed properties can be improved' });
      }
      const completedIds = (property.improvements || []).map((i) => i.improvementId);
      if (completedIds.includes(improvementId)) {
        return res.status(400).json({ error: 'This improvement has already been completed' });
      }
      if (property.activeImprovement && property.activeImprovement.improvementId) {
        return res.status(400).json({ error: 'An improvement is already in progress' });
      }

      estimatedCost = calculateImprovementCost(improvement, property.currentPrice);
      estimatedValueIncrease = Math.round(property.currentPrice * improvement.valueBonus);
      estimatedRentIncrease = Math.round((property.rent || 0) * improvement.rentBonus);
      actionLabel = `Improvement: ${improvement.name}`;
    } else if (actionType === 'construction') {
      const { projectType } = actionData;
      if (property.type !== 'land') {
        return res.status(400).json({ error: 'Construction requires land' });
      }
      if (property.developmentLevel > 0) {
        return res.status(400).json({ error: 'Land already has a building' });
      }

      const allProjects = getAllProjects();
      const project = allProjects.find((p) => p.id === projectType);
      if (!project) return res.status(400).json({ error: 'Invalid project type' });

      if (property.size && property.size < project.minLandSize) {
        return res.status(400).json({ error: `Land too small. Minimum: ${project.minLandSize} sq ft` });
      }

      estimatedCost = calculateProjectCost(project, property.cityId, property.location);
      estimatedValueIncrease = estimatedCost;
      estimatedRentIncrease =
        calculateUnitRent(project, property.cityId, property.location, 0) * project.unitsGenerated * 0.85;
      actionLabel = `Construction: ${project.name}`;
    }

    if (company.treasury.balance < estimatedCost) {
      return res.status(400).json({
        error: `Insufficient treasury. Required: $${estimatedCost.toLocaleString()}, Balance: $${company.treasury.balance.toLocaleString()}`,
      });
    }

    const existingPending = company.developmentRequests.find(
      (r) => r.propertyId?.toString() === propertyId && r.actionType === actionType && r.status === 'pending',
    );
    if (existingPending) {
      return res.status(400).json({ error: 'A pending development request already exists for this action' });
    }

    company.developmentRequests.push({
      requestedBy: req.user._id,
      propertyId,
      actionType,
      actionData,
      estimatedCost,
      estimatedValueIncrease,
      estimatedRentIncrease,
      createdTick: currentPeriod,
    });
    await company.save();
    const devRequest = company.developmentRequests[company.developmentRequests.length - 1];
    scheduleVoteExpiration(company._id, 'developmentRequest', devRequest._id, 8);

    for (const m of company.members) {
      if (m.userId?.toString() !== req.user._id.toString()) {
        await enqueueNotification({
          userId: m.userId,
          type: 'company_vote',
          title: 'Development Vote',
          message: `${member.role} proposed "${actionLabel}" on "${property.name}" ($${estimatedCost.toLocaleString()}). Vote to approve.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'properties',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }
    }

    await enqueueNotification({
      userId: req.user._id,
      type: 'company_vote',
      title: 'Development Proposal Submitted',
      message: `You proposed "${actionLabel}" on "${property.name}" ($${estimatedCost.toLocaleString()}). Members will vote.`,
      route: `/real-estate-companies/${company._id}`,
      tab: 'properties',
      entityType: 'company',
      entityId: company._id,
      relatedId: company._id,
      global: false,
    });

    await addAuditLog(
      company._id,
      req.user._id,
      'development_requested',
      { propertyId, propertyId_name: property.name, actionType, actionData, estimatedCost, actionLabel },
      currentPeriod,
    );

    await onCompanyVote(company._id);

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/development-requests', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id)
      .populate('developmentRequests.requestedBy', 'username avatar')
      .populate('developmentRequests.votes.userId', 'username')
      .populate('developmentRequests.propertyId', 'name currentPrice cityId type rent')
      .populate(
        'developmentRequests.constructionProjectId',
        'progress status constructionPeriods startPeriod completionPeriod delayTicks projectName',
      );

    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'You are not a member of this company' });

    res.json(company.developmentRequests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/development-requests/:reqId/vote', async (req, res) => {
  try {
    const { vote } = req.body;
    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'Vote must be "yes" or "no"' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller) return res.status(403).json({ error: 'You are not a member of this company' });

    const devReq = company.developmentRequests.id(req.params.reqId);
    if (!devReq) return res.status(404).json({ error: 'Development request not found' });
    if (devReq.status !== 'pending') {
      return res.status(400).json({ error: 'Request is no longer pending' });
    }

    if (devReq.requestedBy?.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot vote on your own request' });
    }

    const existingVote = devReq.votes.find((v) => v.userId?.toString() === req.user._id.toString());
    if (existingVote) {
      return res.status(400).json({ error: 'You have already voted on this request' });
    }

    devReq.votes.push({ userId: req.user._id, vote });

    company.stats.totalVotes = (company.stats.totalVotes || 0) + 1;

    const totalVoters = company.members.length - 1;
    const yesVotes = devReq.votes.filter((v) => v.vote === 'yes').length;

    const gameState = await getGameState();
    await grantCompanyXP(company, 'vote_completed', gameState.tickNumber);
    await addAuditLog(
      company._id,
      req.user._id,
      'development_vote_cast',
      { vote, developmentRequestId: devReq._id },
      gameState.tickNumber,
    );

    if (totalVoters > 0 && yesVotes / totalVoters >= LOAN_REQUEST_VOTE_THRESHOLD) {
      const property = await Property.findById(devReq.propertyId).populate('cityId');
      if (!property) {
        devReq.status = 'rejected';
        devReq.rejectionReason = 'Property no longer exists';
        await company.save();
        return res.status(400).json({ error: 'Property no longer available' });
      }

      if (company.treasury.balance < devReq.estimatedCost) {
        devReq.status = 'rejected';
        devReq.rejectionReason = 'Insufficient treasury';
        await company.save();
        return res.status(400).json({ error: 'Insufficient treasury balance' });
      }

      const currentPeriod = gameState.tickNumber;

      try {
        if (devReq.actionType === 'upgrade') {
          const { upgradeType } = devReq.actionData;
          const upgradeDef = UPGRADE_TYPES[upgradeType];
          const upgradeCounts = countUpgradesByType(property.upgrades || []);
          const currentLevel = upgradeCounts[upgradeType] || 0;
          const cost = calculateUpgradeCost(upgradeType, property.currentPrice, currentLevel);
          const effects = calculateUpgradeEffects(upgradeType, currentLevel);

          if (effects.valueBoost) {
            property.currentPrice = Math.round(property.currentPrice * (1 + effects.valueBoost));
            property.basePrice = Math.round(property.basePrice * (1 + effects.valueBoost * 0.5));
          }
          if (effects.rentBoost) {
            const oldRent = property.rent || 0;
            property.rent = Math.round(oldRent * (1 + effects.rentBoost));
            if (property.units && property.units.length > 0) {
              for (const unit of property.units) {
                unit.rentPrice = Math.round(unit.rentPrice * (1 + effects.rentBoost));
              }
            }
          }
          if (effects.conditionBoost) {
            property.condition = Math.min(100, (property.condition || 100) + effects.conditionBoost);
          }
          if (effects.unitBoost && property.units) {
            const newUnitsCount = Math.max(1, Math.round(property.units.length * effects.unitBoost));
            for (let i = 0; i < newUnitsCount; i++) {
              const lastUnit = property.units[property.units.length - 1] || { unitNumber: 0 };
              const avgRent = property.units.reduce((s, u) => s + u.rentPrice, 0) / property.units.length;
              property.units.push({
                unitNumber: lastUnit.unitNumber + 1,
                type: property.units[0]?.type || 'apartment',
                rentPrice: Math.round(avgRent),
                occupied: false,
              });
            }
          }

          if (!property.upgrades) property.upgrades = [];
          property.upgrades.push({ name: upgradeType, appliedAt: currentPeriod, effect: effects });
          property.lastUpgrade = upgradeType;
          property.upgradeLevel = (property.upgradeLevel || 0) + 1;

          if (!property.investmentHistory) property.investmentHistory = [];
          property.investmentHistory.push({
            type: 'upgrade',
            amount: cost,
            tick: currentPeriod,
            description: `${upgradeDef.name} (Level ${currentLevel + 1}) — Company Vote`,
          });

          company.treasury.balance -= cost;
          addTreasuryTransaction(
            company,
            {
              type: 'development',
              amount: cost,
              userId: req.user._id,
              description: `Upgrade: ${upgradeDef.name} on "${property.name}" — $${cost.toLocaleString()} (member approved)`,
            },
            currentPeriod,
          );
        } else if (devReq.actionType === 'improvement') {
          const { improvementId } = devReq.actionData;
          const improvement = IMPROVEMENT_PROJECTS[improvementId];
          const cost = calculateImprovementCost(improvement, property.currentPrice);

          property.activeImprovement = {
            improvementId: improvement.id,
            name: improvement.name,
            startedAt: new Date(),
            startPeriod: currentPeriod,
            completionPeriod: currentPeriod + improvement.constructionPeriods,
            progress: 0,
          };

          if (!property.investmentHistory) property.investmentHistory = [];
          property.investmentHistory.push({
            type: 'improvement',
            amount: cost,
            tick: currentPeriod,
            description: `${improvement.name} — Company Vote`,
          });

          company.treasury.balance -= cost;
          addTreasuryTransaction(
            company,
            {
              type: 'development',
              amount: cost,
              userId: req.user._id,
              description: `Improvement: ${improvement.name} on "${property.name}" — $${cost.toLocaleString()} (member approved)`,
            },
            currentPeriod,
          );
        } else if (devReq.actionType === 'construction') {
          const { projectType } = devReq.actionData;
          const allProjects = getAllProjects();
          const project = allProjects.find((p) => p.id === projectType);
          const totalCost = calculateProjectCost(project, property.cityId, property.location);

          const constructionProject = await ConstructionProject.create({
            ownerId: devReq.requestedBy,
            companyId: company._id,
            landId: property._id,
            cityId: property.cityId?._id || property.cityId,
            projectType: project.id,
            projectName: project.name,
            category: project.category,
            totalCost,
            investedAmount: totalCost,
            progress: 0,
            constructionPeriods: project.constructionPeriods,
            startPeriod: currentPeriod,
            completionPeriod: currentPeriod + project.constructionPeriods,
            status: 'under_construction',
          });

          property.developmentLevel = 1;
          property.forSale = false;

          company.treasury.balance -= totalCost;
          addTreasuryTransaction(
            company,
            {
              type: 'development',
              amount: totalCost,
              userId: req.user._id,
              description: `Construction: ${project.name} on "${property.name}" — $${totalCost.toLocaleString()} (member approved)`,
            },
            currentPeriod,
          );

          devReq.constructionProjectId = constructionProject._id;
        }

        await property.save();

        await Transaction.create({
          companyId: company._id,
          propertyId: property._id,
          price: devReq.estimatedCost,
          type: 'development',
        });

        devReq.status = 'executed';
        devReq.executedBy = req.user._id;
        devReq.executedAt = new Date();

        company.stats.totalDevelopments = (company.stats.totalDevelopments || 0) + 1;
        await grantCompanyXP(company, 'development_executed', currentPeriod, devReq.estimatedCost);
        if (devReq.actionType === 'construction') {
          await grantCompanyXP(company, 'construction_completed', currentPeriod, devReq.estimatedCost);
        }

        await addAuditLog(
          company._id,
          req.user._id,
          'development_executed',
          {
            propertyId: property._id,
            propertyName: property.name,
            actionType: devReq.actionType,
            actionData: devReq.actionData,
            cost: devReq.estimatedCost,
          },
          currentPeriod,
        );

        for (const m of company.members) {
          await enqueueNotification({
            userId: m.userId,
            type: 'company_vote',
            title: 'Development Approved & Executed',
            message: `Development on "${property.name}" was approved and executed ($${devReq.estimatedCost.toLocaleString()}).`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'properties',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        }
      } catch (execErr) {
        devReq.status = 'failed';
        devReq.rejectionReason = execErr.message;
        await addAuditLog(
          company._id,
          req.user._id,
          'development_failed',
          { propertyId: devReq.propertyId, actionType: devReq.actionType, error: execErr.message },
          currentPeriod,
        );
      }
    }

    await company.save();
    cancelDelayedJob(`vote:developmentRequest:${devReq._id}`);
    await onCompanyVoteCompleted(company._id);
    res.json({ success: true, developmentRequest: devReq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/investments/products', authenticate, async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const products = await getAvailableInvestments(company.level);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/investments', authenticate, async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const investments = await CompanyInvestment.find({
      companyId: company._id,
    }).sort({ createdAt: -1 });

    const gameState = await getGameState();
    const currentTick = gameState?.tickNumber || 0;

    res.json(investments.map((inv) => ({ ...inv.toJSON(), currentTick })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/investments/performance', authenticate, async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const totalInvested = await CompanyInvestment.aggregate([
      { $match: { companyId: company._id } },
      { $group: { _id: null, total: { $sum: '$principal' } } },
    ]);

    const currentValue = await CompanyInvestment.aggregate([
      { $match: { companyId: company._id } },
      { $group: { _id: null, total: { $sum: '$currentValue' } } },
    ]);

    const maturedProfit = await CompanyInvestment.aggregate([
      { $match: { companyId: company._id, status: 'matured' } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$currentValue', '$principal'] } } } },
    ]);

    res.json({
      totalInvested: totalInvested[0]?.total || 0,
      currentValue: currentValue[0]?.total || 0,
      unrealizedProfit: (currentValue[0]?.total || 0) - (totalInvested[0]?.total || 0),
      maturedProfit: maturedProfit[0]?.total || 0,
      activeCount: await CompanyInvestment.countDocuments({ companyId: company._id, status: 'active' }),
      maturedCount: await CompanyInvestment.countDocuments({ companyId: company._id, status: 'matured' }),
      proposedCount: await CompanyInvestment.countDocuments({ companyId: company._id, status: 'proposed' }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/investments', authenticate, async (req, res) => {
  try {
    const { investmentType, opportunityId, amount } = req.body;
    if (!investmentType || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || !hasPermission(caller, 'initiate_investments')) {
      return res.status(403).json({ error: 'No permission' });
    }

    let product;
    let opportunity = null;
    if (opportunityId) {
      opportunity = await InvestmentOpportunity.findById(opportunityId);
      if (!opportunity || !opportunity.active) {
        return res.status(400).json({ error: 'Opportunity not available' });
      }
      product = {
        type: opportunity.type,
        name: opportunity.name,
        description: opportunity.description,
        annualReturnRate: opportunity.currentAnnualReturnRate,
        baseAnnualReturnRate: opportunity.baseAnnualReturnRate,
        durationTicks: opportunity.durationTicks,
        risk: opportunity.risk,
        minInvestment: opportunity.minInvestment,
        maxInvestment: opportunity.maxInvestment,
        availableCapital: opportunity.availableCapital,
        economyState: opportunity.economyState,
        globalEconomicIndex: opportunity.globalEconomicIndex,
      };
    } else {
      const typeConfig = getInvestmentTypeConfig(investmentType);
      if (!typeConfig) return res.status(400).json({ error: 'Invalid investment type' });
      product = {
        type: typeConfig.type,
        name: typeConfig.name,
        description: typeConfig.description,
        annualReturnRate: typeConfig.baseReturn,
        baseAnnualReturnRate: typeConfig.baseReturn,
        durationTicks: typeConfig.minDuration,
        risk: typeConfig.risk,
        minInvestment: typeConfig.minInvestment,
        maxInvestment: typeConfig.maxInvestment,
        availableCapital: typeConfig.availableCapital,
        economyState: 'stable',
        globalEconomicIndex: 1,
      };
    }

    if (amount < product.minInvestment) {
      return res.status(400).json({ error: `Minimum investment: $${product.minInvestment.toLocaleString()}` });
    }
    if (amount > product.maxInvestment) {
      return res.status(400).json({ error: `Maximum investment: $${product.maxInvestment.toLocaleString()}` });
    }
    if (company.treasury.balance < amount) {
      return res.status(400).json({ error: 'Insufficient treasury balance' });
    }

    const benefits = getCompanyLevelBenefits(company.level);
    if (amount > benefits.maxInvestmentAmount) {
      return res
        .status(400)
        .json({ error: `Maximum investment at your level: $${benefits.maxInvestmentAmount.toLocaleString()}` });
    }

    const gameState = await getGameState();
    const isLarge =
      amount >= LARGE_INVESTMENT_THRESHOLD || amount >= company.treasury.balance * LARGE_INVESTMENT_TREASURY_PCT;

    if (isLarge) {
      const investment = await CompanyInvestment.create({
        companyId: company._id,
        investmentOpportunityId: opportunity?._id || null,
        investmentType: product.type,
        name: product.name,
        description: product.description,
        principal: amount,
        currentValue: amount,
        annualReturnRate: product.annualReturnRate,
        baseAnnualReturnRate: product.baseAnnualReturnRate,
        durationTicks: product.durationTicks,
        risk: product.risk,
        minInvestment: product.minInvestment,
        economyStateAtStart: product.economyState,
        globalEconomicIndex: product.globalEconomicIndex,
        requiresVote: true,
        proposal: {
          proposedBy: req.user._id,
          status: 'pending',
          votes: [],
          proposedTick: gameState.tickNumber,
          expiresAtTick: gameState.tickNumber + INVESTMENT_PROPOSAL_EXPIRE_TICKS,
        },
        startTick: gameState.tickNumber,
        maturityTick: gameState.tickNumber + product.durationTicks,
        status: 'proposed',
      });

      await addAuditLog(
        company._id,
        req.user._id,
        'investment_proposed',
        { investmentId: investment._id, investmentType: product.type, name: product.name, principal: amount },
        gameState.tickNumber,
      );

      const memberUserIds = company.members.map((m) => m.userId);
      for (const userId of memberUserIds) {
        if (userId.toString() === req.user._id.toString()) continue;
        await enqueueNotification({
          userId,
          type: 'company_vote',
          title: 'Investment Vote',
          message: `${caller.role} proposed investment: ${product.name} — $${amount.toLocaleString()}. Vote to approve or reject.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'investments',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      scheduleVoteExpiration(company._id, 'investment', investment._id, 8);
      return res.json({ investment, status: 'proposed', treasury: company.treasury });
    }

    company.treasury.balance -= amount;
    addTreasuryTransaction(
      company,
      {
        type: 'investment_withdrawal',
        amount,
        description: `Investment in ${product.name}`,
      },
      gameState.tickNumber,
    );

    await company.save();

    const investment = await CompanyInvestment.create({
      companyId: company._id,
      investmentOpportunityId: opportunity?._id || null,
      investmentType: product.type,
      name: product.name,
      description: product.description,
      principal: amount,
      currentValue: amount,
      annualReturnRate: product.annualReturnRate,
      baseAnnualReturnRate: product.baseAnnualReturnRate,
      durationTicks: product.durationTicks,
      risk: product.risk,
      minInvestment: product.minInvestment,
      economyStateAtStart: product.economyState,
      globalEconomicIndex: product.globalEconomicIndex,
      startTick: gameState.tickNumber,
      maturityTick: gameState.tickNumber + product.durationTicks,
      status: 'active',
    });

    await addAuditLog(
      company._id,
      req.user._id,
      'investment_created',
      { investmentType: product.type, name: product.name, principal: amount, durationTicks: product.durationTicks },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);

    await processPlayerProgress(req.user._id, 'investment_create');

    res.json({ investment, treasury: company.treasury });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/investments/:invId/vote', authenticate, async (req, res) => {
  try {
    const { vote } = req.body;
    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'Invalid vote' });
    }

    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller) return res.status(403).json({ error: 'Not a member' });

    const investment = await CompanyInvestment.findOne({
      _id: req.params.invId,
      companyId: company._id,
      status: 'proposed',
    });
    if (!investment) return res.status(404).json({ error: 'Investment proposal not found' });

    const proposal = investment.proposal;
    if (proposal.proposedBy?.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Proposer cannot vote' });
    }

    const existingVote = proposal.votes.find((v) => v.userId?.toString() === req.user._id.toString());
    if (existingVote) {
      existingVote.vote = vote;
      existingVote.votedAt = new Date();
    } else {
      proposal.votes.push({ userId: req.user._id, vote, votedAt: new Date() });
    }

    await investment.save();

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'investment_vote_cast',
      { investmentId: investment._id, vote },
      gameState.tickNumber,
    );

    const totalVoters = Math.max(1, company.members.length - 1);
    const yesVotes = proposal.votes.filter((v) => v.vote === 'yes').length;
    const noVotes = proposal.votes.filter((v) => v.vote === 'no').length;

    if (yesVotes / totalVoters >= 0.5 && noVotes === 0) {
      investment.status = 'active';
      investment.proposal.status = 'approved';
      investment.proposal.resolvedAt = new Date();
      investment.startTick = gameState.tickNumber;
      investment.maturityTick = gameState.tickNumber + investment.durationTicks;
      investment.globalEconomicIndex = 1.0;

      company.treasury.balance -= investment.principal;
      addTreasuryTransaction(
        company,
        {
          type: 'investment_withdrawal',
          amount: investment.principal,
          description: `Investment approved: ${investment.name}`,
        },
        gameState.tickNumber,
      );

      await company.save();
      await investment.save();
      cancelDelayedJob(`vote:investment:${investment._id}`);
      const { scheduleInvestmentMaturity } = await import('../utils/delayedJobs.js');
      scheduleInvestmentMaturity(investment._id, company._id, investment.durationTicks);

      await CompanyAuditLog.create({
        companyId: company._id,
        userId: req.user._id,
        action: 'investment_approved',
        details: { investmentId: investment._id },
        tick: gameState.tickNumber,
      });

      return res.json({ investment, treasury: company.treasury });
    }

    await onCompanyVoteCompleted(company._id);

    res.json({ investment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/investments/:invId/cancel', authenticate, async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || !hasPermission(caller, 'initiate_investments')) {
      return res.status(403).json({ error: 'No permission' });
    }

    const investment = await CompanyInvestment.findOne({
      _id: req.params.invId,
      companyId: company._id,
      status: 'proposed',
    });
    if (!investment) return res.status(404).json({ error: 'Investment proposal not found' });

    investment.status = 'rejected';
    investment.proposal.status = 'rejected';
    investment.proposal.resolvedAt = new Date();
    await investment.save();

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'investment_cancelled',
      { investmentId: investment._id, name: investment.name },
      gameState.tickNumber,
    );

    await invalidateCompany(company._id);

    res.json({ investment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/ipo', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || caller.role !== 'ceo') {
      return res.status(403).json({ error: 'Only the CEO can initiate an IPO' });
    }

    if (company.ipo?.listed) {
      return res.status(400).json({ error: 'Company is already publicly listed' });
    }

    if (company.level < MIN_IPO_LEVEL) {
      return res.status(400).json({ error: `Company must be at least Level ${MIN_IPO_LEVEL} for IPO` });
    }

    if (company.members.length < MIN_IPO_MEMBERS) {
      return res.status(400).json({ error: `Company needs at least ${MIN_IPO_MEMBERS} members for IPO` });
    }

    if (company.treasury.balance < IPO_FEE) {
      return res.status(400).json({ error: `IPO costs $${IPO_FEE.toLocaleString()}. Insufficient treasury balance.` });
    }

    const properties = await Property.find({ companyId: company._id });
    const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const companyNetWorth = company.treasury.balance + propertyValue;
    if (companyNetWorth < MIN_IPO_NET_WORTH) {
      return res
        .status(400)
        .json({ error: `Company net worth must be at least $${MIN_IPO_NET_WORTH.toLocaleString()} for IPO` });
    }

    if (properties.length < IPO_MIN_PROPERTIES) {
      return res.status(400).json({ error: `Company must own at least ${IPO_MIN_PROPERTIES} properties for IPO` });
    }

    const activeLoans = await Loan.find({ companyId: company._id, active: true });
    const totalDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);
    const debtRatio = companyNetWorth > 0 ? totalDebt / companyNetWorth : 1;
    if (debtRatio > IPO_MAX_DEBT_RATIO) {
      return res.status(400).json({
        error: `Company debt ratio (${(debtRatio * 100).toFixed(0)}%) exceeds maximum (${(IPO_MAX_DEBT_RATIO * 100).toFixed(0)}%) for IPO`,
      });
    }

    const annualRent = company.stats.totalRentalIncome || 0;
    const valuation = Math.round(propertyValue * 1.5 + company.treasury.balance + annualRent * 2 - totalDebt);
    const targetPrice = Math.max(1, Math.round(company.reputation * 0.5 + company.level * 0.2 + 2));
    const sharesOutstanding = Math.round(valuation / targetPrice / 1000) * 1000;
    const sharePrice = sharesOutstanding > 0 ? Math.round((valuation / sharesOutstanding) * 100) / 100 : 1;
    const marketCap = Math.round(sharePrice * sharesOutstanding);

    company.treasury.balance -= IPO_FEE;
    company.treasury.transactions.push({
      type: 'development',
      amount: -IPO_FEE,
      description: 'IPO listing fee',
      tick: await getGameState().then((gs) => gs.tickNumber),
    });

    const cities = await City.find().lean();
    if (cities.length === 0) {
      return res.status(400).json({ error: 'No cities exist on the world map. Cannot create public company without a headquarters city.' });
    }
    const hqCity = cities[0];

    const tickerBase = company.name
      .replace(/[^A-Z0-9]/gi, '')
      .slice(0, 4)
      .toUpperCase();
    let ticker = tickerBase;
    let suffix = 1;
    while (await Company.findOne({ ticker })) {
      ticker = tickerBase + suffix;
      suffix++;
    }

    const stockCompany = await Company.create({
      name: company.name,
      ticker,
      industry: 'finance',
      size: 'medium',
      revenue: Math.round(annualRent * 12) || 100000,
      employees: company.employees?.count || company.members.length * 10,
      hqCityId: hqCity._id,
      offices: [{ cityId: hqCity._id, type: 'headquarters', employees: company.employees?.count || company.members.length * 4, openedTick: 0 }],
      sharePrice,
      previousSharePrice: sharePrice,
      marketCap,
      sharesOutstanding,
      volatility: 0.03,
      performance: [],
      expansionHistory: [],
      active: true,
      foundedTick: company.foundedTick || 0,
      description: `${company.name} — Real Estate Investment Company`,
      totalReturn: 0,
      dayChange: 0,
      dayChangePercent: 0,
      high52Week: sharePrice,
      low52Week: sharePrice,
      realEstateCompanyId: company._id,
      isIPO: true,
      ipoPrice: sharePrice,
    });

    // IPO Ownership Distribution: CEO 51% locked, Members 19%, Public 30%
    const ceoLockedShares = Math.ceil(sharesOutstanding * 0.51);
    const memberPoolShares = Math.floor(sharesOutstanding * 0.19);
    const publicShares = sharesOutstanding - ceoLockedShares - memberPoolShares;

    await StockHolding.create({
      userId: company.founderId,
      companyId: stockCompany._id,
      shares: ceoLockedShares,
      avgBuyPrice: sharePrice,
      locked: true,
    });

    const nonCeoMembers = company.members.filter((m) => m.userId.toString() !== company.founderId.toString());
    const nonCeoTotal = nonCeoMembers.reduce((s, m) => s + (m.shares || 0), 0);
    let distributedToMembers = 0;
    if (nonCeoTotal > 0) {
      for (const member of nonCeoMembers) {
        const memberShare = Math.floor(memberPoolShares * ((member.shares || 0) / nonCeoTotal));
        if (memberShare > 0) {
          await StockHolding.create({
            userId: member.userId,
            companyId: stockCompany._id,
            shares: memberShare,
            avgBuyPrice: sharePrice,
            locked: false,
          });
          distributedToMembers += memberShare;
        }
      }
    }

    const actualPublicShares = publicShares + (memberPoolShares - distributedToMembers);
    const totalHeldByInsiders = ceoLockedShares + distributedToMembers;

    stockCompany.totalSharesHeld = totalHeldByInsiders;
    stockCompany.floatPercentage = sharesOutstanding > 0 ? Math.round((actualPublicShares / sharesOutstanding) * 100) : 0;
    await stockCompany.save();

    company.ipo = {
      listed: true,
      stockCompanyId: stockCompany._id,
      ticker,
      sharePrice,
      sharesOutstanding,
      listedAt: new Date(),
      listFee: IPO_FEE,
      dividendsPaid: 0,
      lastDividendPerShare: 0,
      lastDividendTick: 0,
      ipoValue: valuation,
      ceoLockedShares,
      memberShares: distributedToMembers,
      publicShares: actualPublicShares,
    };
    await company.save();

    const gameState = await getGameState();
    await addAuditLog(
      company._id,
      req.user._id,
      'ipo_listed',
      { ticker, sharePrice, sharesOutstanding, marketCap, ipoFee: IPO_FEE, valuation },
      gameState.tickNumber,
    );

    const ipoLaunchEvent = {
      companyId: stockCompany._id,
      tick: gameState.tickNumber,
      type: 'ipo_launch',
      severity: 'major',
      headline: `${ticker} launched its IPO at $${sharePrice.toFixed(2)} per share`,
      description: `${company.name} went public with a valuation of $${marketCap.toLocaleString()} and ${sharesOutstanding.toLocaleString()} shares outstanding.`,
      metadata: { sharePrice, sharesOutstanding, marketCap, valuation },
    };
    StockMarketEvent.create(ipoLaunchEvent).catch(() => {});

    publish(CHANNELS.PUBLIC_COMPANY_IPO_LAUNCH, {
      companyId: stockCompany._id,
      ticker,
      name: company.name,
      sharePrice,
      marketCap,
      sharesOutstanding,
      reCompanyId: company._id,
    }).catch(() => {});
    emitToAll(SOCKET_EVENTS.PUBLIC_COMPANY_IPO_LAUNCH, {
      companyId: stockCompany._id,
      ticker,
      name: company.name,
      sharePrice,
      marketCap,
    });

    cacheDel(ck.publicCompanies()).catch(() => {});
    cacheDel(ck.publicCompaniesStats()).catch(() => {});

    await awardXp(req.user, 50, 'company_ipo');
    await processPlayerProgress(req.user._id, 'company_ipo', { skipXp: true });

    await onCompanyUpdated(company._id);
    await invalidateLeaderboards();

    res.json({
      success: true,
      ipo: company.ipo,
      stockCompany: { _id: stockCompany._id, ticker: stockCompany.ticker, sharePrice, sharesOutstanding, marketCap },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Secondary Offering (Controlled Share Issuance) ───────────────────

router.post('/:id/secondary-offering', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const caller = getMember(company, req.user._id);
    if (!caller || caller.role !== 'ceo') {
      return res.status(403).json({ error: 'Only the CEO can initiate a secondary offering' });
    }

    if (!company.ipo?.listed) {
      return res.status(400).json({ error: 'Company must be publicly listed for a secondary offering' });
    }

    const stockCompany = await Company.findById(company.ipo.stockCompanyId);
    if (!stockCompany) {
      return res.status(400).json({ error: 'Stock company not found' });
    }

    const { newShares, price } = req.body;
    if (!newShares || newShares <= 0 || !Number.isInteger(newShares)) {
      return res.status(400).json({ error: 'Invalid share count' });
    }
    if (newShares > Math.floor(stockCompany.sharesOutstanding * 0.2)) {
      return res.status(400).json({ error: 'Cannot issue more than 20% of current outstanding shares in a single offering' });
    }
    if (!price || price <= 0) {
      return res.status(400).json({ error: 'Invalid offering price' });
    }

    const totalNewShares = stockCompany.sharesOutstanding + newShares;
    const newMarketCap = Math.round(price * totalNewShares);

    // Ensure CEO still has 51% after dilution
    const ceoHolding = await StockHolding.findOne({
      userId: company.founderId,
      companyId: stockCompany._id,
      locked: true,
    });
    if (ceoHolding) {
      const newCeoPct = (ceoHolding.shares / totalNewShares) * 100;
      if (newCeoPct < 51) {
        // Allocate additional locked shares to CEO to maintain 51%
        const neededShares = Math.ceil(totalNewShares * 0.51) - ceoHolding.shares;
        ceoHolding.shares += neededShares;
        await ceoHolding.save();
      }
    }

    // Issue new shares to public market
    const totalInsiderShares = (ceoHolding?.shares || 0) + (await StockHolding.find({
      companyId: stockCompany._id,
      userId: { $ne: company.founderId },
    }).then((h) => h.reduce((s, hh) => s + hh.shares, 0)));

    stockCompany.sharesOutstanding = totalNewShares;
    stockCompany.sharePrice = price;
    stockCompany.previousSharePrice = stockCompany.sharePrice;
    stockCompany.marketCap = newMarketCap;
    stockCompany.floatPercentage = stockCompany.sharesOutstanding > 0
      ? Math.round(((stockCompany.sharesOutstanding - totalInsiderShares) / stockCompany.sharesOutstanding) * 100)
      : 0;
    await stockCompany.save();

    const gameState = await getGameState();
    await CompanyAuditLog.create({
      companyId: company._id,
      userId: req.user._id,
      action: 'secondary_offering',
      details: { newShares, price, totalNewShares, newMarketCap },
      tick: gameState.tickNumber,
    });

    const offeringEvent = {
      companyId: stockCompany._id,
      tick: gameState.tickNumber,
      type: 'secondary_offering',
      severity: 'major',
      headline: `${stockCompany.ticker} announced a secondary offering of ${newShares.toLocaleString()} shares at $${price.toFixed(2)} per share`,
      description: `Total shares increased to ${totalNewShares.toLocaleString()}. Market cap: $${newMarketCap.toLocaleString()}.`,
      metadata: { newShares, price, totalNewShares, newMarketCap },
    };
    StockMarketEvent.create(offeringEvent).catch(() => {});

    publish(CHANNELS.PUBLIC_COMPANY_IPO_LAUNCH, {
      companyId: stockCompany._id,
      ticker: stockCompany.ticker,
      name: stockCompany.name,
      sharePrice: price,
      marketCap: newMarketCap,
      sharesOutstanding: totalNewShares,
      isSecondaryOffering: true,
    }).catch(() => {});

    cacheDel(ck.publicCompanies()).catch(() => {});
    cacheDel(ck.publicCompaniesStats()).catch(() => {});
    await invalidateLeaderboards();

    res.json({
      success: true,
      sharesOutstanding: totalNewShares,
      sharePrice: price,
      marketCap: newMarketCap,
      ceoProtected: !!ceoHolding,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/progression', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'You are not a member of this company' });

    const data = await cacheGetOrSet(
      cacheKeys.companyProgression(req.params.id),
      async () => {
        const benefits = getCompanyLevelBenefits(company.level);
        const xpForCurrentLevel = xpRequiredForLevel(company.level);
        const nextLevelXp = xpRequiredForNextLevel(company.level);
        const xpNeededForLevel = nextLevelXp === Infinity ? 0 : Math.max(1, nextLevelXp - xpForCurrentLevel);
        const xpInCurrentLevel = Math.max(0, company.xp - xpForCurrentLevel);
        const xpProgress =
          nextLevelXp === Infinity ? 100 : Math.min(100, Math.round((xpInCurrentLevel / xpNeededForLevel) * 100));

        const completedMilestoneIds = new Set((company.milestones || []).map((m) => m.milestoneId));
        const availableMilestones = COMPANY_MILESTONES.filter((m) => {
          if (completedMilestoneIds.has(m.id)) return false;
          if (m.prerequisite && !completedMilestoneIds.has(m.prerequisite)) return false;
          return true;
        }).map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          xpReward: m.xpReward,
          reputationReward: m.reputationReward,
          treasuryReward: m.treasuryReward,
        }));

        return {
          level: company.level,
          xp: company.xp,
          xpForCurrentLevel,
          xpToNextLevel: nextLevelXp,
          xpInCurrentLevel,
          xpNeededForLevel,
          xpProgress,
          reputation: company.reputation,
          maxMembers: company.maxMembers,
          benefits,
          completedMilestones: (company.milestones || []).length,
          totalMilestones: COMPANY_MILESTONES.length,
          availableMilestones,
          recentMilestones: (company.milestones || []).slice(-5).reverse(),
          maxLevel: MAX_COMPANY_LEVEL,
        };
      },
      cacheTTL.standard,
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/milestones', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = getMember(company, req.user._id);
    if (!member) return res.status(403).json({ error: 'You are not a member of this company' });

    const completedIds = new Set((company.milestones || []).map((m) => m.milestoneId));

    const all = COMPANY_MILESTONES.map((m) => {
      const completed = completedIds.has(m.id);
      const available = !completed && (!m.prerequisite || completedIds.has(m.prerequisite));
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        xpReward: m.xpReward,
        reputationReward: m.reputationReward,
        treasuryReward: m.treasuryReward,
        completed,
        available,
        completedData: completed ? company.milestones.find((cm) => cm.milestoneId === m.id) : null,
      };
    });

    res.json({
      milestones: all,
      completed: completedIds.size,
      total: COMPANY_MILESTONES.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
