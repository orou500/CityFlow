import mongoose from 'mongoose';

const loanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateCompany', default: null },
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
    // Flexible-loan snapshot (immutable terms for loans created after the
    // dynamic-pricing upgrade). Existing loans leave these unset.
    durationMonths: { type: Number },
    monthlyPayment: { type: Number },
    totalRepayment: { type: Number },
    totalInterest: { type: Number },
    riskLevel: { type: String, enum: ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'] },
    amortized: { type: Boolean, default: false },
    monthlyInterestRate: { type: Number },
  },
  { timestamps: true },
);

export default mongoose.model('Loan', loanSchema);
