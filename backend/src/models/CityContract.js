import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vote: { type: String, enum: ['yes', 'no'], required: true },
    votedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const proposalSchema = new mongoose.Schema(
  {
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    votes: [voteSchema],
    proposedAt: { type: Date, default: Date.now },
    proposedTick: { type: Number, default: 0 },
    resolvedAt: { type: Date },
    expiresAtTick: { type: Number, default: 0 },
  },
  { _id: true },
);

const cityContractSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateCompany', required: true },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    contractType: {
      type: String,
      enum: [
        'renovation',
        'small_housing',
        'small_office',
        'apartment_complex',
        'shopping_center',
        'hotel',
        'office_tower',
        'mixed_use',
        'district',
        'airport',
        'stadium',
        'technology_park',
        'mega_residential',
        'affordable_housing',
        'office_district',
        'urban_redevelopment',
        'infrastructure',
      ],
      required: true,
    },
    contractTier: { type: Number, default: 1 },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    requiredLevel: { type: Number, default: 1 },
    requiredTreasury: { type: Number, default: 0 },
    cost: { type: Number, required: true },
    reward: { type: Number, required: true },
    reputationReward: { type: Number, default: 0 },
    xpReward: { type: Number, default: 0 },
    durationTicks: { type: Number, required: true },
    startTick: { type: Number, default: 0 },
    endTick: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    budgetSpent: { type: Number, default: 0 },
    totalBudget: { type: Number, default: 0 },
    expectedProfit: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['available', 'proposed', 'active', 'completed', 'failed', 'rejected'],
      default: 'available',
    },
    proposal: { type: proposalSchema, default: null },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date },
    completedAt: { type: Date },
    failedReason: { type: String, default: '' },
    generatedTick: { type: Number, default: 0 },
    expiresAtTick: { type: Number, default: 0 },
  },
  { timestamps: true },
);

cityContractSchema.index({ companyId: 1, status: 1 });
cityContractSchema.index({ cityId: 1, status: 1 });
cityContractSchema.index({ status: 1, expiresAtTick: 1 });

const CityContract = mongoose.model('CityContract', cityContractSchema);
export default CityContract;
