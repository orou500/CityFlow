import { describe, it, expect, afterAll } from 'vitest';
import Company from '../../models/Company.js';
import City from '../../models/City.js';
import StockHolding from '../../models/StockHolding.js';
import StockMarketEvent from '../../models/StockMarketEvent.js';
import User from '../../models/User.js';
import {
  computeFundamentalValue,
  issueShares,
  executeBuyback,
  executeStockSplit,
  processCorporateActions,
} from '../corporateActions.js';
import { distributeDividend } from '../stockMarket.js';

afterAll(async () => {
  await Company.deleteMany({});
  await City.deleteMany({});
  await StockHolding.deleteMany({});
  await StockMarketEvent.deleteMany({});
  await User.deleteMany({});
});

async function makeCompany(overrides = {}) {
  const city = await City.create({
    name: `City_${Date.now()}_${Math.random()}`,
    country: 'Testland',
    coordinates: { lat: 0, lng: 0 },
    population: 500000,
  });
  return Company.create({
    name: `Corp ${Date.now()}`,
    ticker: `C${Math.floor(Math.random() * 100000)}`,
    industry: 'technology',
    size: 'medium',
    revenue: 1000000,
    employees: 500,
    cash: 100000,
    debt: 50000,
    profit: 200000,
    sharePrice: 20,
    sharesOutstanding: 1000000,
    initialSharesOutstanding: 1000000,
    hqCityId: city._id,
    offices: [{ cityId: city._id, type: 'headquarters', employees: 200, openedTick: 0 }],
    active: true,
    isIPO: false,
    ...overrides,
  });
}

describe('computeFundamentalValue — deterministic valuation', () => {
  it('is deterministic: same state always produces the same value', () => {
    const company = {
      size: 'medium',
      revenue: 1000000,
      cash: 500000,
      debt: 200000,
      _propertyValue: 0,
    };
    expect(computeFundamentalValue(company)).toBe(500000 + 1000000 * 2.2 - 200000);
    expect(computeFundamentalValue(company)).toBe(computeFundamentalValue(company));
  });

  it('never produces a negative intrinsic value', () => {
    const company = { size: 'small', revenue: 0, cash: 0, debt: 500000, _propertyValue: 0 };
    expect(computeFundamentalValue(company)).toBe(0);
  });

  it('includes real-estate property value when present', () => {
    const company = { size: 'medium', revenue: 1000000, cash: 0, debt: 0, _propertyValue: 5000000 };
    expect(computeFundamentalValue(company)).toBe(1000000 * 2.2 + 5000000);
  });
});

describe('issueShares — capital raise with dilution', () => {
  it('issues new shares, credits capital, and dilutes existing holders', async () => {
    const company = await makeCompany({ cash: 100000 }); // cash < 30% of revenue
    const holder = await User.create({ username: `h_${Date.now()}`, email: `h_${Date.now()}@t.com`, password: 'x' });
    await StockHolding.create({ userId: holder._id, companyId: company._id, shares: 100000, avgBuyPrice: 20 });

    const result = await issueShares(company, 100);
    expect(result).toBeTruthy();

    const updated = await Company.findById(company._id);
    // 15% of 1,000,000 = 150,000 new shares; issue price = 20 × 0.9 = 18
    expect(updated.sharesOutstanding).toBe(1150000);
    expect(updated.cash).toBe(100000 + Math.round(150000 * 18));
    expect(updated.capitalRaised).toBe(Math.round(150000 * 18));
    expect(updated.lastShareIssuanceTick).toBe(100);

    // Dilution: holder now owns 100,000 / 1,150,000 = 8.70%
    expect(updated.sharesOutstanding).toBe(1150000);
    const holding = await StockHolding.findOne({ userId: holder._id });
    expect(holding.shares).toBe(100000);
    expect((holding.shares / updated.sharesOutstanding) * 100).toBeCloseTo(8.6956, 2);

    const event = await StockMarketEvent.findOne({ companyId: company._id, type: 'share_issuance' });
    expect(event).not.toBeNull();
    expect(event.metadata.sharesIssued).toBe(150000);
  });

  it('never issues twice within the cooldown (idempotent against retries)', async () => {
    const company = await makeCompany({ cash: 100000 });
    await issueShares(company, 100);
    const again = await issueShares(company, 100); // same tick retry
    expect(again).toBeNull();
    const updated = await Company.findById(company._id);
    expect(updated.sharesOutstanding).toBe(1150000);
    expect(await StockMarketEvent.countDocuments({ companyId: company._id, type: 'share_issuance' })).toBe(1);
  });

  it('respects the cumulative dilution cap relative to the initial float', async () => {
    const company = await makeCompany({ cash: 100000, sharesOutstanding: 1000000, initialSharesOutstanding: 1000000 });
    // Issue every cooldown until the exact cap (50% of initial = 500k shares)
    // blocks the raise.
    let last = null;
    for (let t = 0; t < 10; t += 1) {
      const res = await issueShares(company, t * 12 + 100);
      if (res) last = res;
      else break;
    }
    const updated = await Company.findById(company._id);
    // 3 successful raises: 1,000,000 → 1,150,000 → 1,300,000 → 1,450,000;
    // the 4th (would reach 1,600,000) is refused by the exact cap.
    expect(updated.sharesOutstanding).toBe(1450000);
    expect(last).toBeTruthy();
    // Next attempt past the cap is refused.
    const blocked = await issueShares(company, 400);
    expect(blocked).toBeNull();
  });

  it('does not issue for a company with healthy cash', async () => {
    const company = await makeCompany({ cash: 2000000 }); // ≥ 30% of revenue
    expect(await issueShares(company, 100)).toBeNull();
  });
});

