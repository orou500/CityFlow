import express from 'express';
import Company from '../models/Company.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(optionalAuth);

router.get('/', async (req, res) => {
  try {
    const { industry, city, sort, search } = req.query;
    const filter = { active: true };
    if (industry) filter.industry = industry;
    if (city) filter.hqCityId = city;
    if (search) filter.name = { $regex: search, $options: 'i' };

    let sortOpts = { marketCap: -1 };
    if (sort === 'price') sortOpts = { sharePrice: -1 };
    else if (sort === 'change') sortOpts = { dayChangePercent: -1 };
    else if (sort === 'volume') sortOpts = { employees: -1 };
    else if (sort === 'name') sortOpts = { name: 1 };

    const companies = await Company.find(filter)
      .populate('hqCityId', 'name country')
      .sort(sortOpts)
      .select('-performance -expansionHistory');

    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/portfolio', async (req, res) => {
  try {
    const StockHolding = (await import('../models/StockHolding.js')).default;
    const holdings = await StockHolding.find({ userId: req.user._id }).populate(
      'companyId',
      'name ticker sharePrice dayChange dayChangePercent industry marketCap',
    );

    const portfolio = holdings
      .filter((h) => h.companyId)
      .map((h) => ({
        _id: h._id,
        company: h.companyId,
        shares: h.shares,
        avgBuyPrice: h.avgBuyPrice,
        currentValue: h.shares * h.companyId.sharePrice,
        costBasis: h.shares * h.avgBuyPrice,
        profitLoss: h.shares * (h.companyId.sharePrice - h.avgBuyPrice),
        profitLossPercent:
          h.avgBuyPrice > 0 ? Math.round(((h.companyId.sharePrice - h.avgBuyPrice) / h.avgBuyPrice) * 10000) / 100 : 0,
      }));

    const totalValue = portfolio.reduce((sum, h) => sum + h.currentValue, 0);
    const totalCost = portfolio.reduce((sum, h) => sum + h.costBasis, 0);
    const totalPL = totalValue - totalCost;

    res.json({ holdings: portfolio, totalValue, totalCost, totalPL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/market/overview', async (req, res) => {
  try {
    const companies = await Company.find({ active: true }).select(
      'name ticker industry sharePrice dayChange dayChangePercent marketCap',
    );

    const industries = {};
    for (const c of companies) {
      if (!industries[c.industry]) {
        industries[c.industry] = { count: 0, totalMarketCap: 0, avgChange: 0, changes: [] };
      }
      industries[c.industry].count++;
      industries[c.industry].totalMarketCap += c.marketCap;
      industries[c.industry].changes.push(c.dayChangePercent);
    }
    for (const key of Object.keys(industries)) {
      const ind = industries[key];
      ind.avgChange = Math.round((ind.changes.reduce((a, b) => a + b, 0) / ind.changes.length) * 100) / 100;
      delete ind.changes;
    }

    const totalMarketCap = companies.reduce((sum, c) => sum + c.marketCap, 0);
    const gainers = [...companies].sort((a, b) => b.dayChangePercent - a.dayChangePercent).slice(0, 5);
    const losers = [...companies].sort((a, b) => a.dayChangePercent - b.dayChangePercent).slice(0, 5);

    res.json({ totalMarketCap, industries, gainers, losers, totalCompanies: companies.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).populate(
      'hqCityId',
      'name country population economicCondition',
    );
    if (!company) return res.status(404).json({ error: 'Company not found' });

    let userHolding = null;
    if (req.user) {
      const StockHolding = (await import('../models/StockHolding.js')).default;
      const holding = await StockHolding.findOne({ userId: req.user._id, companyId: company._id });
      if (holding) {
        userHolding = {
          shares: holding.shares,
          avgBuyPrice: holding.avgBuyPrice,
          currentValue: holding.shares * company.sharePrice,
          profitLoss: holding.shares * (company.sharePrice - holding.avgBuyPrice),
        };
      }
    }

    res.json({
      ...company.toObject(),
      userHolding,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).select('performance name ticker');
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company.performance || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/events', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).select('expansionHistory name ticker');
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company.expansionHistory || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
