import mongoose from 'mongoose';

const investmentVoteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vote: { type: String, enum: ['yes', 'no'], required: true },
    votedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const performanceHistorySchema = new mongoose.Schema(
  {
    tick: { type: Number, required: true },
    currentValue: { type: Number, required: true },
    returnRate: { type: Number, required: true },
    economyModifier: { type: Number, default: 1 },
    riskModifier: { type: Number, default: 1 },
  },
  { _id: true },
);

const companyInvestmentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateCompany', required: true },
    investmentOpportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentOpportunity', default: null },
    investmentType: {
      type: String,
      enum: [
        'government_bond',
        'corporate_bond',
        'reit_fund',
        'fixed_term',
        'infrastructure_fund',
        'commercial_property_fund',
        'emerging_market_fund',
      ],
      required: true,
    },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    principal: { type: Number, required: true },
    currentValue: { type: Number, required: true },
    annualReturnRate: { type: Number, required: true },
    baseAnnualReturnRate: { type: Number, required: true },
    durationTicks: { type: Number, required: true },
    risk: { type: String, default: 'low' },
    minInvestment: { type: Number, default: 0 },
    startTick: { type: Number, required: true },
    maturityTick: { type: Number, required: true },
    economyStateAtStart: { type: String, default: 'stable' },
    globalEconomicIndex: { type: Number, default: 1 },
    requiresVote: { type: Boolean, default: false },
    proposal: {
      proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      votes: [investmentVoteSchema],
      proposedTick: { type: Number, default: 0 },
      expiresAtTick: { type: Number, default: 0 },
      resolvedAt: { type: Date },
    },
    performanceHistory: [performanceHistorySchema],
    status: {
      type: String,
      enum: ['proposed', 'active', 'matured', 'withdrawn', 'rejected'],
      default: 'active',
    },
  },
  { timestamps: true },
);

companyInvestmentSchema.index({ companyId: 1, status: 1 });

const CompanyInvestment = mongoose.model('CompanyInvestment', companyInvestmentSchema);
export default CompanyInvestment;
