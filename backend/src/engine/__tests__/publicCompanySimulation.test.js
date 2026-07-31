import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Company from '../../models/Company.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import StockHolding from '../../models/StockHolding.js';
import StockTransaction from '../../models/StockTransaction.js';
import StockMarketEvent from '../../models/StockMarketEvent.js';
import GameState from '../../models/GameState.js';
import User from '../../models/User.js';
import City from '../../models/City.js';
import { processPublicCompanies } from '../publicCompanyProcessing.js';

const SIMULATION_TICKS = 200;

describe('Public Company Long-Term Simulation', () => {
  let hqCity;

  beforeEach(async () => {
    await GameState.findOneAndUpdate(
      {},
      { tickNumber: 1000, $setOnInsert: { season: 1 } },
      { upsert: true, new: true },
    );
    hqCity = await City.create({
      name: 'Sim City',
      country: 'Simland',
      coordinates: { lat: 0, lng: 0 },
      description: 'sim',
    });
    await Company.deleteMany({});
    await RealEstateCompany.deleteMany({});
    await StockHolding.deleteMany({});
    await StockTransaction.deleteMany({});
    await StockMarketEvent.deleteMany({});
    await User.deleteMany({ username: /^sim_/ });
  });

  async function createSimCompany(name, rentalIncome, membersCount = 5) {
    const founder = await User.create({
      username: `sim_${name}_founder`,
      email: `sim_${name}@t.com`,
      password: 'test',
    });
    const reCompany = await RealEstateCompany.create({
      name: `${name} RE`,
      founderId: founder._id,
      members: Array.from({ length: membersCount }, (_, i) => ({
        userId: new mongoose.Types.ObjectId(),
        role: i === 0 ? 'ceo' : 'member',
        joinedAt: new Date(),
      })),
      treasury: { balance: 5_000_000, transactions: [] },
      stats: { totalRentalIncome: rentalIncome, propertiesOwned: 50 },
      reputation: 60,
      level: 28,
      active: true,
      ipo: {
        listed: true,
        stockCompanyId: null,
        ticker: name.toUpperCase().slice(0, 4),
        sharePrice: 100,
        sharesOutstanding: 200_000,
        listedAt: new Date(),
        listFee: 100_000_000,
        dividendsPaid: 0,
        lastDividendPerShare: 0,
        lastDividendTick: 0,
        ipoValue: 20_000_000,
      },
    });
    const ticker = name.toUpperCase().slice(0, 4);
    const stockCompany = await Company.create({
      name: `${name} Public`,
      ticker,
      industry: 'finance',
      size: 'medium',
      sharePrice: 100,
      previousSharePrice: 100,
      marketCap: 20_000_000,
      sharesOutstanding: 200_000,
      revenue: 12_000_000,
      employees: 50,
      realEstateCompanyId: reCompany._id,
      isIPO: true,
      active: true,
      volatility: 0.03,
      performance: [],
      totalReturn: 0,
      dayChange: 0,
      dayChangePercent: 0,
      high52Week: 100,
      low52Week: 100,
      hqCityId: hqCity._id,
      offices: [{ cityId: hqCity._id, type: 'headquarters', employees: 50, openedTick: 0 }],
      foundedTick: 0,
      description: 'Simulation test company',
    });
    reCompany.ipo.stockCompanyId = stockCompany._id;
    await reCompany.save();
    return { reCompany, stockCompany, ticker };
  }

  async function createInvestorHoldings(stockCompany, count = 3) {
    const investors = [];
    const sharesPerInvestor = Math.floor((stockCompany.sharesOutstanding * 0.3) / count);
    let totalShares = 0;
    for (let i = 0; i < count; i++) {
      const user = await User.create({
        username: `sim_investor_${stockCompany.ticker}_${i}`,
        email: `sim_i_${stockCompany.ticker}_${i}@t.com`,
        password: 'test',
        balance: 10_000_000,
      });
      await StockHolding.create({
        userId: user._id,
        companyId: stockCompany._id,
        shares: sharesPerInvestor,
        avgBuyPrice: stockCompany.sharePrice,
        unclaimedDividends: 0,
      });
      totalShares += sharesPerInvestor;
      investors.push(user);
    }
    if (totalShares > 0) {
      await Company.updateOne({ _id: stockCompany._id }, { $inc: { totalSharesHeld: totalShares } });
    }
    return investors;
  }

  it('runs 200 ticks without data corruption', async () => {
    const companies = [
      await createSimCompany('Alpha', 8_000_000, 8),
      await createSimCompany('Beta', 2_000_000, 5),
      await createSimCompany('Gamma', 500_000, 3),
    ];

    const allInvestors = [];
    for (const { stockCompany } of companies) {
      const investors = await createInvestorHoldings(stockCompany, 3);
      allInvestors.push(...investors);
    }

    const totalEventsBefore = await StockMarketEvent.countDocuments();

    for (let tick = 1000; tick < 1000 + SIMULATION_TICKS; tick++) {
      await processPublicCompanies(tick);
    }

    const endTick = 1000 + SIMULATION_TICKS;

    for (const { stockCompany, reCompany } of companies) {
      const updated = await Company.findById(stockCompany._id);

      expect(updated.active).toBe(true);
      expect(updated.sharePrice).toBeGreaterThan(0);
      expect(updated.sharePrice).toBeLessThan(1_000_000);
      expect(Number.isNaN(updated.sharePrice)).toBe(false);

      expect(updated.marketCap).toBeGreaterThan(0);
      expect(Number.isNaN(updated.marketCap)).toBe(false);

      expect(updated.performance.length).toBeLessThanOrEqual(720);
      expect(updated.performance.length).toBe(SIMULATION_TICKS);
      expect(updated.performance[0].tick).toBe(1000);
      expect(updated.performance[updated.performance.length - 1].tick).toBe(endTick - 1);

      for (const entry of updated.performance) {
        expect(entry.price).toBeGreaterThan(0);
        expect(Number.isNaN(entry.price)).toBe(false);
        expect(entry.tick).toBeGreaterThanOrEqual(1000);
        expect(entry.tick).toBeLessThan(endTick);
      }

      expect(updated.high52Week).toBeGreaterThanOrEqual(updated.low52Week);
      expect(updated.high52Week).toBeGreaterThan(0);
      expect(updated.totalReturn).not.toBe(NaN);
      expect(updated.dayChangePercent).not.toBe(NaN);
      expect(updated.dividendYield).not.toBe(NaN);

      expect(updated.volumeHistory.length).toBeLessThanOrEqual(48);

      const totalHeld = await StockHolding.aggregate([
        { $match: { companyId: stockCompany._id } },
        { $group: { _id: null, total: { $sum: '$shares' } } },
      ]);
      const heldFromHoldings = totalHeld[0]?.total || 0;
      expect(updated.totalSharesHeld).toBe(heldFromHoldings);

      expect(updated.realEstateCompanyId.toString()).toBe(reCompany._id.toString());
    }

    const updatedRe = await RealEstateCompany.findById(companies[0].reCompany._id);
    expect(updatedRe.ipo.dividendsPaid).toBeGreaterThanOrEqual(0);

    const totalEventsAfter = await StockMarketEvent.countDocuments();
    const eventsGenerated = totalEventsAfter - totalEventsBefore;
    expect(eventsGenerated).toBeGreaterThan(0);

    const events = await StockMarketEvent.find().lean();
    for (const event of events) {
      expect(event.headline).toBeTruthy();
      expect(['dividend_paid', 'all_time_high', 'price_surge', 'price_drop']).toContain(event.type);
      expect(['positive', 'negative', 'major']).toContain(event.severity);
    }

    const allTransactions = await StockTransaction.find().lean();
    expect(allTransactions.length).toBe(0);

    const holdings = await StockHolding.find().lean();
    for (const h of holdings) {
      expect(h.shares).toBeGreaterThan(0);
      expect(h.avgBuyPrice).toBeGreaterThan(0);
      expect(h.unclaimedDividends).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles zero-revenue company gracefully over many ticks', async () => {
    const { stockCompany } = await createSimCompany('Zero', 0, 2);

    for (let tick = 500; tick < 700; tick++) {
      await processPublicCompanies(tick);
    }

    const updated = await Company.findById(stockCompany._id);
    expect(updated.active).toBe(true);
    expect(updated.sharePrice).toBeGreaterThan(0);
    expect(updated.dividendPerShare).toBe(0);
    expect(updated.performance.length).toBe(200);
  });

  it('recovers after a period of zero revenue', async () => {
    const { stockCompany, reCompany } = await createSimCompany('Recover', 0, 3);

    for (let tick = 300; tick < 400; tick++) {
      await processPublicCompanies(tick);
    }

    reCompany.stats.totalRentalIncome = 10_000_000;
    await reCompany.save();

    for (let tick = 400; tick < 500; tick++) {
      await processPublicCompanies(tick);
    }

    const updated = await Company.findById(stockCompany._id);
    expect(updated.active).toBe(true);
    expect(updated.sharePrice).toBeGreaterThan(0);
    expect(updated.dividendPerShare).toBeGreaterThan(0);
    expect(updated.performance.length).toBe(200);
  });

  it('delists orphan company and preserves holdings', async () => {
    const { stockCompany } = await createSimCompany('OrphanTest', 5_000_000, 5);

    await createInvestorHoldings(stockCompany, 2);

    await RealEstateCompany.deleteOne({ _id: stockCompany.realEstateCompanyId });

    const results = await processPublicCompanies(1500);
    const orphanResult = results.find((r) => r.ticker === stockCompany.ticker);
    expect(orphanResult.status).toBe('delisted_no_re_company');

    const updated = await Company.findById(stockCompany._id);
    expect(updated.active).toBe(false);

    const holdings = await StockHolding.find({ companyId: stockCompany._id }).lean();
    expect(holdings.length).toBe(2);
    for (const h of holdings) {
      expect(h.shares).toBeGreaterThan(0);
    }

    const delistEvents = await StockMarketEvent.find({ companyId: stockCompany._id, type: 'delisting' }).lean();
    expect(delistEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('does not generate duplicate delisting events', async () => {
    const { stockCompany } = await createSimCompany('DupDelist', 3_000_000, 4);

    await RealEstateCompany.deleteOne({ _id: stockCompany.realEstateCompanyId });

    await processPublicCompanies(2000);

    await processPublicCompanies(2001);

    const delistEvents = await StockMarketEvent.find({ companyId: stockCompany._id, type: 'delisting' }).lean();
    expect(delistEvents.length).toBe(1);
  });

  it('resets tradingVolume to zero each tick', async () => {
    const { stockCompany } = await createSimCompany('VolReset', 4_000_000, 4);

    await Company.updateOne({ _id: stockCompany._id }, { $set: { tradingVolume: 5000 } });

    await processPublicCompanies(3000);

    const updated = await Company.findById(stockCompany._id);
    expect(updated.tradingVolume).toBe(0);
  });

  it('maintains data integrity after 200 ticks with trades', async () => {
    const { stockCompany } = await createSimCompany('Integrity', 6_000_000, 6);

    const users = [];
    for (let i = 0; i < 5; i++) {
      const user = await User.create({
        username: `sim_trader_${i}`,
        email: `trader_${i}@t.com`,
        password: 'test',
        balance: 20_000_000,
      });
      users.push(user);
    }

    for (let i = 0; i < users.length; i++) {
      await StockHolding.create({
        userId: users[i]._id,
        companyId: stockCompany._id,
        shares: 1000 * (i + 1),
        avgBuyPrice: 100,
      });
    }
    await Company.updateOne({ _id: stockCompany._id }, { $inc: { totalSharesHeld: 15000 } });

    const prices = [];
    for (let tick = 2000; tick < 2200; tick++) {
      await processPublicCompanies(tick);
      const updated = await Company.findById(stockCompany._id);
      prices.push(updated.sharePrice);
    }

    const updated = await Company.findById(stockCompany._id);
    expect(updated.active).toBe(true);

    for (const price of prices) {
      expect(price).toBeGreaterThan(0);
      expect(Number.isNaN(price)).toBe(false);
    }

    const priceRange = Math.max(...prices) - Math.min(...prices);
    expect(priceRange).toBeLessThan(300);

    const totalHeld = await StockHolding.aggregate([
      { $match: { companyId: stockCompany._id } },
      { $group: { _id: null, total: { $sum: '$shares' } } },
    ]);
    const heldFromHoldings = totalHeld[0]?.total || 0;
    expect(updated.totalSharesHeld).toBe(heldFromHoldings);

    const holdings = await StockHolding.find({
      companyId: stockCompany._id,
      unclaimedDividends: { $gt: 0 },
    }).lean();
    const totalUnclaimed = holdings.reduce((s, h) => s + h.unclaimedDividends, 0);
    expect(totalUnclaimed).toBeGreaterThanOrEqual(0);

    if (updated.totalDividendsPaid > 0) {
      expect(totalUnclaimed).toBeLessThanOrEqual(updated.totalDividendsPaid);
    }
  });
});
