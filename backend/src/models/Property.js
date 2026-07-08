import mongoose from 'mongoose';

const unitSchema = new mongoose.Schema(
  {
    unitNumber: { type: Number, required: true },
    type: {
      type: String,
      enum: ['apartment', 'office', 'retail', 'hotel_room'],
      required: true,
    },
    rentPrice: { type: Number, required: true },
    occupied: { type: Boolean, default: false },
  },
  { _id: false },
);

const propertySchema = new mongoose.Schema(
  {
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
      type: String,
      enum: ['apartment', 'house', 'commercial', 'land'],
      required: true,
    },
    name: { type: String, required: true },
    basePrice: { type: Number, required: true },
    currentPrice: { type: Number, required: true },
    rent: { type: Number, default: 0 },
    condition: { type: Number, default: 100, min: 0, max: 100 },
    volatility: { type: Number, default: 0.1 },
    forSale: { type: Boolean, default: true },
    lastPurchasePrice: { type: Number },
    lastPurchaseDate: { type: Date },
    priceHistory: [
      {
        tick: { type: Number },
        price: { type: Number },
      },
    ],

    size: { type: Number },
    location: { type: String },
    developmentLevel: { type: Number, default: 0, min: 0 },
    buildingType: { type: String },
    units: [unitSchema],
    occupancy: { type: Number, default: 0, min: 0, max: 100 },
    maintenanceCost: { type: Number, default: 0 },
    parentBuilding: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    lastUpgrade: { type: String },
    upgrades: [
      {
        name: { type: String },
        appliedAt: { type: Number },
        effect: { type: mongoose.Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: true },
);

propertySchema.index({ currentPrice: 1 });
propertySchema.index({ cityId: 1 });
propertySchema.index({ type: 1 });
propertySchema.index({ forSale: 1 });
propertySchema.index({ name: 1 });
propertySchema.index({ createdAt: -1 });

export default mongoose.model('Property', propertySchema);
