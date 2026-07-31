import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Company from '../../models/Company.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import StockHolding from '../../models/StockHolding.js';
import Property from '../../models/Property.js';
import Loan from '../../models/Loan.js';
import GameState from '../../models/GameState.js';
import User from '../../models/User.js';
import City from '../../models/City.js';
import { processPublicCompanies } from '../publicCompanyProcessing.js';

describe('Public Company Processing', () => {
  let hqCity;

  beforeEach(async () => {
    await GameState.findOneAndUpdate({}, { tickNumber: 100, $setOnInsert: { season: 1 } }, { upsert: true, new: true });
    hqCity = await City.create({ name: 'Test City', country: 'Testland', coordinates: { lat: 0, lng: 0 }, description: 'test' });
    await Company.deleteMany({});
    await RealEstateCompany.deleteMany({});
    await StockHolding.deleteMany({});
  });

  async function createTestPublicCompany(overrides = {}) {
    const founder = await User.create({ username: `founder_${Date.now()}`, email: `f_${Date.now()}@t.com`, password: 'Pass1234' });
    const reCompany = await RealEstateCompany.create({
      name: `Test RE Corp ${Date.now()}`,
      founderId: founder._id,
      members: [],
      treasury: { balance: 1_000_000, transactions: [] },
      stats: { totalRentalIncome: 500_000, propertiesOwned: 30 },
      reputation: 50,
      level: 25,
      active: true,
      ...overrides,
    });
    const ticker = `TRE${Date.now() % 10000}`;
    const stockCompany = await Company.create({
      name: `Test RE Corp ${Date.now()}`,
      ticker,
      industry: 'finance',
      size: 'medium',
      sharePrice: 50,
      previousSharePrice: 50,
      marketCap: 5_000_000,
      sharesOutstanding: 100_000,
      revenue: 6_000_000,
      realEstateCompanyId: reCompany._id,
      isIPO: true,
      active: true,
      volatility: 0.03,
      performance: [],
      totalReturn: 0,
      dayChange: 0,
      dayChangePercent: 0,
      high52Week: 50,
      low52Week: 50,
      hqCityId: hqCity._id,
      offices: [{ cityId: hqCity._id, type: 'headquarters', employees: 10, openedTick: 0 }],
      foundedTick: 0,
      description: 'test',
    });
    reCompany.ipo = {
      listed: true,
      stockCompanyId: stockCompany._id,
      ticker,
      sharePrice: 50,
      sharesOutstanding: 100_000,
      listedAt: new Date(),
      listFee: 100_000_000,
    };
    await reCompany.save();
    return { reCompany, stockCompany, ticker };
  }

  it('processes public companies and updates share price', async () => {
    const { stockCompany, ticker } = await createTestPublicCompany();

    const results = await processPublicCompanies(100);

    expect(results.length).toBe(1);
    expect(results[0].ticker).toBe(ticker);
    expect(results[0].status).toBe('ok');
    expect(typeof results[0].price).toBe('number');

    const updated = await Company.findById(stockCompany._id);
    expect(updated.sharePrice).not.toBe(50);
    expect(updated.marketCap).toBeGreaterThan(0);
    expect(updated.dayChange).not.toBe(0);
  });

  it('pays dividends when profitable', async () => {
    const { reCompany, stockCompany, ticker } = await createTestPublicCompany();
    reCompany.stats.totalRentalIncome = 10_000_000;
    await reCompany.save();

    const user = await User.create({ username: `investor_${Date.now()}`, email: `i_${Date.now()}@t.com`, password: 'Pass1234' });
    await StockHolding.create({ userId: user._id, companyId: stockCompany._id, shares: 1000, avgBuyPrice: 50 });

    const results = await processPublicCompanies(100);

    const divResult = results.find((r) => r.ticker === ticker);
    expect(divResult.dividendPerShare).toBeGreaterThan(0);

    const holding = await StockHolding.findOne({ userId: user._id, companyId: stockCompany._id });
    expect(holding.unclaimedDividends).toBeGreaterThan(0);

    const updatedStock = await Company.findById(stockCompany._id);
    expect(updatedStock.dividendPerShare).toBeGreaterThan(0);
    expect(updatedStock.lastDividendTick).toBe(100);
  });

  it('skips dividends when profit is zero', async () => {
    const { reCompany, stockCompany, ticker } = await createTestPublicCompany();
    reCompany.stats.totalRentalIncome = 0;
    reCompany.treasury.balance = 0;
    await reCompany.save();

    const results = await processPublicCompanies(100);

    const divResult = results.find((r) => r.ticker === ticker);
    expect(divResult.dividendPerShare).toBe(0);

    const updated = await Company.findById(stockCompany._id);
    expect(updated.dividendPerShare).toBe(0);
  });

  it('delists company if real estate company is missing', async () => {
    const company = await Company.create({
      name: 'Orphan',
      ticker: 'ORP',
      industry: 'finance',
      size: 'medium',
      sharePrice: 10,
      marketCap: 100_000,
      sharesOutstanding: 10_000,
      realEstateCompanyId: new mongoose.Types.ObjectId(),
      isIPO: true,
      active: true,
      performance: [],
      hqCityId: hqCity._id,
      offices: [{ cityId: hqCity._id, type: 'headquarters', employees: 10, openedTick: 0 }],
      foundedTick: 0,
      description: 'test',
    });

    const results = await processPublicCompanies(100);
    expect(results[0].status).toBe('delisted_no_re_company');

    const updated = await Company.findById(company._id);
    expect(updated.active).toBe(false);
  });

  it('does nothing when no public companies exist', async () => {
    const results = await processPublicCompanies(100);
    expect(results).toEqual([]);
  });

  it('tracks performance history', async () => {
    const { stockCompany } = await createTestPublicCompany();

    await processPublicCompanies(100);
    await processPublicCompanies(101);
    await processPublicCompanies(102);

    const updated = await Company.findById(stockCompany._id);
    expect(updated.performance.length).toBe(3);
    expect(updated.performance[0].tick).toBe(100);
    expect(updated.performance[0].price).toBeGreaterThan(0);
  });
});
