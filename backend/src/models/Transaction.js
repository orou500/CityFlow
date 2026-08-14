import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateCompany', default: null },
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
        'grade_upgrade',
        'improvement',
        'development',
        'period_bonus',
        'login',
        'season_reward',
        'sizops_welcome',
      ],
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Transaction', transactionSchema);
