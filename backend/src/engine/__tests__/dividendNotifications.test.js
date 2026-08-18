import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader, setTestTick } from '../../test/helpers.js';
import Company from '../../models/Company.js';
import StockHolding from '../../models/StockHolding.js';
import Notification from '../../models/Notification.js';
import { cacheDelPattern } from '../../utils/cache.js';
import { distributeDividend } from '../stockMarket.js';

const app = createApp();

async function makeCompany(ticker, name, overrides = {}) {
  const city = await createTestCity();
  return Company.create({
    ticker,
    name,
    industry: 'finance',
    size: 'large',
    profit: 1_000_000,
    cash: 1_000_000,
    sharesOutstanding: 20_000,
    sharePrice: 50,
    hqCityId: city._id,
    active: true,
    isIPO: false,
    dividendHistory: [],
    ...overrides,
  });
}

describe('Public company dividend notifications', () => {
  beforeEach(async () => {
    await setTestTick(100);
  });

  afterEach(async () => {
    delete global.currentTick;
    await cacheDelPattern('cf:stock*');
  });

  it('creates a dividend notification per shareholder with amount, company and navigation metadata', async () => {
    const company = await makeCompany('TST1', 'Test Corp One');
    const { user } = await createAuthenticatedUser();
    await StockHolding.create({ userId: user._id, companyId: company._id, shares: 10, avgBuyPrice: 40 });

    const result = await distributeDividend(company, 'regular', 100);
    expect(result).toBeTruthy();

    const notif = await Notification.findOne({ userId: user._id, type: 'dividend' });
    expect(notif).toBeTruthy();
    expect(notif.eventKey).toBe(`dividend:${company._id}:100:${user._id}`);
    // 10 shares * $17.50 per share
    expect(notif.amount).toBe(175);
    expect(notif.companyName).toBe('Test Corp One');
    expect(notif.route).toBe(`/company/${company._id}`);
    expect(notif.entityType).toBe('company');
    expect(notif.entityId.toString()).toBe(company._id.toString());
    expect(notif.relatedId.toString()).toBe(company._id.toString());
    expect(notif.priority).toBe('medium');
  });

  it('same dividend tick cannot create duplicate notifications', async () => {
    const company = await makeCompany('TST2', 'Test Corp Two');
    const { user } = await createAuthenticatedUser();
    await StockHolding.create({ userId: user._id, companyId: company._id, shares: 10, avgBuyPrice: 40 });

    await distributeDividend(company, 'regular', 100);
    // Simulate a tick re-run: identical dividend tick, identical company.
    await distributeDividend(company, 'regular', 100);

    const count = await Notification.countDocuments({ userId: user._id, type: 'dividend' });
    expect(count).toBe(1);
  });

  it('multiple companies paying in the same tick produce separate notifications', async () => {
    const companyA = await makeCompany('TSTA', 'Alpha Corp');
    const companyB = await makeCompany('TSTB', 'Beta Corp');
    const { user } = await createAuthenticatedUser();
    await StockHolding.create({ userId: user._id, companyId: companyA._id, shares: 10, avgBuyPrice: 40 });
    await StockHolding.create({ userId: user._id, companyId: companyB._id, shares: 5, avgBuyPrice: 40 });

    await distributeDividend(companyA, 'regular', 100);
    await distributeDividend(companyB, 'regular', 100);

    const notifs = await Notification.find({ userId: user._id, type: 'dividend' }).sort({ companyName: 1 });
    expect(notifs.length).toBe(2);
    expect(notifs[0].eventKey).toBe(`dividend:${companyA._id}:100:${user._id}`);
    expect(notifs[1].eventKey).toBe(`dividend:${companyB._id}:100:${user._id}`);
    expect(notifs[0].companyName).toBe('Alpha Corp');
    expect(notifs[1].companyName).toBe('Beta Corp');
    expect(notifs[0].amount).toBe(175);
    expect(notifs[1].amount).toBe(87.5);
  });

  it('claiming dividends does not create another dividend-received notification', async () => {
    const company = await makeCompany('TSTC', 'Claim Corp');
    const { user, token } = await createAuthenticatedUser({ balance: 1000 });
    await StockHolding.create({ userId: user._id, companyId: company._id, shares: 10, avgBuyPrice: 40 });

    await distributeDividend(company, 'regular', 100);
    const before = await Notification.countDocuments({ userId: user._id, type: 'dividend' });
    expect(before).toBe(1);

    const res = await request(app).post('/stocks/dividends/claim').set(authHeader(token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const after = await Notification.countDocuments({ userId: user._id, type: 'dividend' });
    expect(after).toBe(1);

    const holding = await StockHolding.findOne({ userId: user._id, companyId: company._id });
    expect(holding.unclaimedDividends).toBe(0);
  });
});
