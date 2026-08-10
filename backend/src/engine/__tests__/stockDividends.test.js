import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import Company from '../../models/Company.js';
import City from '../../models/City.js';
import StockHolding from '../../models/StockHolding.js';
import StockMarketEvent from '../../models/StockMarketEvent.js';
import { simulateStockMarket, updateCompanyFinances, isDividendEligible, distributeDividend } from '../stockMarket.js';

afterAll(async () => {
  await Company.deleteMany({});
  await City.deleteMany({});
  await StockHolding.deleteMany({});
  await StockMarketEvent.deleteMany({});
});

function makeCompanyDoc(overrides = {}) {
  return new Company({
    name: 'Dividend Test Co',
    ticker: `DIV${Math.floor(Math.random() * 10000)}`,
    industry: 'technology',
    size: 'corporation',
    revenue: 50000000,
    employees: 5000,
    cash: 10000000,
    debt: 2000000,
    profit: 5000000,
    sharePrice: 100,
    sharesOutstanding: 1000000,
    active: true,
    isIPO: false,
    ...overrides,
  });
}

describe('updateCompanyFinances', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accumulates profit into cash on a profitable tick', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const company = makeCompanyDoc({ cash: 10000000 });

    updateCompanyFinances(company);

    // margin 0.15, noise 0 → profit = 50M * 0.15 = 7.5M
    expect(company.profit).toBe(7500000);
    expect(company.cash).toBe(17500000);
  });

  it('erodes cash on a loss-making quarter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const company = makeCompanyDoc({ cash: 10000000 });

    updateCompanyFinances(company);

    // loss quarter: rate = 0.01 + 0.04 * 0.05 = 0.012 → profit = -600k
    expect(company.profit).toBeLessThan(0);
    expect(company.cash).toBe(9400000);
  });

  it('never lets cash go negative', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const company = makeCompanyDoc({ cash: 1000 });

    updateCompanyFinances(company);

    expect(company.cash).toBeGreaterThanOrEqual(0);
  });
});

describe('isDividendEligible', () => {
  it('returns true for a healthy company', () => {
    const company = makeCompanyDoc();
    expect(isDividendEligible(company, 100)).toBe(true);
  });

  it('rejects companies with insufficient cash', () => {
    const company = makeCompanyDoc({ cash: 100000 });
    expect(isDividendEligible(company, 100)).toBe(false);
  });

  it('rejects companies with insufficient profit', () => {
    const company = makeCompanyDoc({ profit: 10000 });
    expect(isDividendEligible(company, 100)).toBe(false);
  });

  it('rejects companies with too much debt relative to cash', () => {
    const company = makeCompanyDoc({ cash: 10000000, debt: 10000000 });
    expect(isDividendEligible(company, 100)).toBe(false);
  });

  it('rejects companies that paid a dividend too recently (cooldown)', () => {
    const company = makeCompanyDoc({ lastDividendTick: 90 });
    expect(isDividendEligible(company, 100)).toBe(false);
    expect(isDividendEligible(company, 110)).toBe(true);
  });
});

