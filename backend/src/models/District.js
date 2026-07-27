import mongoose from 'mongoose';

const districtHistoryEntry = new mongoose.Schema(
  {
    tick: { type: Number, required: true },
    population: { type: Number },
    demandIndex: { type: Number },
    supplyIndex: { type: Number },
    growthRate: { type: Number },
    avgRent: { type: Number },
    avgPrice: { type: Number },
    propertyCount: { type: Number },
    activeEvents: [{ type: String }],
  },
  { _id: false },
);

const influenceEntry = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, default: 0, min: 0, max: 1 },
    tier: {
      type: String,
      enum: ['observer', 'minor_investor', 'significant_investor', 'market_leader'],
      default: 'observer',
    },
    propertyCount: { type: Number, default: 0 },
    totalInvested: { type: Number, default: 0 },
    lastUpdatedTick: { type: Number, default: 0 },
  },
  { _id: false },
);

const activeEventEntry = new mongoose.Schema(
  {
    eventType: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['positive', 'negative'], required: true },
    effects: {
      demandDelta: { type: Number, default: 0 },
      priceDelta: { type: Number, default: 0 },
      growthDelta: { type: Number, default: 0 },
      supplyDelta: { type: Number, default: 0 },
    },
    remainingTicks: { type: Number, required: true },
    startedAtTick: { type: Number, required: true },
  },
  { _id: false },
);

const districtSchema = new mongoose.Schema(
  {
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    name: { type: String, required: true },
    tier: {
      type: String,
      enum: ['premium', 'growing', 'commercial', 'affordable', 'suburban', 'moderate'],
      required: true,
    },
    population: { type: Number, default: 100000 },
    demandIndex: { type: Number, default: 1.0 },
    supplyIndex: { type: Number, default: 1.0 },
    growthRate: { type: Number, default: 0.01 },
    avgPrice: { type: Number, default: 200000 },
    avgRent: { type: Number, default: 500 },
    propertyCount: { type: Number, default: 0 },
    totalCapacity: { type: Number, default: 20000 },

    baseDemand: { type: Number, default: 1.0 },
    basePrice: { type: Number, default: 200000 },

    activeEvents: [activeEventEntry],
    eventCooldownTicks: { type: Number, default: 0 },

    influence: [influenceEntry],
    totalInfluencePoints: { type: Number, default: 0 },

    history: [districtHistoryEntry],
  },
  { timestamps: true },
);

districtSchema.index({ cityId: 1 });
districtSchema.index({ cityId: 1, name: 1 }, { unique: true });
districtSchema.index({ cityId: 1, avgPrice: -1 });
districtSchema.index({ 'influence.userId': 1 });

districtSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    if (ret._id && typeof ret._id === 'object') {
      ret._id = ret._id.toString();
    }
    if (ret.cityId && typeof ret.cityId === 'object' && ret.cityId._id) {
      ret.cityId = {
        _id: ret.cityId._id.toString(),
        name: ret.cityId.name,
        country: ret.cityId.country,
      };
    } else if (ret.cityId && typeof ret.cityId === 'object' && ret.cityId.toString) {
      ret.cityId = ret.cityId.toString();
    }
    if (ret.influence) {
      ret.influence = ret.influence.map((inf) => ({
        ...inf,
        userId: inf.userId?.toString?.() || inf.userId,
      }));
    }
    return ret;
  },
});

export default mongoose.model('District', districtSchema);
