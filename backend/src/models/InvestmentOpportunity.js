import mongoose from 'mongoose';

const investmentOpportunitySchema = new mongoose.Schema(
  {
    type: {
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
    baseAnnualReturnRate: { type: Number, required: true },
    currentAnnualReturnRate: { type: Number, required: true },
    durationTicks: { type: Number, required: true },
    risk: { type: String, enum: ['very_low', 'low', 'medium', 'high', 'very_high'], default: 'low' },
    minInvestment: { type: Number, default: 0 },
    maxInvestment: { type: Number, default: 0 },
    availableCapital: { type: Number, default: Infinity },
    economyState: { type: String, default: 'stable' },
    globalEconomicIndex: { type: Number, default: 1 },
    active: { type: Boolean, default: true },
    createdTick: { type: Number, default: 0 },
    expiresAtTick: { type: Number, default: 0 },
  },
  { timestamps: true },
);

investmentOpportunitySchema.index({ active: 1, expiresAtTick: 1 });
investmentOpportunitySchema.index({ type: 1, active: 1 });

export default mongoose.model('InvestmentOpportunity', investmentOpportunitySchema);
