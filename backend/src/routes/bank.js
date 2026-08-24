import { Router } from 'express';
import Loan from '../models/Loan.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Transaction from '../models/Transaction.js';
import CreditScoreHistory from '../models/CreditScoreHistory.js';
import { authenticate } from '../middleware/auth.js';
import { awardXp } from '../utils/leveling.js';
import { onLoanAction } from '../utils/cacheInvalidation.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import { trackEvent, EVENTS } from '../utils/analytics.js';
import { acquireLock, releaseLock } from '../utils/redisLock.js';
import {
  getLoanProducts,
  getInterestRateForScore,
  getCreditScoreTier,
  getDebtToIncomeRatio,
  getLoanMultiplier,
} from '../engine/creditScore.js';
import { calculateLoanOffer, computeLendingNetWorth } from '../engine/loanOffers.js';

const router = Router();

function computePayment(principal, rate, ticks) {
  const totalInterest = principal * rate;
  const total = principal + totalInterest;
  return Math.ceil(total / ticks);
}

// Per-process mutex fallback so loan applications serialize even without
// Redis (single-replica deployments and the test environment). Combined with
// the Redis lock (multi-replica) and a post-create aggregate re-check, two
// simultaneous requests can never bypass the borrowing limit.
const loanMutexes = new Map();

async function withUserLoanMutex(userId, fn) {
  // Key on the string form — each request carries its own ObjectId instance,
  // and Map identity lookup would otherwise miss.
  const key = userId.toString();
  const previous = loanMutexes.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  loanMutexes.set(key, gate);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (loanMutexes.get(key) === gate) loanMutexes.delete(key);
  }
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
    // Borrowing capacity is driven by lending net worth (borrowed cash cannot
    // manufacture capacity), matching the flexible-loan offer engine.
    const lendingNetWorth = computeLendingNetWorth(user.balance, propertyValue, totalDebt);

    res.json({
      balance: user.balance,
      netWorth,
      lendingNetWorth,
      totalDebt,
      totalMonthlyPayment,
      maxLoan: Math.round(Math.max(1, lendingNetWorth) * getLoanMultiplier(creditScore)),
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
          minMonths: product.minMonths,
          maxMonths: product.maxMonths,
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

/**
 * Live offer preview — the authoritative, server-computed terms for the
 * selected amount + duration. The frontend renders this as the loan summary;
 * the client never computes rates itself.
 */
router.get('/offer-preview', authenticate, async (req, res) => {
  try {
    const { productId, amount, durationMonths } = req.query;
    const offer = await calculateLoanOffer({
      userId: req.user._id,
      productId,
      amount: Number(amount),
      durationMonths: Number(durationMonths),
    });

    if (!offer.approved) {
      return res.status(200).json(offer);
    }
    res.json(offer);
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
    const { principal, productId } = req.body;
    // `durationMonths` is the canonical field; `durationTicks` remains
    // accepted for backward compatibility (1 month = 1 tick).
    const durationMonths = Number(req.body.durationMonths ?? req.body.durationTicks);
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ── Server-authoritative offer ─────────────────────────────────────────
    // The client never supplies the rate; every term is recomputed here from
    // live financial data.
    const offer = await calculateLoanOffer({
      userId,
      productId,
      amount: Number(principal),
      durationMonths,
    });

    if (!offer.approved) {
      return res.status(400).json({ error: offer.reason, offer });
    }

    const { interestRate, monthlyPayment, totalRepayment, totalInterest, riskLevel } = offer;

    // ── Concurrency guard ──────────────────────────────────────────────────
    // Redis lock (multi-replica) + in-process mutex (single replica/tests).
    const lockOwner = await acquireLock(`loan:apply:${userId}`, 15000);
    const applyFn = async () => {
      // Re-verify inside the lock so a concurrent request cannot have changed
      // the debt picture since the offer was computed.
      const verified = await calculateLoanOffer({
        userId,
        productId,
        amount: Number(principal),
        durationMonths,
      });
      if (!verified.approved) {
        return res.status(400).json({ error: verified.reason, offer: verified });
      }
      if (verified.interestRate !== offer.interestRate || verified.monthlyPayment !== offer.monthlyPayment) {
        return res.status(400).json({
          error: 'Loan terms changed, please review the updated offer',
          offer: verified,
        });
      }

      // Credit balance first, then create the loan; refund the balance if any
      // step fails (same rollback pattern as company treasury operations).
      user.balance += offer.amount;
      await user.save();

      let loan;
      try {
        loan = await Loan.create({
          userId,
          type: productId,
          principal: offer.amount,
          remainingBalance: offer.amount,
          interestRate,
          durationTicks: offer.durationMonths,
          ticksRemaining: offer.durationMonths,
          paymentPerTick: monthlyPayment,
          active: true,
          creditScoreAtApply: offer.creditScore,
          durationMonths: offer.durationMonths,
          monthlyPayment,
          totalRepayment,
          totalInterest,
          riskLevel,
          amortized: true,
          monthlyInterestRate: Math.round((interestRate / 12) * 100000) / 100000,
        });
      } catch (loanErr) {
        user.balance -= offer.amount;
        await user.save();
        throw loanErr;
      }

      // Post-create aggregate re-check (belt & braces for multi-replica
      // without Redis): total outstanding debt must stay within the cap.
      const activeLoans = await Loan.find({ userId, active: true }).select('remainingBalance').lean();
      const totalDebt = activeLoans.reduce((s, l) => s + (l.remainingBalance || 0), 0);
      if (totalDebt > offer.maxDebt) {
        await Loan.deleteOne({ _id: loan._id });
        user.balance -= offer.amount;
        await user.save();
        return res.status(400).json({
          error: `Maximum total debt is $${offer.maxDebt.toLocaleString()} for your credit tier`,
          offer,
        });
      }

      await Transaction.create({
        buyerId: user._id,
        price: offer.amount,
        type: 'loan',
      });

      await awardXp(user, 5, 'loan_apply');
      user.lifetimeStats.totalLoansTaken += 1;
      await user.save();

      await onLoanAction(user._id);
      trackEvent(EVENTS.LOAN_APPLIED, {
        userId: user._id,
        principal: offer.amount,
        durationMonths: offer.durationMonths,
      });

      await processPlayerProgress(user._id, 'loan_take', { skipXp: true });

      const loans = await Loan.find({ userId: user._id, active: true });

      res.json({ loan, balance: user.balance, loans, offer });
    };

    try {
      await withUserLoanMutex(userId, applyFn);
    } finally {
      if (lockOwner) await releaseLock(`loan:apply:${userId}`, lockOwner);
    }
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

    await onLoanAction(user._id);
    trackEvent(EVENTS.LOAN_REPAID, { userId: user._id, loanId, amount: repayAmount });

    await processPlayerProgress(user._id, 'loan_repay', { skipXp: true });

    res.json({ loan, balance: user.balance, creditScore: user.creditScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
