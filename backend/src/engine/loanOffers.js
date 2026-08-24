import User from '../models/User.js';
import Loan from '../models/Loan.js';
import CreditScoreHistory from '../models/CreditScoreHistory.js';
import Property from '../models/Property.js';
import { getLoanProducts, getInterestRateForScore, getLoanMultiplier } from './creditScore.js';
import { LOAN_CONFIG, durationPremiumForMonths, amountPremiumForRatio, debtPremiumForRatio } from '../config/loans.js';

/**
 * Flexible bank loan offers — centralized, server-authoritative pricing.
 *
 * The route passes only the player identity and their request; every input to
 * the pricing model (credit score, debt, net worth, income, repayment
 * history) is loaded from MongoDB inside this function. Client-supplied
 * interest rates are never used.
 */

/**
 * Lending net worth — the value used for borrowing capacity.
 *
 * Borrowed cash must never manufacture additional borrowing capacity, so the
 * liquid portion of net worth only counts up to the amount NOT already owed:
 *
 *   lendingNetWorth = propertyValue + max(0, balance − existingDebt)
 *
 * A loan credits `balance` and debits `existingDebt` by the same principal,
 * so borrowing cannot move this value. Converting borrowed cash into real
 * property raises propertyValue (legitimate leverage); repaying debt restores
 * liquid capacity. Uses only existing financial data — no new system.
 */
export function computeLendingNetWorth(balance, propertyValue, existingDebt) {
  return propertyValue + Math.max(0, balance - (existingDebt || 0));
}

/** Standard amortization: monthly payment for an annual rate over `months`. */
export function computeAmortizedPayment(principal, annualRate, months) {
  if (!months || months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return Math.round(principal / months);
  const factor = Math.pow(1 + r, months);
  return Math.round((principal * r * factor) / (factor - 1));
}

export function computeAmortization(principal, annualRate, months) {
  const monthlyPayment = computeAmortizedPayment(principal, annualRate, months);
  const totalRepayment = monthlyPayment * months;
  return {
    monthlyPayment,
    totalRepayment,
    totalInterest: Math.max(0, totalRepayment - principal),
  };
}

/** Pure pricing core — unit-testable without a database. */
export function calculateOfferCore({
  amount,
  durationMonths,
  creditScore,
  existingDebt,
  netWorth,
  repaymentHistory,
  product,
}) {
  const reasons = [];

  const fail = (reason) => ({ approved: false, reason, reasons: [...reasons, reason] });

  if (!product) return fail('Invalid loan product');

  const roundedAmount = Math.round(amount);
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) return fail('Invalid loan amount');

  const months = durationMonths;
  if (!Number.isInteger(months) || !Number.isFinite(months)) return fail('Invalid loan duration');
  const minMonths = Math.max(LOAN_CONFIG.minMonths, product.minMonths || 6);
  const maxMonths = Math.min(LOAN_CONFIG.maxMonths, product.maxMonths || 84);
  if (months < minMonths || months > maxMonths) {
    return fail(`Loan duration must be between ${minMonths} and ${maxMonths} months`);
  }

  if (creditScore < product.creditRequirement) return fail('Credit score too low for this product');

  if (roundedAmount < product.minPrincipal || roundedAmount > product.maxPrincipal) {
    return fail(`Amount must be between ${product.minPrincipal} and ${product.maxPrincipal}`);
  }

  const safeNetWorth = Math.max(1, netWorth || 0);
  const existingDebtSafe = existingDebt || 0;

  // Excessive existing leverage — reject before pricing.
  if (existingDebtSafe > safeNetWorth * LOAN_CONFIG.maxDebtToNetWorth) {
    return fail('Excessive existing leverage');
  }

  // Existing borrowing cap: total debt (incl. this loan) ≤ netWorth × credit multiplier.
  const maxDebt = Math.round(safeNetWorth * getLoanMultiplier(creditScore));
  if (existingDebtSafe + roundedAmount > maxDebt) {
    return fail('Insufficient borrowing capacity');
  }

  // ── Pricing ──────────────────────────────────────────────────────────────
  const baseCreditRate = getInterestRateForScore(product.baseInterestRate, creditScore);
  const loanRatio = roundedAmount / safeNetWorth;
  const debtRatio = existingDebtSafe / safeNetWorth;

  let rate =
    baseCreditRate +
    amountPremiumForRatio(loanRatio) +
    durationPremiumForMonths(months) +
    debtPremiumForRatio(debtRatio);

  // Repayment history (existing data — no new credit system).
  const { meaningfulCompleted, totalMissed, defaulted } = repaymentHistory || {};
  if (defaulted) rate += LOAN_CONFIG.history.defaultPenalty;
  else if (totalMissed >= LOAN_CONFIG.history.badHistoryMinMissed) rate += LOAN_CONFIG.history.badHistoryPenalty;
  else if (meaningfulCompleted >= LOAN_CONFIG.history.goodHistoryMinCompleted && (totalMissed || 0) === 0) {
    rate += LOAN_CONFIG.history.goodHistoryBonus;
  }

  rate = Math.round(Math.max(LOAN_CONFIG.minAnnualRate, Math.min(LOAN_CONFIG.maxAnnualRate, rate)) * 10000) / 10000;

  const { monthlyPayment, totalRepayment, totalInterest } = computeAmortization(roundedAmount, rate, months);
  const riskLevel = calculateRiskLevel(rate, loanRatio, debtRatio);

  return {
    approved: true,
    interestRate: rate,
    monthlyPayment,
    totalRepayment,
    totalInterest,
    riskLevel,
    maxPrincipal: product.maxPrincipal,
    minPrincipal: product.minPrincipal,
    minMonths,
    maxMonths,
    amount: roundedAmount,
    durationMonths: months,
  };
}

