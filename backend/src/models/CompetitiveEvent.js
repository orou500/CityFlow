import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    displayName: { type: String, default: '' },
    avatar: { type: String, default: '' },
    value: { type: Number, required: true },
    rank: { type: Number, default: 0 },
    reward: {
      type: { type: String, enum: ['title', 'badge', 'achievement', 'cosmetic', 'balance', 'xp'], default: null },
      value: { type: mongoose.Schema.Types.Mixed, default: null },
      claimed: { type: Boolean, default: false },
    },
  },
  { _id: false },
);

const competitiveEventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: ['wealth', 'development', 'expansion', 'income', 'influence'],
      required: true,
    },
    metric: {
      type: String,
      enum: [
        'netWorthGain',
        'netWorth',
        'propertiesAcquired',
        'developmentCompleted',
        'passiveIncome',
        'cityInfluence',
        'dealVolume',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed'],
      default: 'upcoming',
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    startTick: { type: Number, required: true },
    endTick: { type: Number, required: true },
    minLevel: { type: Number, default: 1 },
    maxParticipants: { type: Number, default: 0 },
    participants: [participantSchema],
    rewards: {
      first: { type: mongoose.Schema.Types.Mixed, default: null },
      second: { type: mongoose.Schema.Types.Mixed, default: null },
      third: { type: mongoose.Schema.Types.Mixed, default: null },
      participation: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    snapshotInterval: { type: Number, default: 1 },
    lastSnapshotTick: { type: Number, default: 0 },
    createdFromSeason: { type: Number, default: 0 },
  },
  { timestamps: true },
);

competitiveEventSchema.index({ status: 1, startDate: -1 });
competitiveEventSchema.index({ type: 1, status: 1 });
competitiveEventSchema.index({ endTick: 1 });

export default mongoose.model('CompetitiveEvent', competitiveEventSchema);
