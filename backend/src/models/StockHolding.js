import mongoose from 'mongoose';

const stockHoldingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    shares: { type: Number, required: true, min: 0 },
    avgBuyPrice: { type: Number, required: true },
  },
  { timestamps: true },
);

stockHoldingSchema.index({ userId: 1, companyId: 1 }, { unique: true });
stockHoldingSchema.index({ userId: 1 });

export default mongoose.model('StockHolding', stockHoldingSchema);
