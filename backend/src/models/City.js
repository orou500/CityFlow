import mongoose from 'mongoose';

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
  },
  { timestamps: true },
);

export default mongoose.model('City', citySchema);
