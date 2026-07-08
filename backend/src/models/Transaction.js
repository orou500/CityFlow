import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    price: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        'buy',
        'sell',
        'rent',
        'loan',
        'loan_payment',
        'loan_repay',
        'penalty',
        'repossess',
        'construction',
        'upgrade',
      ],
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Transaction', transactionSchema);
