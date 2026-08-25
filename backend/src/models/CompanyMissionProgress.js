import mongoose from 'mongoose';

const contributorSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contribution: { type: Number, default: 0 },
    contributedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const companyMissionProgressSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RealEstateCompany',
      required: true,
    },
    missionId: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'claimed'],
      default: 'active',
    },
    progress: { type: Number, default: 0 },
    target: { type: Number, required: true },
    completedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    periodKey: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    contributors: { type: [contributorSchema], default: [] },
    rewardsClaimed: {
      xp: { type: Number, default: 0 },
      treasury: { type: Number, default: 0 },
      reputation: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

companyMissionProgressSchema.index({ companyId: 1, missionId: 1 }, { unique: true });
companyMissionProgressSchema.index({ companyId: 1, status: 1 });
companyMissionProgressSchema.index({ companyId: 1, periodKey: 1 });
companyMissionProgressSchema.index({ status: 1, completedAt: 1 });

export default mongoose.model('CompanyMissionProgress', companyMissionProgressSchema);
