import mongoose from 'mongoose';

const loanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['personal', 'mortgage', 'business', 'line_of_credit'],
      default: 'personal',
    },
    principal: { type: Number, required: true },
    remainingBalance: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    durationTicks: { type: Number, required: true },
    ticksRemaining: { type: Number, required: true },
    paymentPerTick: { type: Number, required: true },
    missedPayments: { type: Number, default: 0 },
    ticksPaid: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    creditScoreAtApply: { type: Number, default: 650 },
  },
  { timestamps: true },
);

export default mongoose.model('Loan', loanSchema);
