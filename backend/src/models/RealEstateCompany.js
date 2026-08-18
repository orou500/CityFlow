import mongoose from 'mongoose';
import { xpRequiredForLevel, xpRequiredForNextLevel, getLevelFromTotalXP } from '../config/companyProgression.js';

const memberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['ceo', 'director', 'officer', 'member', 'recruit'],
      default: 'member',
    },
    shares: { type: Number, default: 0 },
    joinedAt: { type: Date, default: Date.now },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true },
);

const treasuryTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'deposit',
        'withdrawal',
        'rent_income',
        'loan_disbursement',
        'loan_payment',
        'property_purchase',
        'property_sale',
        'construction',
        'operating_fee',
        'contract_reward',
        'investment_return',
        'investment_withdrawal',
        'development',
        'payroll',
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    description: { type: String, default: '' },
    tick: { type: Number, default: 0 },
  },
  { timestamps: true, _id: true },
);

const invitationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const applicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true, _id: true },
);

const loanRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    principal: { type: Number, required: true },
    durationTicks: { type: Number, required: true },
    loanType: { type: String, default: 'business' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'executed'], default: 'pending' },
    votes: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        vote: { type: String, enum: ['yes', 'no'] },
        votedAt: { type: Date, default: Date.now },
      },
    ],
    createdTick: { type: Number, required: true },
    executedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    executedAt: { type: Date },
    loanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan' },
  },
  { timestamps: true, _id: true },
);

const propertyPurchaseRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'executed'], default: 'pending' },
    votes: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        vote: { type: String, enum: ['yes', 'no'] },
        votedAt: { type: Date, default: Date.now },
      },
    ],
    createdTick: { type: Number, required: true },
    executedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    executedAt: { type: Date },
  },
  { timestamps: true, _id: true },
);

const auctionBidRequestSchema = new mongoose.Schema(
  {
    auctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'resolving', 'approved', 'rejected', 'executed', 'expired'],
      default: 'pending',
    },
    votes: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        vote: { type: String, enum: ['yes', 'no'] },
        votedAt: { type: Date, default: Date.now },
      },
    ],
    // Backend-computed voting deadline: MIN(createdAt + 6h, auctionEndsAt).
    // Never supplied by the client. The frontend only ever displays it.
    votingEndsAt: { type: Date },
    createdTick: { type: Number, default: 0 },
    executedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    executedAt: { type: Date },
    // Final tally after resolution (missing votes count as YES).
    resolution: {
      yes: { type: Number, default: 0 },
      no: { type: Number, default: 0 },
      missingAsYes: { type: Number, default: 0 },
      threshold: { type: Number, default: 0 },
      resolvedAt: { type: Date },
    },
    resolvedAt: { type: Date },
    // When the atomic pending -> resolving claim was taken. Used by the stale
    // recovery job to detect workers that crashed mid-resolution.
    resolvingAt: { type: Date },
    // Explicit reason for non-standard resolution (e.g. stale recovery).
    resolutionReason: { type: String },
  },
  { timestamps: true, _id: true },
);

const developmentRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    actionType: { type: String, enum: ['upgrade', 'improvement', 'construction'], required: true },
    actionData: { type: mongoose.Schema.Types.Mixed, required: true },
    estimatedCost: { type: Number, required: true },
    estimatedValueIncrease: { type: Number, default: 0 },
    estimatedRentIncrease: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'executed', 'failed'],
      default: 'pending',
    },
    votes: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        vote: { type: String, enum: ['yes', 'no'] },
        votedAt: { type: Date, default: Date.now },
      },
    ],
    createdTick: { type: Number, required: true },
    executedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    executedAt: { type: Date },
    rejectionReason: { type: String },
    constructionProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConstructionProject', default: null },
  },
  { timestamps: true, _id: true },
);

const milestoneProgressSchema = new mongoose.Schema(
  {
    milestoneId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    xpReward: { type: Number, default: 0 },
    reputationReward: { type: Number, default: 0 },
    treasuryReward: { type: Number, default: 0 },
    completedAt: { type: Date, default: Date.now },
    completedTick: { type: Number, default: 0 },
  },
  { _id: true },
);

const realEstateCompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '', maxlength: 500 },
    logo: { type: String, default: '' },
    founderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    hqCityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
    members: [memberSchema],
    invitations: [invitationSchema],
    applications: [applicationSchema],
    loanRequests: [loanRequestSchema],
    propertyPurchaseRequests: [propertyPurchaseRequestSchema],
    developmentRequests: [developmentRequestSchema],
    auctionBids: [auctionBidRequestSchema],
    milestones: [milestoneProgressSchema],
    shares: {
      totalShares: { type: Number, default: 1000 },
      treasuryShares: { type: Number, default: 300 },
      parValue: { type: Number, default: 100 },
    },
    treasury: {
      balance: { type: Number, default: 0 },
      transactions: [treasuryTransactionSchema],
    },
    stats: {
      netWorth: { type: Number, default: 0 },
      propertiesOwned: { type: Number, default: 0 },
      totalRentalIncome: { type: Number, default: 0 },
      totalTreasuryDeposits: { type: Number, default: 0 },
      activeProjects: { type: Number, default: 0 },
      totalLoanBalance: { type: Number, default: 0 },
      totalDevelopments: { type: Number, default: 0 },
      contractsCompleted: { type: Number, default: 0 },
      loansRepaid: { type: Number, default: 0 },
      totalVotes: { type: Number, default: 0 },
      ticksExisted: { type: Number, default: 0 },
    },
    reputation: { type: Number, default: 0 },
    prestige: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    xpToNextLevel: { type: Number, default: 500 },
    maxMembers: { type: Number, default: 10 },
    employees: {
      count: { type: Number, default: 0 },
      maxEmployees: { type: Number, default: 10 },
      monthlySalaryPerEmployee: { type: Number, default: 5000 },
      totalPayroll: { type: Number, default: 0 },
      departments: [
        {
          name: { type: String, required: true },
          count: { type: Number, default: 0 },
          budget: { type: Number, default: 0 },
        },
      ],
    },
    active: { type: Boolean, default: true },
    foundedTick: { type: Number, default: 0 },
    creationFee: { type: Number, default: 0 },
    ipo: {
      listed: { type: Boolean, default: false },
      stockCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
      ticker: { type: String },
      sharePrice: { type: Number, default: 0 },
      sharesOutstanding: { type: Number, default: 0 },
      listedAt: { type: Date },
      listFee: { type: Number, default: 0 },
      dividendsPaid: { type: Number, default: 0 },
      lastDividendPerShare: { type: Number, default: 0 },
      lastDividendTick: { type: Number, default: 0 },
      ipoValue: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

realEstateCompanySchema.index({ founderId: 1 });
realEstateCompanySchema.index({ 'members.userId': 1 });
realEstateCompanySchema.index({ 'auctionBids._id': 1 });
realEstateCompanySchema.index({ 'auctionBids.status': 1, 'auctionBids.resolvingAt': 1 });
realEstateCompanySchema.index({ hqCityId: 1 });
realEstateCompanySchema.index({ reputation: -1 });
realEstateCompanySchema.index({ 'stats.netWorth': -1 });
realEstateCompanySchema.index({ active: 1 });

realEstateCompanySchema.pre('save', function (next) {
  // Migration: convert old "remaining XP" format to total accumulated XP.
  // In the old system, level >1 companies always had xp < xpRequiredForLevel(level).
  if (this.level > 1 && this.xp < xpRequiredForLevel(this.level)) {
    this.xp += xpRequiredForLevel(this.level);
  }

  // Migration: ensure expanded shares structure for old companies
  if (this.shares) {
    if (this.shares.treasuryShares == null) {
      const memberSum = this.members ? this.members.reduce((s, m) => s + (m.shares || 0), 0) : 0;
      this.shares.treasuryShares = Math.max(0, this.shares.totalShares - memberSum);
    }
    if (this.shares.parValue == null) {
      this.shares.parValue = 100;
    }
  }

  // Migration: ensure employees defaults for old companies
  if (this.employees == null || typeof this.employees !== 'object') {
    this.employees = { count: 0, maxEmployees: 10, monthlySalaryPerEmployee: 5000, totalPayroll: 0, departments: [] };
  } else {
    if (this.employees.maxEmployees == null) this.employees.maxEmployees = 10;
    if (this.employees.monthlySalaryPerEmployee == null) this.employees.monthlySalaryPerEmployee = 5000;
    if (this.employees.totalPayroll == null) this.employees.totalPayroll = 0;
    if (!this.employees.departments) this.employees.departments = [];
  }

  // Always derive level from total accumulated XP
  this.level = getLevelFromTotalXP(this.xp || 0);
  this.xpToNextLevel = xpRequiredForNextLevel(this.level);
  next();
});

realEstateCompanySchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    if (ret._id && typeof ret._id === 'object') {
      ret._id = ret._id.toString();
    }
    if (ret.level != null) {
      ret.xpForCurrentLevel = xpRequiredForLevel(ret.level);
      ret.xpInCurrentLevel = Math.max(0, (ret.xp || 0) - ret.xpForCurrentLevel);
      ret.xpNeededForLevel = Math.max(
        1,
        (ret.xpToNextLevel || xpRequiredForNextLevel(ret.level)) - ret.xpForCurrentLevel,
      );
    }
    if (ret.founderId && typeof ret.founderId === 'object' && ret.founderId._id) {
      ret.founderId = { _id: ret.founderId._id.toString(), username: ret.founderId.username };
    } else if (ret.founderId && typeof ret.founderId === 'object' && ret.founderId.toString) {
      ret.founderId = ret.founderId.toString();
    }
    if (ret.members) {
      ret.members = ret.members.map((m) => ({
        ...m,
        _id: m._id?.toString(),
        userId:
          m.userId && typeof m.userId === 'object' && m.userId._id
            ? { _id: m.userId._id.toString(), username: m.userId.username, avatar: m.userId.avatar }
            : m.userId?.toString?.() || m.userId,
        invitedBy: m.invitedBy?.toString?.() || m.invitedBy,
      }));
    }
    if (ret.invitations) {
      ret.invitations = ret.invitations.map((i) => ({
        ...i,
        _id: i._id?.toString(),
        userId:
          i.userId && typeof i.userId === 'object' && i.userId._id
            ? { _id: i.userId._id.toString(), username: i.userId.username }
            : i.userId?.toString?.() || i.userId,
        invitedBy: i.invitedBy?.toString?.() || i.invitedBy,
      }));
    }
    if (ret.treasury?.transactions) {
      ret.treasury.transactions = ret.treasury.transactions.map((t) => ({
        ...t,
        _id: t._id?.toString(),
        userId: t.userId?.toString?.() || t.userId,
      }));
    }
    if (ret.applications) {
      ret.applications = ret.applications.map((a) => ({
        ...a,
        _id: a._id?.toString(),
        userId:
          a.userId && typeof a.userId === 'object' && a.userId._id
            ? { _id: a.userId._id.toString(), username: a.userId.username, avatar: a.userId.avatar }
            : a.userId?.toString?.() || a.userId,
        reviewedBy: a.reviewedBy?.toString?.() || a.reviewedBy,
      }));
    }
    if (ret.loanRequests) {
      ret.loanRequests = ret.loanRequests.map((lr) => ({
        ...lr,
        _id: lr._id?.toString(),
        requestedBy:
          lr.requestedBy && typeof lr.requestedBy === 'object' && lr.requestedBy._id
            ? { _id: lr.requestedBy._id.toString(), username: lr.requestedBy.username }
            : lr.requestedBy?.toString?.() || lr.requestedBy,
        votes: (lr.votes || []).map((v) => ({
          ...v,
          userId:
            v.userId && typeof v.userId === 'object' && v.userId._id
              ? { _id: v.userId._id.toString(), username: v.userId.username }
              : v.userId?.toString?.() || v.userId,
        })),
        executedBy: lr.executedBy?.toString?.() || lr.executedBy,
        loanId: lr.loanId?.toString?.() || lr.loanId,
      }));
    }
    if (ret.propertyPurchaseRequests) {
      ret.propertyPurchaseRequests = ret.propertyPurchaseRequests.map((pr) => ({
        ...pr,
        _id: pr._id?.toString(),
        requestedBy:
          pr.requestedBy && typeof pr.requestedBy === 'object' && pr.requestedBy._id
            ? { _id: pr.requestedBy._id.toString(), username: pr.requestedBy.username }
            : pr.requestedBy?.toString?.() || pr.requestedBy,
        propertyId:
          pr.propertyId && typeof pr.propertyId === 'object' && pr.propertyId._id
            ? pr.propertyId
            : pr.propertyId?.toString?.() || pr.propertyId,
        votes: (pr.votes || []).map((v) => ({
          ...v,
          userId:
            v.userId && typeof v.userId === 'object' && v.userId._id
              ? { _id: v.userId._id.toString(), username: v.userId.username }
              : v.userId?.toString?.() || v.userId,
        })),
        executedBy: pr.executedBy?.toString?.() || pr.executedBy,
      }));
    }
    if (ret.developmentRequests) {
      ret.developmentRequests = ret.developmentRequests.map((dr) => ({
        ...dr,
        _id: dr._id?.toString(),
        requestedBy:
          dr.requestedBy && typeof dr.requestedBy === 'object' && dr.requestedBy._id
            ? { _id: dr.requestedBy._id.toString(), username: dr.requestedBy.username }
            : dr.requestedBy?.toString?.() || dr.requestedBy,
        propertyId:
          dr.propertyId && typeof dr.propertyId === 'object' && dr.propertyId._id
            ? dr.propertyId
            : dr.propertyId?.toString?.() || dr.propertyId,
        votes: (dr.votes || []).map((v) => ({
          ...v,
          userId:
            v.userId && typeof v.userId === 'object' && v.userId._id
              ? { _id: v.userId._id.toString(), username: v.userId.username }
              : v.userId?.toString?.() || v.userId,
        })),
        executedBy: dr.executedBy?.toString?.() || dr.executedBy,
        constructionProjectId:
          dr.constructionProjectId && typeof dr.constructionProjectId === 'object' && dr.constructionProjectId._id
            ? {
                _id: dr.constructionProjectId._id.toString(),
                progress: dr.constructionProjectId.progress,
                status: dr.constructionProjectId.status,
                constructionPeriods: dr.constructionProjectId.constructionPeriods,
                startPeriod: dr.constructionProjectId.startPeriod,
                completionPeriod: dr.constructionProjectId.completionPeriod,
                delayTicks: dr.constructionProjectId.delayTicks,
                projectName: dr.constructionProjectId.projectName,
              }
            : dr.constructionProjectId?.toString?.() || dr.constructionProjectId,
      }));
    }
    if (ret.auctionBids) {
      ret.auctionBids = ret.auctionBids.map((ab) => ({
        ...ab,
        _id: ab._id?.toString(),
        requestedBy:
          ab.requestedBy && typeof ab.requestedBy === 'object' && ab.requestedBy._id
            ? { _id: ab.requestedBy._id.toString(), username: ab.requestedBy.username }
            : ab.requestedBy?.toString?.() || ab.requestedBy,
        auctionId:
          ab.auctionId && typeof ab.auctionId === 'object' && ab.auctionId._id
            ? ab.auctionId
            : ab.auctionId?.toString?.() || ab.auctionId,
        votes: (ab.votes || []).map((v) => ({
          ...v,
          userId:
            v.userId && typeof v.userId === 'object' && v.userId._id
              ? { _id: v.userId._id.toString(), username: v.userId.username }
              : v.userId?.toString?.() || v.userId,
        })),
        executedBy: ab.executedBy?.toString?.() || ab.executedBy,
      }));
    }
    if (ret.milestones) {
      ret.milestones = ret.milestones.map((m) => ({
        ...m,
        _id: m._id?.toString(),
      }));
    }
    if (ret.ipo?.stockCompanyId && typeof ret.ipo.stockCompanyId === 'object' && ret.ipo.stockCompanyId._id) {
      ret.ipo.stockCompanyId = ret.ipo.stockCompanyId._id.toString();
    }
    if (ret.hqCityId && typeof ret.hqCityId === 'object' && ret.hqCityId._id) {
      ret.hqCityId = { _id: ret.hqCityId._id.toString(), name: ret.hqCityId.name };
    } else if (ret.hqCityId && typeof ret.hqCityId === 'object' && ret.hqCityId.toString) {
      ret.hqCityId = ret.hqCityId.toString();
    }
    return ret;
  },
});

export default mongoose.model('RealEstateCompany', realEstateCompanySchema);
