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
    regime: {
      type: String,
      enum: ['bull', 'bear', 'stable', 'recovery', 'correction', 'boom'],
      default: 'stable',
    },
    regimeEndTick: { type: Number, default: 0 },
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

propertySchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    if (ret._id && typeof ret._id === 'object') {
      ret._id = ret._id.toString();
    }
    if (ret.cityId && typeof ret.cityId === 'object' && ret.cityId._id) {
      ret.cityId = {
        _id: ret.cityId._id.toString(),
        name: ret.cityId.name,
        demandIndex: ret.cityId.demandIndex,
        supplyIndex: ret.cityId.supplyIndex,
        growthRate: ret.cityId.growthRate,
        population: ret.cityId.population,
        avgPrice: ret.cityId.avgPrice,
      };
    } else if (ret.cityId && typeof ret.cityId === 'object' && ret.cityId.toString) {
      ret.cityId = ret.cityId.toString();
    }
    if (ret.ownerId && typeof ret.ownerId === 'object' && ret.ownerId._id) {
      ret.ownerId = { _id: ret.ownerId._id.toString(), username: ret.ownerId.username };
    } else if (ret.ownerId && typeof ret.ownerId === 'object' && ret.ownerId.toString) {
      ret.ownerId = ret.ownerId.toString();
    }
    if (ret.parentBuilding && typeof ret.parentBuilding === 'object' && ret.parentBuilding.toString) {
      ret.parentBuilding = ret.parentBuilding.toString();
    }
    return ret;
  },
});

export default mongoose.model('Property', propertySchema);
