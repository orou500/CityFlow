import mongoose from 'mongoose';

const indexHoldingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    indexId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockIndex', required: true },
    shares: { type: Number, required: true, min: 0 },
    avgBuyPrice: { type: Number, required: true },
  },
  { timestamps: true },
);

indexHoldingSchema.index({ userId: 1, indexId: 1 }, { unique: true });
indexHoldingSchema.index({ userId: 1 });

export default mongoose.model('IndexHolding', indexHoldingSchema);
