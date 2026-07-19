import express from 'express';
import StockIndex from '../models/StockIndex.js';
import IndexHolding from '../models/IndexHolding.js';
import IndexTransaction from '../models/IndexTransaction.js';
import User from '../models/User.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(optionalAuth);

router.get('/', async (req, res) => {
  try {
    const { type, sort } = req.query;
    const filter = { active: true };
    if (type) filter.type = type;

    let sortOpts = { value: -1 };
    if (sort === 'change') sortOpts = { dayChangePercent: -1 };
    else if (sort === 'name') sortOpts = { name: 1 };
    else if (sort === 'return') sortOpts = { totalReturn: -1 };

    const indexes = await StockIndex.find(filter).select('-performance -constituents').sort(sortOpts);

    res.json(indexes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/portfolio', authenticate, async (req, res) => {
  try {
    const holdings = await IndexHolding.find({ userId: req.user._id }).populate(
      'indexId',
      'name ticker type value dayChange dayChangePercent',
    );

    const portfolio = holdings
      .filter((h) => h.indexId)
      .map((h) => ({
        _id: h._id,
        index: h.indexId,
        shares: h.shares,
        avgBuyPrice: h.avgBuyPrice,
        currentValue: h.shares * h.indexId.value,
        costBasis: h.shares * h.avgBuyPrice,
        profitLoss: h.shares * (h.indexId.value - h.avgBuyPrice),
        profitLossPercent:
          h.avgBuyPrice > 0 ? Math.round(((h.indexId.value - h.avgBuyPrice) / h.avgBuyPrice) * 10000) / 100 : 0,
      }));

    const totalValue = portfolio.reduce((sum, h) => sum + h.currentValue, 0);
    const totalCost = portfolio.reduce((sum, h) => sum + h.costBasis, 0);

    res.json({ holdings: portfolio, totalValue, totalCost, totalPL: totalValue - totalCost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/market/overview', async (req, res) => {
  try {
    const indexes = await StockIndex.find({ active: true }).select(
      'name ticker type value dayChange dayChangePercent totalReturn constituentCount',
    );

    const byType = {};
    for (const idx of indexes) {
      if (!byType[idx.type]) byType[idx.type] = [];
      byType[idx.type].push(idx);
    }

    const totalMarketValue = indexes.reduce((s, i) => s + i.value * (i.constituentCount || 1), 0);
    const gainers = [...indexes].sort((a, b) => b.dayChangePercent - a.dayChangePercent).slice(0, 5);
    const losers = [...indexes].sort((a, b) => a.dayChangePercent - b.dayChangePercent).slice(0, 5);

    res.json({ totalMarketValue, byType, gainers, losers, totalIndexes: indexes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const idx = await StockIndex.findById(req.params.id).select('-performance');
    if (!idx) return res.status(404).json({ error: 'Index not found' });

    let userHolding = null;
    if (req.user) {
      const holding = await IndexHolding.findOne({ userId: req.user._id, indexId: idx._id });
      if (holding) {
        userHolding = {
          shares: holding.shares,
          avgBuyPrice: holding.avgBuyPrice,
          currentValue: holding.shares * idx.value,
          profitLoss: holding.shares * (idx.value - holding.avgBuyPrice),
        };
      }
    }

    res.json({ ...idx.toObject(), userHolding });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const idx = await StockIndex.findById(req.params.id).select('performance');
    if (!idx) return res.status(404).json({ error: 'Index not found' });
    res.json(idx.performance || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/constituents', async (req, res) => {
  try {
    const idx = await StockIndex.findById(req.params.id).select('constituents');
    if (!idx) return res.status(404).json({ error: 'Index not found' });

    const Company = (await import('../models/Company.js')).default;
    const companies = await Company.find({ _id: { $in: idx.constituents }, active: true })
      .select('name ticker sharePrice dayChangePercent marketCap industry')
      .sort({ marketCap: -1 });

    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/buy', authenticate, async (req, res) => {
  try {
    const { indexId, shares } = req.body;
    if (!indexId || !shares || shares <= 0) {
      return res.status(400).json({ error: 'Invalid indexId or shares' });
    }

    const idx = await StockIndex.findById(indexId);
    if (!idx || !idx.active) {
      return res.status(404).json({ error: 'Index not found or inactive' });
    }

    const totalCost = shares * idx.value;
    const user = await User.findById(req.user._id);
    if (user.balance < totalCost) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    user.balance -= totalCost;
    await user.save();

    let holding = await IndexHolding.findOne({ userId: req.user._id, indexId });
    if (holding) {
      const totalShares = holding.shares + shares;
      holding.avgBuyPrice = (holding.shares * holding.avgBuyPrice + shares * idx.value) / totalShares;
      holding.shares = totalShares;
      await holding.save();
    } else {
      holding = await IndexHolding.create({
        userId: req.user._id,
        indexId,
        shares,
        avgBuyPrice: idx.value,
      });
    }

    await IndexTransaction.create({
      userId: req.user._id,
      indexId,
      type: 'buy',
      shares,
      price: idx.value,
      total: totalCost,
    });

    res.json({
      holding: {
        shares: holding.shares,
        avgBuyPrice: holding.avgBuyPrice,
        currentValue: holding.shares * idx.value,
      },
      balance: user.balance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sell', authenticate, async (req, res) => {
  try {
    const { indexId, shares } = req.body;
    if (!indexId || !shares || shares <= 0) {
      return res.status(400).json({ error: 'Invalid indexId or shares' });
    }

    const idx = await StockIndex.findById(indexId);
    if (!idx) {
      return res.status(404).json({ error: 'Index not found' });
    }

    const holding = await IndexHolding.findOne({ userId: req.user._id, indexId });
    if (!holding || holding.shares < shares) {
      return res.status(400).json({ error: 'Insufficient shares' });
    }

    const totalRevenue = shares * idx.value;
    holding.shares -= shares;

    if (holding.shares <= 0) {
      await IndexHolding.deleteOne({ _id: holding._id });
    } else {
      await holding.save();
    }

    const user = await User.findById(req.user._id);
    user.balance += totalRevenue;
    await user.save();

    await IndexTransaction.create({
      userId: req.user._id,
      indexId,
      type: 'sell',
      shares,
      price: idx.value,
      total: totalRevenue,
    });

    res.json({
      holding:
        holding.shares > 0
          ? {
              shares: holding.shares,
              avgBuyPrice: holding.avgBuyPrice,
              currentValue: holding.shares * idx.value,
            }
          : null,
      balance: user.balance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/user/transactions', authenticate, async (req, res) => {
  try {
    const transactions = await IndexTransaction.find({ userId: req.user._id })
      .populate('indexId', 'name ticker')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
