import mongoose from 'mongoose';

const marketReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportType: {
      type: String,
      enum: ['city_market', 'district', 'price_forecast', 'risk_assessment', 'growth_opportunities'],
      required: true,
    },
    tier: {
      type: String,
      enum: ['basic', 'advanced', 'premium'],
      required: true,
    },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', default: null },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', default: null },

    cost: { type: Number, required: true },
    purchasedAtTick: { type: Number, required: true },
    expiresAtTick: { type: Number, required: true },

    data: { type: mongoose.Schema.Types.Mixed, required: true },

    forecastAccuracy: { type: Number, default: null },
    accuracyScore: { type: Number, default: null },
    actualOutcome: { type: mongoose.Schema.Types.Mixed, default: null },
    evaluationTick: { type: Number, default: null },

    status: {
      type: String,
      enum: ['active', 'expired', 'evaluated'],
      default: 'active',
    },
  },
  { timestamps: true },
);

marketReportSchema.index({ userId: 1, status: 1 });
marketReportSchema.index({ userId: 1, reportType: 1, tier: 1, cityId: 1, districtId: 1, status: 1 });
marketReportSchema.index({ expiresAtTick: 1, status: 1 });

marketReportSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    if (ret._id && typeof ret._id === 'object') {
      ret._id = ret._id.toString();
    }
    if (ret.userId && typeof ret.userId === 'object' && ret.userId._id) {
      ret.userId = ret.userId._id.toString();
    } else if (ret.userId && typeof ret.userId === 'object' && ret.userId.toString) {
      ret.userId = ret.userId.toString();
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
    if (ret.districtId && typeof ret.districtId === 'object' && ret.districtId._id) {
      ret.districtId = {
        _id: ret.districtId._id.toString(),
        name: ret.districtId.name,
        tier: ret.districtId.tier,
      };
    } else if (ret.districtId && typeof ret.districtId === 'object' && ret.districtId.toString) {
      ret.districtId = ret.districtId.toString();
    }
    return ret;
  },
});

export default mongoose.model('MarketReport', marketReportSchema);
