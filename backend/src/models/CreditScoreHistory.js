import mongoose from 'mongoose';

const creditScoreHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tick: { type: Number, required: true },
    score: { type: Number, required: true },
    change: { type: Number, default: 0 },
    reason: {
      type: String,
      enum: [
        'on_time_payment',
        'missed_payment',
        'loan_repaid',
        'new_loan',
        'high_debt_ratio',
        'low_debt_ratio',
        'net_worth_growth',
        'default',
      ],
      required: true,
    },
  },
  { timestamps: true },
);

creditScoreHistorySchema.index({ userId: 1, tick: -1 });

export default mongoose.model('CreditScoreHistory', creditScoreHistorySchema);