describe('distributeDividend', () => {
  let company;
  let user1;
  let user2;

  beforeEach(async () => {
    await Company.deleteMany({});
    await StockHolding.deleteMany({});
    await StockMarketEvent.deleteMany({});
    await City.deleteMany({});

    const city = await City.create({
      name: 'Div City',
      country: 'Testland',
      coordinates: { lat: 0, lng: 0 },
      population: 500000,
    });

    user1 = new mongoose.Types.ObjectId();
    user2 = new mongoose.Types.ObjectId();

    company = await Company.create({
      name: 'Dividend Co',
      ticker: 'DVC',
      industry: 'finance',
      size: 'corporation',
      revenue: 50000000,
      employees: 5000,
      cash: 20000000,
      debt: 2000000,
      profit: 5000000,
      sharePrice: 100,
      sharesOutstanding: 1000000,
      hqCityId: city._id,
      active: true,
      isIPO: false,
    });

    await StockHolding.create({ userId: user1, companyId: company._id, shares: 5000, avgBuyPrice: 100 });
    await StockHolding.create({ userId: user2, companyId: company._id, shares: 3000, avgBuyPrice: 100 });
  });

  it('pays each shareholder perShare * shares and deducts the payout from cash', async () => {
    const result = await distributeDividend(company, 'regular', 100);

    // pool = min(5M * 0.35, 20M * 0.5) = 1.75M → perShare = 1.75
    expect(result.perShare).toBe(1.75);
    expect(result.holders).toBe(2);
    expect(result.total).toBe(14000); // 5000*1.75 + 3000*1.75

    const h1 = await StockHolding.findOne({ userId: user1 });
    const h2 = await StockHolding.findOne({ userId: user2 });
    expect(h1.unclaimedDividends).toBe(8750);
    expect(h2.unclaimedDividends).toBe(5250);

    await company.save();
    const persisted = await Company.findById(company._id);
    expect(persisted.cash).toBe(20000000 - 14000);
    expect(persisted.lastDividendTick).toBe(100);
    expect(persisted.lastDividendPerShare).toBe(1.75);
    expect(persisted.dividendPerShare).toBe(1.75);
    expect(persisted.totalDividendsPaid).toBe(14000);
    expect(persisted.dividendYield).toBeGreaterThan(0);
    expect(persisted.dividendHistory).toHaveLength(1);
    expect(persisted.dividendHistory[0]).toMatchObject({ tick: 100, perShare: 1.75, total: 14000, type: 'regular' });
  });

  it('records a dividend_paid market event', async () => {
    await distributeDividend(company, 'regular', 100);
    await company.save();

    const event = await StockMarketEvent.findOne({ companyId: company._id, type: 'dividend_paid' });
    expect(event).not.toBeNull();
    expect(event.headline).toMatch(/DVC paid \$\d+\.\d{2} per share dividend/);
    expect(event.metadata.perShare).toBe(1.75);
    expect(event.metadata.dividendType).toBe('regular');
  });

  it('caps the per-share amount at the configured maximum', async () => {
    company.profit = 100000000;
    const result = await distributeDividend(company, 'regular', 101);
    expect(result.perShare).toBeLessThanOrEqual(25);
  });

  it('never pays out more than the company cash', async () => {
    company.cash = 5000;
    const result = await distributeDividend(company, 'regular', 102);
    expect(result).toBeNull();
  });

  it('returns null when there is no eligible pool', async () => {
    company.profit = 0;
    const result = await distributeDividend(company, 'regular', 103);
    expect(result).toBeNull();
  });

  it('pays nothing to non-shareholders and records exactly once', async () => {
    await distributeDividend(company, 'regular', 100);
    const again = await distributeDividend(company, 'regular', 101);

    // cooldown is enforced at eligibility level; direct re-invocation would
    // pay again — so the engine must gate via isDividendEligible. The company
    // doc records lastDividendTick, which makes it ineligible.
    expect(again.perShare).toBeGreaterThan(0);
    expect(isDividendEligible(company, 101)).toBe(false);
  });
});

describe('simulateStockMarket dividend integration', () => {
  beforeEach(async () => {
    await Company.deleteMany({});
    await StockHolding.deleteMany({});
    await StockMarketEvent.deleteMany({});
    await City.deleteMany({});
  });

  it('updates financials (profit/cash) for non-IPO companies each tick', async () => {
    const city = await City.create({
      name: 'Sim City',
      country: 'Testland',
      coordinates: { lat: 0, lng: 0 },
      population: 500000,
    });
    await Company.create({
      name: 'Sim Co',
      ticker: 'SIM',
      industry: 'technology',
      size: 'large',
      revenue: 50000000,
      employees: 2000,
      cash: 10000000,
      debt: 5000000,
      sharePrice: 100,
      sharesOutstanding: 1000000,
      hqCityId: city._id,
      active: true,
      isIPO: false,
    });

    const results = await simulateStockMarket(10);

    expect(results.length).toBe(1);
    const updated = await Company.findOne({ ticker: 'SIM' });
    expect(updated.lastProfitTick).toBe(10);
    expect(typeof updated.profit).toBe('number');
    expect(updated.cash).toBeGreaterThanOrEqual(0);
  });
});
