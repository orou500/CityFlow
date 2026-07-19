import mongoose from 'mongoose';

const stockIndexSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    ticker: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: ['world', 'industry', 'city'],
      required: true,
    },
    filterKey: { type: String },
    value: { type: Number, default: 1000 },
    previousValue: { type: Number, default: 1000 },
    dayChange: { type: Number, default: 0 },
    dayChangePercent: { type: Number, default: 0 },
    totalReturn: { type: Number, default: 0 },
    high52Week: { type: Number, default: 1000 },
    low52Week: { type: Number, default: 1000 },
    constituents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
    constituentCount: { type: Number, default: 0 },
    sharesOutstanding: { type: Number, default: 1000000 },
    performance: [
      {
        tick: { type: Number },
        value: { type: Number },
        constituents: { type: Number },
      },
    ],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

stockIndexSchema.index({ type: 1 });
stockIndexSchema.index({ active: 1 });

export default mongoose.model('StockIndex', stockIndexSchema);
