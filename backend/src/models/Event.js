import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    type: {
      type: String,
      enum: ['global', 'local'],
      required: true,
    },
    impact: {
      demandDelta: { type: Number, default: 0 },
      supplyDelta: { type: Number, default: 0 },
      priceMultiplier: { type: Number, default: 1.0 },
      growthDelta: { type: Number, default: 0 },
    },
    affectedCities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'City' }],
    duration: { type: Number, default: 3 },
    remainingTicks: { type: Number, default: 3 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('Event', eventSchema);
