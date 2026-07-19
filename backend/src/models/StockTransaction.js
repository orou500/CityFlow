import mongoose from 'mongoose';

const stockTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    type: {
      type: String,
      enum: ['buy', 'sell'],
      required: true,
    },
    shares: { type: Number, required: true },
    price: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { timestamps: true },
);

stockTransactionSchema.index({ userId: 1, createdAt: -1 });
stockTransactionSchema.index({ companyId: 1 });

export default mongoose.model('StockTransaction', stockTransactionSchema);
