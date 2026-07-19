import mongoose from 'mongoose';

const officeSchema = new mongoose.Schema(
  {
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    type: {
      type: String,
      enum: ['headquarters', 'office', 'factory', 'warehouse', 'store'],
      required: true,
    },
    employees: { type: Number, default: 0 },
    openedTick: { type: Number, default: 0 },
  },
  { _id: true },
);

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    ticker: { type: String, required: true, unique: true },
    industry: {
      type: String,
      enum: ['technology', 'finance', 'manufacturing', 'retail', 'energy', 'healthcare', 'logistics', 'entertainment'],
      required: true,
    },
    size: {
      type: String,
      enum: ['startup', 'small', 'medium', 'large', 'corporation'],
      default: 'small',
    },
    revenue: { type: Number, default: 100000 },
    employees: { type: Number, default: 50 },
    hqCityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    offices: [officeSchema],
    sharePrice: { type: Number, default: 10 },
    previousSharePrice: { type: Number, default: 10 },
    marketCap: { type: Number, default: 1000000 },
    sharesOutstanding: { type: Number, default: 100000 },
    volatility: { type: Number, default: 0.03 },
    performance: [
      {
        tick: { type: Number },
        price: { type: Number },
        employees: { type: Number },
        revenue: { type: Number },
        marketCap: { type: Number },
      },
    ],
    expansionHistory: [
      {
        tick: { type: Number },
        type: { type: String },
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
        description: { type: String },
      },
    ],
    active: { type: Boolean, default: true },
    foundedTick: { type: Number, default: 0 },
    description: { type: String, default: '' },
    totalReturn: { type: Number, default: 0 },
    dayChange: { type: Number, default: 0 },
    dayChangePercent: { type: Number, default: 0 },
    high52Week: { type: Number, default: 0 },
    low52Week: { type: Number, default: 0 },
  },
  { timestamps: true },
);

companySchema.index({ industry: 1 });
companySchema.index({ hqCityId: 1 });
companySchema.index({ active: 1 });

export default mongoose.model('Company', companySchema);
