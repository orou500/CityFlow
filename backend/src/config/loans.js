/**
 * Flexible bank loan configuration.
 *
 * Interest-rate model (all premiums are additive percentage points on top of
 * the product base rate scaled by the existing credit-score multiplier):
 *
 *   annualRate = clamp(
 *     baseRate × creditMultiplier
 *     + amountPremium(loan / netWorth)
 *     + durationPremium(months)
 *     + debtPremium(existingDebt / netWorth)
 *     + repaymentHistoryPremium,
 *     minAnnualRate,
 *     maxAnnualRate
 *   )
 *
 * All premium tables are configuration — never hardcoded in calculation code.
 * Approval uses the existing banking rules (product credit requirement,
 * product min/max principal, maxDebt = netWorth × credit multiplier) plus an
 * excessive-leverage guard.
 */

export const LOAN_CONFIG = {
  // Global duration bounds (months = game ticks)
  minMonths: 6,
  maxMonths: 84,

  // Per-product duration ranges (extends the legacy preset lists)
  PRODUCT_DURATION_RANGES: {
    personal: { min: 6, max: 36 },
    mortgage: { min: 12, max: 84 },
    business: { min: 12, max: 60 },
    line_of_credit: { min: 6, max: 12 },
  },

  // Rate caps (annual)
  minAnnualRate: 0.025,
  maxAnnualRate: 0.25,

  // Loan-to-net-worth premium: ratio = amount / netWorth
  amountPremiums: [
    { maxRatio: 0.1, premium: 0.0 },
    { maxRatio: 0.25, premium: 0.001 },
    { maxRatio: 0.5, premium: 0.0025 },
    { maxRatio: 0.75, premium: 0.005 },
    { maxRatio: 1.0, premium: 0.008 },
    { maxRatio: Number.POSITIVE_INFINITY, premium: 0.01 },
  ],

  // Duration premium anchors (interpolated linearly between anchors)
  durationPremiums: [
    { months: 12, premium: 0.0 },
    { months: 24, premium: 0.002 },
    { months: 36, premium: 0.004 },
    { months: 48, premium: 0.007 },
    { months: 60, premium: 0.01 },
    { months: 72, premium: 0.014 },
    { months: 84, premium: 0.018 },
  ],

  // Existing-debt-to-net-worth premium: ratio = existingDebt / netWorth
  debtPremiums: [
    { maxRatio: 0.3, premium: 0.0 },
    { maxRatio: 0.5, premium: 0.0025 },
    { maxRatio: 0.75, premium: 0.005 },
    { maxRatio: 1.0, premium: 0.01 },
    { maxRatio: 1.5, premium: 0.015 },
  ],

  // Reject when the player is already leveraged beyond this multiple of net worth
  maxDebtToNetWorth: 1.5,

  // Repayment-history premiums (from existing loan/credit data — no new debt system)
  history: {
    goodHistoryBonus: -0.003, // ≥ goodHistoryMinCompleted meaningful repayments and zero missed payments
    badHistoryPenalty: 0.005, // ≥ badHistoryMinMissed total missed payments
    defaultPenalty: 0.01, // any prior default on record
    goodHistoryMinCompleted: 2,
    badHistoryMinMissed: 3,
  },

  // Income proxy — matches the existing debt-to-income proxy in creditScore.js
  incomeFromBalanceRatio: 0.05,
  minMonthlyIncome: 1000,
};

/** Linear interpolation of a duration premium from the anchor table. */
export function durationPremiumForMonths(months) {
  const table = LOAN_CONFIG.durationPremiums;
  if (months <= table[0].months) return table[0].premium;
  if (months >= table[table.length - 1].months) return table[table.length - 1].premium;
  for (let i = 1; i < table.length; i++) {
    const hi = table[i];
    const lo = table[i - 1];
    if (months <= hi.months) {
      const t = (months - lo.months) / (hi.months - lo.months);
      return lo.premium + (hi.premium - lo.premium) * t;
    }
  }
  return table[table.length - 1].premium;
}

/** Amount premium for the given loan/netWorth ratio. */
export function amountPremiumForRatio(ratio) {
  for (const row of LOAN_CONFIG.amountPremiums) {
    if (ratio <= row.maxRatio) return row.premium;
  }
  return LOAN_CONFIG.amountPremiums[LOAN_CONFIG.amountPremiums.length - 1].premium;
}

/** Existing-debt premium for the given debt/netWorth ratio. */
export function debtPremiumForRatio(ratio) {
  for (const row of LOAN_CONFIG.debtPremiums) {
    if (ratio <= row.maxRatio) return row.premium;
  }
  return LOAN_CONFIG.debtPremiums[LOAN_CONFIG.debtPremiums.length - 1].premium;
}
