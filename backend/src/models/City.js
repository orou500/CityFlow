import mongoose from 'mongoose';

const demographicsHistoryEntry = new mongoose.Schema(
  {
    tick: { type: Number, required: true },
    population: { type: Number },
    demandIndex: { type: Number },
    supplyIndex: { type: Number },
    growthRate: { type: Number },
    avgRent: { type: Number },
    immigration: { type: Number },
    emigration: { type: Number },
    economicCondition: { type: String },
  },
  { _id: false },
);

const citySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    country: { type: String, required: true },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    demandIndex: { type: Number, default: 1.0 },
    supplyIndex: { type: Number, default: 1.0 },
    population: { type: Number, default: 1000000 },
    growthRate: { type: Number, default: 0.01 },
    avgPrice: { type: Number, default: 200000 },
    propertyCount: { type: Number, default: 0 },
    totalCapacity: { type: Number, default: 100000 },
    developmentRate: { type: Number, default: 0.02 },
    activeEvents: [
      {
        eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
        remainingTicks: Number,
      },
    ],
    economicCondition: {
      type: String,
      enum: ['boom', 'growth', 'stable', 'slowdown', 'recession'],
      default: 'stable',
    },
    avgRent: { type: Number, default: 500 },
    immigration: { type: Number, default: 0 },
    emigration: { type: Number, default: 0 },
    demographicsHistory: [demographicsHistoryEntry],
  },
  { timestamps: true },
);

citySchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    if (ret._id && typeof ret._id === 'object') {
      ret._id = ret._id.toString();
    }
    return ret;
  },
});

export default mongoose.model('City', citySchema);
