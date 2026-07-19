import User from '../models/User.js';
import Loan from '../models/Loan.js';
import CreditScoreHistory from '../models/CreditScoreHistory.js';

const SCORE_MIN = 300;
const SCORE_MAX = 850;
const UPDATE_INTERVAL = 10;

function clampScore(score) {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(score)));
}

function calculateCreditScore(user, activeLoans, propertyCount, completedLoanCount) {
  let score = user.creditScore || 650;
  const logs = [];

  const totalDebt = activeLoans.reduce((s, l) => s + l.remainingBalance, 0);
  const netWorth = user.balance + propertyCount * 50000;
  const debtRatio = netWorth > 0 ? totalDebt / netWorth : 1;

  const totalMissed = activeLoans.reduce((s, l) => s + (l.missedPayments || 0), 0);
  if (totalMissed === 0 && activeLoans.length > 0) {
    score += 4;
    logs.push({ change: 4, reason: 'on_time_payment' });
  }
  if (totalMissed > 0) {
    const penalty = Math.min(totalMissed * 8, 40);
    score -= penalty;
    logs.push({ change: -penalty, reason: 'missed_payment' });
  }

  if (completedLoanCount > 0) {
    const repayBonus = Math.min(completedLoanCount * 10, 50);
    score += repayBonus;
    logs.push({ change: repayBonus, reason: 'loan_repaid' });
  }

  if (activeLoans.length > 0) {
    score += Math.min(activeLoans.length * 3, 15);
    logs.push({ change: Math.min(activeLoans.length * 3, 15), reason: 'new_loan' });
  }

  if (debtRatio > 0.6) {
    score -= 10;
    logs.push({ change: -10, reason: 'high_debt_ratio' });
  } else if (debtRatio < 0.3) {
    score += 8;
    logs.push({ change: 8, reason: 'low_debt_ratio' });
  }

  if (netWorth > 200000) {
    const growthBonus = Math.min(Math.floor((netWorth - 200000) / 100000) * 4, 20);
    score += growthBonus;
    logs.push({ change: growthBonus, reason: 'net_worth_growth' });
  }

  return { score: clampScore(score), logs };
}

export async function updateCreditScores(tickNumber) {
  const users = await User.find({ creditScoreUpdatedTick: { $lt: tickNumber - UPDATE_INTERVAL } }).select(
    '_id creditScore balance ownedProperties lifetimeStats',
  );

  const results = [];

  for (const user of users) {
    const activeLoans = await Loan.find({ userId: user._id, active: true });
    const completedLoans = await Loan.find({ userId: user._id, active: false });
    const meaningfulCompleted = completedLoans.filter(
      (l) => l.ticksPaid >= Math.ceil(l.durationTicks / 2),
    ).length;
    const propertyCount = user.ownedProperties.length;

    const { score, logs } = calculateCreditScore(user, activeLoans, propertyCount, meaningfulCompleted);
    const change = score - (user.creditScore || 650);

    if (change !== 0 || logs.length > 0) {
      user.creditScore = score;
      user.creditScoreUpdatedTick = tickNumber;
      await user.save();

      for (const log of logs) {
        await CreditScoreHistory.create({
          userId: user._id,
          tick: tickNumber,
          score,
          change: log.change,
          reason: log.reason,
        });
      }

      results.push({ userId: user._id, score, change, logs: logs.length });
    }
  }

  return results;
}

export function getCreditScoreTier(score) {
  if (score >= 800) return { tier: 'excellent', label: 'Excellent', color: '#10b981' };
  if (score >= 740) return { tier: 'very_good', label: 'Very Good', color: '#22c55e' };
  if (score >= 670) return { tier: 'good', label: 'Good', color: '#84cc16' };
  if (score >= 580) return { tier: 'fair', label: 'Fair', color: '#eab308' };
  if (score >= 500) return { tier: 'poor', label: 'Poor', color: '#f97316' };
  return { tier: 'very_poor', label: 'Very Poor', color: '#ef4444' };
}

export function getInterestRateForScore(baseRate, score) {
  if (score >= 800) return baseRate * 0.7;
  if (score >= 740) return baseRate * 0.8;
  if (score >= 670) return baseRate * 0.9;
  if (score >= 580) return baseRate * 1.1;
  if (score >= 500) return baseRate * 1.3;
  return baseRate * 1.6;
}

export function getDebtToIncomeRatio(user, activeLoans) {
  const totalMonthlyPayment = activeLoans.reduce((s, l) => s + l.paymentPerTick, 0);
  const estimatedMonthlyIncome = Math.max(user.balance * 0.05, 1000);
  return totalMonthlyPayment / estimatedMonthlyIncome;
}

export function getLoanProducts(score, netWorth) {
  const products = [];

  const personalLoanMax = Math.round(netWorth * getLoanMultiplier(score) * 0.5);
  if (personalLoanMax >= 10000) {
    products.push({
      id: 'personal',
      name: 'Personal Loan',
      minPrincipal: 10000,
      maxPrincipal: personalLoanMax,
      durations: [6, 12, 24],
      baseInterestRate: 0.06,
      creditRequirement: 400,
    });
  }

  const mortgageMax = Math.round(netWorth * getLoanMultiplier(score) * 1.0);
  if (mortgageMax >= 50000 && score >= 600) {
    products.push({
      id: 'mortgage',
      name: 'Mortgage',
      minPrincipal: 50000,
      maxPrincipal: mortgageMax,
      durations: [24, 36, 48, 60],
      baseInterestRate: 0.035,
      creditRequirement: 600,
    });
  }

  const businessMax = Math.round(netWorth * getLoanMultiplier(score) * 1.5);
  if (businessMax >= 100000 && score >= 650) {
    products.push({
      id: 'business',
      name: 'Business Loan',
      minPrincipal: 100000,
      maxPrincipal: businessMax,
      durations: [12, 24, 36, 48],
      baseInterestRate: 0.045,
      creditRequirement: 650,
    });
  }

  if (score >= 700) {
    const lineMax = Math.round(netWorth * getLoanMultiplier(score) * 0.3);
    if (lineMax >= 5000) {
      products.push({
        id: 'line_of_credit',
        name: 'Line of Credit',
        minPrincipal: 5000,
        maxPrincipal: lineMax,
        durations: [6, 12],
        baseInterestRate: 0.05,
        creditRequirement: 700,
      });
    }
  }

  return products;
}

function getLoanMultiplier(score) {
  if (score >= 800) return 2.0;
  if (score >= 740) return 1.5;
  if (score >= 670) return 1.0;
  if (score >= 580) return 0.6;
  if (score >= 500) return 0.3;
  return 0.1;
}
