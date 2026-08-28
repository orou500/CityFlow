import express from 'express';
import Company from '../models/Company.js';
import StockHolding from '../models/StockHolding.js';
import StockTransaction from '../models/StockTransaction.js';
import StockMarketEvent from '../models/StockMarketEvent.js';
import User from '../models/User.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import GameState from '../models/GameState.js';
import { authenticate } from '../middleware/auth.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import { cacheKeys } from '../utils/cacheKeys.js';
import { cacheDel } from '../utils/cache.js';
import { getAvailableBalance } from '../utils/auctionMoney.js';
import { debitUserBalance, creditUserBalance } from '../utils/atomicBalance.js';
import { withUserLock } from '../utils/userMutex.js';

const router = express.Router();
router.use(authenticate);

router.post('/buy', async (req, res) => {
  let companyId, shares, company;
  try {
    companyId = req.body.companyId;
    shares = req.body.shares;
    if (!companyId || !shares || shares <= 0 || !Number.isInteger(shares)) {
      return res.status(400).json({ error: 'Invalid companyId or shares' });
    }

    company = await Company.findById(companyId);
    if (!company || !company.active) {
      return res.status(404).json({ error: 'Company not found or inactive' });
    }

    if (company.isIPO && company.realEstateCompanyId) {
      const reCompany = await RealEstateCompany.findById(company.realEstateCompanyId);
      if (
        reCompany &&
        reCompany.members &&
        reCompany.members.some((m) => m.userId.toString() === req.user._id.toString())
      ) {
        return res.status(400).json({ error: 'Company members cannot buy their own company shares' });
      }
    }

    const totalCost = shares * company.sharePrice;
    const user = await User.findById(req.user._id);
    if (getAvailableBalance(user) < totalCost) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    let holding;
    await withUserLock(`stocks:${req.user._id}`, async () => {
      if (company.isIPO) {
        const capped = await Company.findOneAndUpdate(
          {
            _id: company._id,
            $expr: { $lte: [{ $add: ['$totalSharesHeld', shares] }, '$sharesOutstanding'] },
          },
          { $inc: { totalSharesHeld: shares } },
          { new: false },
        );
        if (!capped) {
          const remaining = Math.max(0, (company.sharesOutstanding || 0) - (company.totalSharesHeld || 0));
          const err = new Error(`Only ${remaining} shares available`);
          err.status = 400;
          throw err;
        }
      }

      // Atomic debit with available-balance guard â€” never overspends, even
      // under concurrent buys/bids.
      const debited = await debitUserBalance(req.user._id, totalCost);
      if (!debited) {
        if (company.isIPO) {
          await Company.updateOne(
            { _id: company._id, totalSharesHeld: { $gte: shares } },
            { $inc: { totalSharesHeld: -shares } },
          ).catch(() => {});
        }
        const err = new Error('Insufficient balance');
        err.status = 400;
        throw err;
      }

      holding = await StockHolding.findOneAndUpdate(
        { userId: req.user._id, companyId },
        [
          {
            $set: {
              shares: { $add: [{ $ifNull: ['$shares', 0] }, shares] },
              avgBuyPrice: {
                $divide: [
                  {
                    $add: [{ $multiply: [{ $ifNull: ['$avgBuyPrice', 0] }, { $ifNull: ['$shares', 0] }] }, totalCost],
                  },
                  { $add: [{ $ifNull: ['$shares', 0] }, shares] },
                ],
              },
            },
          },
        ],
        { upsert: true, new: true },
      );

      await StockTransaction.create({
        userId: req.user._id,
        companyId,
        type: 'buy',
        shares,
        price: company.sharePrice,
        total: totalCost,
      });

      if (company.isIPO) {
        await Company.updateOne(
          { _id: company._id },
          {
            $inc: { tradingVolume: shares, totalTrades: 1 },
          },
        );
      }

      await processPlayerProgress(req.user._id, 'stocks_buy');
      await cacheDel(cacheKeys.stockPortfolio(req.user._id));
    });

    res.json({
      holding: {
        shares: holding.shares,
        avgBuyPrice: holding.avgBuyPrice,
        currentValue: holding.shares * company.sharePrice,
      },
      balance: (await User.findById(req.user._id)).balance,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (companyId && shares && shares > 0 && company?.isIPO) {
      Company.updateOne(
        { _id: companyId, totalSharesHeld: { $gte: shares } },
        { $inc: { totalSharesHeld: -shares } },
      ).catch(() => {});
    }
    res.serverError(err);
  }
});

router.post('/sell', async (req, res) => {
  try {
    const { companyId, shares } = req.body;
    if (!companyId || !shares || shares <= 0 || !Number.isInteger(shares)) {
      return res.status(400).json({ error: 'Invalid companyId or shares' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (company.isIPO && !company.active) {
      return res.status(400).json({ error: 'Cannot sell shares of a delisted company' });
    }

    const holding = await StockHolding.findOne({ userId: req.user._id, companyId });
    if (!holding || holding.shares < shares) {
      return res.status(400).json({ error: 'Insufficient shares' });
    }

    if (holding.locked) {
      return res.status(400).json({ error: 'Cannot sell locked shares' });
    }

    const totalRevenue = shares * company.sharePrice;

    await withUserLock(`stocks:${req.user._id}`, async () => {
      if (company.isIPO) {
        const decremented = await Company.findOneAndUpdate(
          {
            _id: company._id,
            isIPO: true,
            totalSharesHeld: { $gte: shares },
          },
          { $inc: { totalSharesHeld: -shares, tradingVolume: shares, totalTrades: 1 } },
          { new: false },
        );
        if (!decremented) {
          const err = new Error('Insufficient shares available to sell');
          err.status = 400;
          throw err;
        }
      }

      // Atomic holding decrement â€” concurrent sells can never overdraw shares.
      const updatedHolding = await StockHolding.findOneAndUpdate(
        { _id: holding._id, shares: { $gte: shares }, locked: { $ne: true } },
        { $inc: { shares: -shares } },
        { new: true },
      );
      if (!updatedHolding) {
        if (company.isIPO) {
          await Company.updateOne(
            { _id: company._id },
            { $inc: { totalSharesHeld: shares, tradingVolume: -shares, totalTrades: -1 } },
          ).catch(() => {});
        }
        const err = new Error('Insufficient shares');
        err.status = 400;
        throw err;
      }

      if (updatedHolding.shares <= 0) {
        await StockHolding.deleteOne({ _id: holding._id });
      }

      // Track realized stock profit for mission/achievement progress
      const realizedProfit = Math.round((company.sharePrice - holding.avgBuyPrice) * shares * 100) / 100;
      if (realizedProfit > 0) {
        await User.updateOne({ _id: req.user._id }, { $inc: { 'lifetimeStats.stockProfit': realizedProfit } }).catch(
          () => {},
        );
      }

      await creditUserBalance(req.user._id, totalRevenue);

      await StockTransaction.create({
        userId: req.user._id,
        companyId,
        type: 'sell',
        shares,
        price: company.sharePrice,
        total: totalRevenue,
      });

      await processPlayerProgress(req.user._id, 'stocks_sell');
      await cacheDel(cacheKeys.stockPortfolio(req.user._id));
    });

    const freshHolding =
      holding.shares - shares > 0 ? await StockHolding.findOne({ userId: req.user._id, companyId }) : null;
    res.json({
      holding: freshHolding
        ? {
            shares: freshHolding.shares,
            avgBuyPrice: freshHolding.avgBuyPrice,
            currentValue: freshHolding.shares * company.sharePrice,
          }
        : null,
      balance: (await User.findById(req.user._id)).balance,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.serverError(err);
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
    res.serverError(err);
  }
});

router.get('/public', async (_req, res) => {
  try {
    const companies = await Company.find({ isIPO: true, active: true })
      .select(
        'name ticker sharePrice marketCap sharesOutstanding dividendPerShare dividendYield dayChangePercent totalReturn lastDividendTick tradingVolume avgDailyVolume totalTrades activeShareholders floatPercentage weeklyVolume monthlyVolume',
      )
      .sort({ marketCap: -1 })
      .lean();

    res.json(companies);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/public/statistics', async (_req, res) => {
  try {
    const companies = await Company.find({ isIPO: true, active: true }).lean();
    const totalMarketCap = companies.reduce((s, c) => s + (c.marketCap || 0), 0);
    const totalVolume = companies.reduce((s, c) => s + (c.tradingVolume || 0), 0);
    const totalTrades = companies.reduce((s, c) => s + (c.totalTrades || 0), 0);
    const avgYield = companies.filter((c) => c.dividendYield > 0).reduce((s, c) => s + c.dividendYield, 0);
    const avgYieldCount = companies.filter((c) => c.dividendYield > 0).length;

    const gainers = [...companies].sort((a, b) => b.dayChangePercent - a.dayChangePercent).slice(0, 5);
    const losers = [...companies].sort((a, b) => a.dayChangePercent - b.dayChangePercent).slice(0, 5);

    res.json({
      totalCompanies: companies.length,
      totalMarketCap,
      totalVolume,
      totalTrades,
      avgDividendYield: avgYieldCount > 0 ? Math.round((avgYield / avgYieldCount) * 100) / 100 : 0,
      gainers: gainers.map((c) => ({
        _id: c._id,
        ticker: c.ticker,
        name: c.name,
        dayChangePercent: c.dayChangePercent,
        sharePrice: c.sharePrice,
      })),
      losers: losers.map((c) => ({
        _id: c._id,
        ticker: c.ticker,
        name: c.name,
        dayChangePercent: c.dayChangePercent,
        sharePrice: c.sharePrice,
      })),
    });
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/public/events', async (_req, res) => {
  try {
    const events = await StockMarketEvent.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('companyId', 'name ticker')
      .lean();
    res.json(events);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/public/events/:companyId', async (req, res) => {
  try {
    const events = await StockMarketEvent.find({ companyId: req.params.companyId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json(events);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/:id/statistics', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .select(
        'name ticker sharePrice previousSharePrice marketCap sharesOutstanding dividendPerShare dividendYield totalDividendsPaid lastDividendPerShare lastDividendTick dividendHistory dayChangePercent totalReturn high52Week low52Week tradingVolume avgDailyVolume totalTrades activeShareholders floatPercentage revenue employees cash debt profit isIPO weeklyVolume monthlyVolume volumeHistory performance ipoPrice',
      )
      .lean();

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(company);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/dividends', async (req, res) => {
  try {
    const holdings = await StockHolding.find({ userId: req.user._id, shares: { $gt: 0 } })
      .populate('companyId', 'name ticker dividendPerShare dividendYield sharePrice lastDividendTick isIPO active')
      .lean();

    const dividends = holdings
      .filter((h) => h.companyId && h.unclaimedDividends > 0)
      .map((h) => ({
        companyId: h.companyId._id,
        companyName: h.companyId.name,
        ticker: h.companyId.ticker,
        shares: h.shares,
        unclaimed: h.unclaimedDividends,
        dividendPerShare: h.companyId.dividendPerShare,
        dividendYield: h.companyId.dividendYield,
        lastDividendTick: h.companyId.lastDividendTick,
        isIPO: h.companyId.isIPO,
      }));

    const totalUnclaimed = dividends.reduce((sum, d) => sum + d.unclaimed, 0);

    res.json({ dividends, totalUnclaimed });
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/dividends/claim', async (req, res) => {
  try {
    const { companyId } = req.body;
    let query = { userId: req.user._id, shares: { $gt: 0 }, unclaimedDividends: { $gt: 0 } };
    if (companyId) {
      query.companyId = companyId;
    }

    const holdings = await StockHolding.find(query).populate('companyId', 'name ticker isIPO active');
    if (holdings.length === 0) {
      return res.status(400).json({ error: 'No unclaimed dividends' });
    }

    // IPO dividends cannot be claimed once the company is delisted;
    // non-IPO (auto-generated) company dividends remain claimable even if
    // the company went bankrupt â€” the cash was set aside at declaration time.
    const ipoHoldings = holdings.filter((h) => h.companyId?.isIPO);
    const hasDelistedIpo = ipoHoldings.some((h) => !h.companyId?.active);
    if (hasDelistedIpo) {
      return res.status(400).json({ error: 'Cannot claim dividends from delisted companies' });
    }

    const claimableHoldings = holdings.filter((h) => h.companyId);

    const gameState = await GameState.findOne();
    const currentTick = gameState?.tickNumber || 0;
    const user = await User.findById(req.user._id);
    let totalClaimed = 0;
    const claimedDetails = [];

    for (const holding of claimableHoldings) {
      const dividendAmount = Math.round(holding.unclaimedDividends * 100) / 100;
      if (dividendAmount <= 0) continue;

      totalClaimed += dividendAmount;
      holding.unclaimedDividends = 0;
      holding.dividendClaimedTick = currentTick;
      await holding.save();

      claimedDetails.push({
        companyId: holding.companyId._id,
        companyName: holding.companyId.name,
        ticker: holding.companyId.ticker,
        amount: dividendAmount,
      });

      await StockTransaction.create({
        userId: req.user._id,
        companyId: holding.companyId._id,
        type: 'dividend',
        shares: 0,
        price: 0,
        total: dividendAmount,
      });
    }

    if (totalClaimed <= 0) {
      return res.status(400).json({ error: 'No unclaimed dividends' });
    }

    user.balance += totalClaimed;
    await user.save();

    await processPlayerProgress(req.user._id, 'stocks_dividend');

    if (cacheKeys.stockPortfolio) {
      await cacheDel(cacheKeys.stockPortfolio(req.user._id));
    }

    res.json({
      success: true,
      totalClaimed: Math.round(totalClaimed * 100) / 100,
      balance: user.balance,
      claimedDetails,
    });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