export function calculateRiskLevel(annualRate, loanToNetWorth, debtToNetWorth) {
  const totalLeverage = loanToNetWorth + debtToNetWorth;
  if (totalLeverage > 1.0 || annualRate >= 0.18) return 'VERY_HIGH';
  if (loanToNetWorth > 0.75 || totalLeverage > 0.75 || annualRate >= 0.12) return 'HIGH';
  if (loanToNetWorth > 0.5 || totalLeverage > 0.5 || annualRate >= 0.07) return 'MODERATE';
  return 'LOW';
}

/**
 * Load the player's repayment history from existing loan/credit data.
 */
export async function getRepaymentHistory(userId) {
  const [allLoans, defaults] = await Promise.all([
    Loan.find({ userId }).select('active ticksPaid durationTicks missedPayments').lean(),
    CreditScoreHistory.countDocuments({ userId, reason: 'default' }),
  ]);

  const meaningfulCompleted = allLoans.filter(
    (l) => !l.active && l.ticksPaid >= Math.ceil((l.durationTicks || 1) / 2),
  ).length;
  const totalMissed = allLoans.reduce((s, l) => s + (l.missedPayments || 0), 0);

  return { meaningfulCompleted, totalMissed, defaulted: defaults > 0 };
}

/**
 * Full server-authoritative offer for a user request.
 * Loads all financial profile data from MongoDB.
 */
export async function calculateLoanOffer({ userId, productId, amount, durationMonths }) {
  const user = await User.findById(userId);
  if (!user) return { approved: false, reason: 'User not found', reasons: ['User not found'] };

  const properties = await PropertyValueLoader(user);
  const grossNetWorth = user.balance + properties;
  const creditScore = user.creditScore || 650;

  const activeLoans = await Loan.find({ userId, active: true }).select('remainingBalance').lean();
  const existingDebt = activeLoans.reduce((s, l) => s + (l.remainingBalance || 0), 0);

  // Borrowing capacity is driven by lending net worth, NOT gross net worth —
  // borrowed cash must not create new borrowing capacity (anti-compounding).
  const lendingNetWorth = computeLendingNetWorth(user.balance, properties, existingDebt);

  const product = getLoanProducts(creditScore, lendingNetWorth).find((p) => p.id === productId);
  if (!product) return { approved: false, reason: 'Invalid loan product', reasons: ['Invalid loan product'] };

  const repaymentHistory = await getRepaymentHistory(userId);

  const offer = calculateOfferCore({
    amount,
    durationMonths,
    creditScore,
    existingDebt,
    netWorth: lendingNetWorth,
    repaymentHistory,
    product,
  });

  return {
    ...offer,
    creditScore,
    existingDebt,
    netWorth: grossNetWorth,
    lendingNetWorth,
    maxDebt: Math.round(Math.max(1, lendingNetWorth) * getLoanMultiplier(creditScore)),
  };
}

async function PropertyValueLoader(user) {
  const properties = await Property.find({ ownerId: user._id }).select('currentPrice').lean();
  return properties.reduce((s, p) => s + (p.currentPrice || 0), 0);
}

export { getLoanMultiplier };
