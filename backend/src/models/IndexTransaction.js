import mongoose from 'mongoose';

const indexTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    indexId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockIndex', required: true },
    type: { type: String, enum: ['buy', 'sell'], required: true },
    shares: { type: Number, required: true },
    price: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { timestamps: true },
);

indexTransactionSchema.index({ userId: 1 });
indexTransactionSchema.index({ indexId: 1 });

export default mongoose.model('IndexTransaction', indexTransactionSchema);