describe('executeBuyback — share repurchase', () => {
  it('buys back shares, spends cash, and raises holder ownership', async () => {
    const company = await makeCompany({ cash: 2000000 }); // ≥ 50% of revenue
    const holder = await User.create({ username: `b_${Date.now()}`, email: `b_${Date.now()}@t.com`, password: 'x' });
    await StockHolding.create({ userId: holder._id, companyId: company._id, shares: 100000, avgBuyPrice: 20 });

    const result = await executeBuyback(company, 100);
    expect(result).toBeTruthy();
    // 5% of 1,000,000 = 50,000 shares @ 20 × 1.02 = 1,020,000
    expect(result.sharesBoughtBack).toBe(50000);
    expect(result.cost).toBe(Math.round(50000 * 20 * 1.02));

    const updated = await Company.findById(company._id);
    expect(updated.sharesOutstanding).toBe(950000);
    expect(updated.cash).toBe(2000000 - result.cost);
    expect(updated.lastBuybackTick).toBe(100);

    const holding = await StockHolding.findOne({ userId: holder._id });
    expect(holding.shares).toBe(100000);
    expect((holding.shares / updated.sharesOutstanding) * 100).toBeCloseTo(10.526, 2);

    const event = await StockMarketEvent.findOne({ companyId: company._id, type: 'buyback' });
    expect(event).not.toBeNull();
  });

  it('never buys back twice in the same cooldown (idempotent)', async () => {
    const company = await makeCompany({ cash: 2000000 });
    await executeBuyback(company, 100);
    expect(await executeBuyback(company, 100)).toBeNull();
    const updated = await Company.findById(company._id);
    expect(updated.sharesOutstanding).toBe(950000);
  });

  it('refuses to buy back when cash is thin or would be starved', async () => {
    const company = await makeCompany({ cash: 600000 }); // ≥ 50%? 600k ≥ 500k yes
    expect(await executeBuyback(company, 100)).toBeNull(); // after: 600k − 1.02M < 0
    const cashLow = await makeCompany({ cash: 200000 });
    expect(await executeBuyback(cashLow, 100)).toBeNull();
  });
});

