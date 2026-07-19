import { Router } from 'express';
import Loan from '../models/Loan.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Transaction from '../models/Transaction.js';
import CreditScoreHistory from '../models/CreditScoreHistory.js';
import { authenticate } from '../middleware/auth.js';
import { awardXp } from '../utils/leveling.js';
import {
  getLoanProducts,
  getInterestRateForScore,
  getCreditScoreTier,
  getDebtToIncomeRatio,
} from '../engine/creditScore.js';

const router = Router();

function computePayment(principal, rate, ticks) {
  const totalInterest = principal * rate;
  const total = principal + totalInterest;
  return Math.ceil(total / ticks);
}

router.get('/summary', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const properties = await Property.find({ ownerId: user._id });
    const loans = await Loan.find({ userId: user._id, active: true });
    const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const stockValue = 0;
    const netWorth = user.balance + propertyValue + stockValue;
    const totalDebt = loans.reduce((sum, l) => sum + l.remainingBalance, 0);
    const totalMonthlyPayment = loans.reduce((sum, l) => sum + l.paymentPerTick, 0);
    const creditScore = user.creditScore || 650;
    const tier = getCreditScoreTier(creditScore);
    const dti = getDebtToIncomeRatio(user, loans);

    res.json({
      balance: user.balance,
      netWorth,
      totalDebt,
      totalMonthlyPayment,
      maxLoan: Math.round(netWorth * getLoanMultiplier(creditScore)),
      loanCount: loans.length,
      creditScore,
      creditTier: tier,
      debtToIncome: dti,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/options', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const properties = await Property.find({ ownerId: user._id });
    const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const netWorth = user.balance + propertyValue;
    const creditScore = user.creditScore || 650;

    const products = getLoanProducts(creditScore, netWorth);

    const options = [];
    for (const product of products) {
      if (creditScore < product.creditRequirement) continue;

      for (const duration of product.durations) {
        const rate = getInterestRateForScore(product.baseInterestRate, creditScore);
        const totalInterest = Math.round(product.maxPrincipal * rate);
        const payment = computePayment(product.maxPrincipal, rate, duration);

        options.push({
          productId: product.id,
          name: product.name,
          principal: product.maxPrincipal,
          minPrincipal: product.minPrincipal,
          durationTicks: duration,
          interestRate: rate,
          totalInterest,
          totalRepayment: product.maxPrincipal + totalInterest,
          paymentPerTick: payment,
          creditRequirement: product.creditRequirement,
        });
      }
    }

    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my', authenticate, async (req, res) => {
  const loans = await Loan.find({ userId: req.user._id, active: true });
  res.json(loans);
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const loans = await Loan.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(loans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/credit-history', authenticate, async (req, res) => {
  try {
    const history = await CreditScoreHistory.find({ userId: req.user._id }).sort({ tick: -1 }).limit(50);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/apply', authenticate, async (req, res) => {
  try {
    const { principal, durationTicks, productId } = req.body;

    const user = await User.findById(req.user._id).populate('ownedProperties');
    const properties = await Property.find({ ownerId: user._id });
    const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const netWorth = user.balance + propertyValue;
    const creditScore = user.creditScore || 650;

    const products = getLoanProducts(creditScore, netWorth);
    const product = products.find((p) => p.id === productId);
    if (!product) {
      return res.status(400).json({ error: 'Invalid loan product' });
    }

    if (creditScore < product.creditRequirement) {
      return res.status(400).json({
        error: `Credit score ${creditScore} too low. Required: ${product.creditRequirement}`,
      });
    }

    if (principal < product.minPrincipal || principal > product.maxPrincipal) {
      return res.status(400).json({
        error: `Loan amount must be between $${product.minPrincipal.toLocaleString()} and $${product.maxPrincipal.toLocaleString()}`,
      });
    }

    if (!product.durations.includes(durationTicks)) {
      return res.status(400).json({ error: 'Invalid loan duration' });
    }

    const rate = getInterestRateForScore(product.baseInterestRate, creditScore);
    const paymentPerTick = computePayment(principal, rate, durationTicks);
    const activeLoans = await Loan.find({ userId: user._id, active: true });
    const existingDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);

    const maxDebt = Math.round(netWorth * getLoanMultiplier(creditScore));
    if (existingDebt + principal > maxDebt) {
      return res.status(400).json({
        error: `Maximum total debt is $${maxDebt.toLocaleString()} for your credit tier`,
      });
    }

    const loan = await Loan.create({
      userId: user._id,
      type: productId,
      principal,
      remainingBalance: principal + Math.round(principal * rate),
      interestRate: rate,
      durationTicks,
      ticksRemaining: durationTicks,
      paymentPerTick,
      active: true,
      creditScoreAtApply: creditScore,
    });

    user.balance += principal;
    await user.save();

    await Transaction.create({
      buyerId: user._id,
      price: principal,
      type: 'loan',
    });

    await awardXp(user, 5, 'loan_apply');
    user.lifetimeStats.totalLoansTaken += 1;
    await user.save();

    const loans = await Loan.find({ userId: user._id, active: true });

    res.json({ loan, balance: user.balance, loans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/repay', authenticate, async (req, res) => {
  try {
    const { loanId, amount } = req.body;
    const loan = await Loan.findOne({ _id: loanId, userId: req.user._id, active: true });
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    const user = await User.findById(req.user._id);
    const repayAmount = Math.min(amount || loan.remainingBalance, loan.remainingBalance, user.balance);

    if (repayAmount <= 0) {
      return res.status(400).json({ error: 'Invalid repayment amount' });
    }

    user.balance -= repayAmount;
    loan.remainingBalance -= repayAmount;

    if (loan.remainingBalance <= 0) {
      loan.active = false;
      loan.remainingBalance = 0;
      loan.ticksRemaining = 0;
    }

    await user.save();
    await loan.save();

    await Transaction.create({
      buyerId: user._id,
      price: repayAmount,
      type: 'loan_repay',
    });

    await awardXp(user, 3, 'loan_repay');
    await user.save();

    res.json({ loan, balance: user.balance, creditScore: user.creditScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getLoanMultiplier(score) {
  if (score >= 800) return 2.0;
  if (score >= 740) return 1.5;
  if (score >= 670) return 1.0;
  if (score >= 580) return 0.6;
  if (score >= 500) return 0.3;
  return 0.1;
}

export default router;
