import mongoose from 'mongoose';

const stockMarketEventSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    tick: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        'dividend_paid',
        'all_time_high',
        'ipo_launch',
        'price_surge',
        'price_drop',
        'city_expansion',
        'delisting',
        'milestone',
        'high_volume',
      ],
      required: true,
    },
    severity: { type: String, enum: ['info', 'positive', 'negative', 'major'], default: 'info' },
    headline: { type: String, required: true },
    description: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

stockMarketEventSchema.index({ companyId: 1, tick: -1 });
stockMarketEventSchema.index({ tick: -1 });
stockMarketEventSchema.index({ createdAt: -1 });

export default mongoose.model('StockMarketEvent', stockMarketEventSchema);
