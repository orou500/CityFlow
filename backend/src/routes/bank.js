import { Router } from 'express';
import Loan from '../models/Loan.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Transaction from '../models/Transaction.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/summary', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const properties = await Property.find({ ownerId: user._id });
    const loans = await Loan.find({ userId: user._id, active: true });
    const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const netWorth = user.balance + propertyValue;
    const totalDebt = loans.reduce((sum, l) => sum + l.remainingBalance, 0);
    const maxLoan = Math.round(netWorth * 0.7);
    res.json({ balance: user.balance, netWorth, totalDebt, maxLoan, loanCount: loans.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const LOAN_OPTIONS = [
  { principal: 50000, durationTicks: 12, interestRate: 0.04 },
  { principal: 100000, durationTicks: 24, interestRate: 0.05 },
  { principal: 250000, durationTicks: 36, interestRate: 0.055 },
  { principal: 500000, durationTicks: 48, interestRate: 0.06 },
];

function computePayment(principal, rate, ticks) {
  const totalInterest = principal * rate;
  const total = principal + totalInterest;
  return Math.ceil(total / ticks);
}

router.get('/options', (req, res) => {
  const options = LOAN_OPTIONS.map(o => {
    const totalInterest = Math.round(o.principal * o.interestRate);
    return {
      ...o,
      totalInterest,
      totalRepayment: o.principal + totalInterest,
      paymentPerTick: computePayment(o.principal, o.interestRate, o.durationTicks),
    };
  });
  res.json(options);
});

router.get('/my', authenticate, async (req, res) => {
  const loans = await Loan.find({ userId: req.user._id, active: true });
  res.json(loans);
});

router.post('/apply', authenticate, async (req, res) => {
  try {
    const { principal, durationTicks } = req.body;

    const option = LOAN_OPTIONS.find(o => o.principal === principal && o.durationTicks === durationTicks);
    if (!option) {
      return res.status(400).json({ error: 'Invalid loan option' });
    }

    const user = await User.findById(req.user._id).populate('ownedProperties');
    const properties = await Property.find({ ownerId: user._id });
    const netWorth = user.balance + properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const maxLoan = Math.round(netWorth * 0.7);

    if (principal > maxLoan) {
      return res.status(400).json({
        error: `Maximum loan amount is 70% of net worth ($${maxLoan.toLocaleString()}). Your net worth: $${netWorth.toLocaleString()}`,
      });
    }

    const paymentPerTick = computePayment(principal, option.interestRate, durationTicks);

    const loan = await Loan.create({
      userId: user._id,
      principal,
      remainingBalance: principal + Math.round(principal * option.interestRate),
      interestRate: option.interestRate,
      durationTicks,
      ticksRemaining: durationTicks,
      paymentPerTick,
      active: true,
    });

    user.balance += principal;
    await user.save();

    await Transaction.create({
      buyerId: user._id,
      price: principal,
      type: 'loan',
    });

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

    res.json({ loan, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
