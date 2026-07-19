import express from 'express';
import Company from '../models/Company.js';
import StockHolding from '../models/StockHolding.js';
import StockTransaction from '../models/StockTransaction.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.post('/buy', async (req, res) => {
  try {
    const { companyId, shares } = req.body;
    if (!companyId || !shares || shares <= 0) {
      return res.status(400).json({ error: 'Invalid companyId or shares' });
    }

    const company = await Company.findById(companyId);
    if (!company || !company.active) {
      return res.status(404).json({ error: 'Company not found or inactive' });
    }

    const totalCost = shares * company.sharePrice;
    const user = await User.findById(req.user._id);
    if (user.balance < totalCost) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    user.balance -= totalCost;
    await user.save();

    let holding = await StockHolding.findOne({ userId: req.user._id, companyId });
    if (holding) {
      const totalShares = holding.shares + shares;
      holding.avgBuyPrice = (holding.shares * holding.avgBuyPrice + shares * company.sharePrice) / totalShares;
      holding.shares = totalShares;
      await holding.save();
    } else {
      holding = await StockHolding.create({
        userId: req.user._id,
        companyId,
        shares,
        avgBuyPrice: company.sharePrice,
      });
    }

    await StockTransaction.create({
      userId: req.user._id,
      companyId,
      type: 'buy',
      shares,
      price: company.sharePrice,
      total: totalCost,
    });

    res.json({
      holding: {
        shares: holding.shares,
        avgBuyPrice: holding.avgBuyPrice,
        currentValue: holding.shares * company.sharePrice,
      },
      balance: user.balance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sell', async (req, res) => {
  try {
    const { companyId, shares } = req.body;
    if (!companyId || !shares || shares <= 0) {
      return res.status(400).json({ error: 'Invalid companyId or shares' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const holding = await StockHolding.findOne({ userId: req.user._id, companyId });
    if (!holding || holding.shares < shares) {
      return res.status(400).json({ error: 'Insufficient shares' });
    }

    const totalRevenue = shares * company.sharePrice;
    holding.shares -= shares;

    if (holding.shares <= 0) {
      await StockHolding.deleteOne({ _id: holding._id });
    } else {
      await holding.save();
    }

    const user = await User.findById(req.user._id);
    user.balance += totalRevenue;
    await user.save();

    await StockTransaction.create({
      userId: req.user._id,
      companyId,
      type: 'sell',
      shares,
      price: company.sharePrice,
      total: totalRevenue,
    });

    res.json({
      holding:
        holding.shares > 0
          ? {
              shares: holding.shares,
              avgBuyPrice: holding.avgBuyPrice,
              currentValue: holding.shares * company.sharePrice,
            }
          : null,
      balance: user.balance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const transactions = await StockTransaction.find({ userId: req.user._id })
      .populate('companyId', 'name ticker')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