describe('executeStockSplit — forward and reverse splits', () => {
  it('2:1 split doubles shares, halves the price, and never fakes returns', async () => {
    const company = await makeCompany({ sharePrice: 250, ipoPrice: 100, high52Week: 260, low52Week: 90 });
    company.performance = [
      { tick: 1, price: 240 },
      { tick: 2, price: 250 },
    ];
    const holder = await User.create({ username: `s_${Date.now()}`, email: `s_${Date.now()}@t.com`, password: 'x' });
    await StockHolding.create({ userId: holder._id, companyId: company._id, shares: 1000, avgBuyPrice: 250 });

    const result = await executeStockSplit(company, 100, 2);
    expect(result).toBeTruthy();

    const updated = await Company.findById(company._id);
    expect(updated.sharesOutstanding).toBe(2000000);
    expect(updated.sharePrice).toBe(125);
    expect(updated.ipoPrice).toBe(50); // totalReturn vs IPO is preserved
    expect(updated.high52Week).toBe(130);
    expect(updated.low52Week).toBe(45);
    expect(updated.performance[0].price).toBe(120);
    expect(updated.performance[1].price).toBe(125);
    expect(updated.lastSplitTick).toBe(100);

    const holding = await StockHolding.findOne({ userId: holder._id });
    expect(holding.shares).toBe(2000);
    // Position value unchanged: 1000 × 250 = 2000 × 125
    expect(holding.shares * updated.sharePrice).toBe(250000);
  });

  it('1:10 reverse split consolidates shares and compensates fractional remainders in cash', async () => {
    const company = await makeCompany({ sharePrice: 0.5, ipoPrice: 1, high52Week: 2, low52Week: 0.4 });
    const holder = await User.create({ username: `r_${Date.now()}`, email: `r_${Date.now()}@t.com`, password: 'x' });
    const balanceBefore = 5000;
    await User.updateOne({ _id: holder._id }, { $set: { balance: balanceBefore } });
    // 55 shares × 0.1 = 5.5 → 5 whole shares + 0.5 fractional
    await StockHolding.create({ userId: holder._id, companyId: company._id, shares: 55, avgBuyPrice: 0.5 });

    const result = await executeStockSplit(company, 100, 0.1);
    expect(result).toBeTruthy();

    const updated = await Company.findById(company._id);
    expect(updated.sharesOutstanding).toBe(100000);
    expect(updated.sharePrice).toBe(5);

    const holding = await StockHolding.findOne({ userId: holder._id });
    expect(holding.shares).toBe(5);

    // Fractional 0.5 share × $5 = $2.50 cash compensation.
    const fresh = await User.findById(holder._id);
    expect(fresh.balance).toBe(balanceBefore + 2.5);

    const event = await StockMarketEvent.findOne({ companyId: company._id, type: 'reverse_split' });
    expect(event).not.toBeNull();
  });

  it('respects the split cooldown (no repeated splits)', async () => {
    const company = await makeCompany({ sharePrice: 250 });
    await executeStockSplit(company, 100, 2);
    expect(await executeStockSplit(company, 101, 2)).toBeNull();
  });
});

describe('processCorporateActions — engine pass', () => {
  it('applies issuance/buyback/split only when the company state demands it', async () => {
    // Cash-thin → issuance only.
    const thin = await makeCompany({ cash: 50000, sharePrice: 10 });
    const thinResult = await processCorporateActions(thin, 100);
    expect(thinResult.issuance).toBeTruthy();
    expect(thinResult.buyback).toBeNull();
    expect(thinResult.split).toBeNull();

    // Expensive stock → split only.
    const pricey = await makeCompany({ cash: 2000000, sharePrice: 250 });
    const priceyResult = await processCorporateActions(pricey, 100);
    expect(priceyResult.split).toBeTruthy();
    expect(priceyResult.issuance).toBeNull();
    expect(priceyResult.buyback).toBeNull();

    // Healthy cash → buyback only (cash ≥ 50% revenue and stays ≥ 30%).
    const flush = await makeCompany({ cash: 5000000, sharePrice: 10 });
    const flushResult = await processCorporateActions(flush, 100);
    expect(flushResult.buyback).toBeTruthy();
    expect(flushResult.issuance).toBeNull();
    expect(flushResult.split).toBeNull();
  });
});

describe('quarterly dividend integration', () => {
  it('distributes a quarter of profit on every 3rd tick via the engine', async () => {
    const company = await makeCompany({ cash: 5000000, profit: 1000000, lastDividendTick: 0 });
    const holder = await User.create({ username: `q_${Date.now()}`, email: `q_${Date.now()}@t.com`, password: 'x' });
    await StockHolding.create({ userId: holder._id, companyId: company._id, shares: 1000, avgBuyPrice: 20 });

    // distributeDividend with the quarterly multiplier (3× profit).
    const result = await distributeDividend(company, 'regular', 3, 3);
    expect(result).toBeTruthy();
    // pool = min(1,000,000 × 0.35 × 3, 5,000,000 × 0.5) = 1,050,000 → perShare = 1.05
    expect(result.perShare).toBe(1.05);
    expect(result.total).toBe(1050);

    const holding = await StockHolding.findOne({ userId: holder._id });
    expect(holding.unclaimedDividends).toBe(1050);
  });
});
