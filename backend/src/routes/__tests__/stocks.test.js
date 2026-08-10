import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import Company from '../../models/Company.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import StockHolding from '../../models/StockHolding.js';
import GameState from '../../models/GameState.js';
import User from '../../models/User.js';

const app = createApp();

describe('Stock Routes', () => {
  let city;

  beforeEach(async () => {
    await GameState.findOneAndUpdate({}, { tickNumber: 100, $setOnInsert: { season: 1 } }, { upsert: true, new: true });
    city = await createTestCity();
    await Company.deleteMany({});
    await RealEstateCompany.deleteMany({});
    await StockHolding.deleteMany({});
  });

  function createStockCompany(data) {
    return Company.create({
      hqCityId: city._id,
      offices: [{ cityId: city._id, type: 'headquarters', employees: 10, openedTick: 0 }],
      foundedTick: 0,
      description: 'test',
      performance: [],
      ...data,
    });
  }

  describe('GET /stocks/public', () => {
    it('returns empty array when no public companies', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app).get('/stocks/public').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns public companies sorted by market cap', async () => {
      const { token } = await createAuthenticatedUser();
      const reCompany = await RealEstateCompany.create({
        name: 'Test Corp',
        founderId: (
          await User.create({
            username: `f_${Date.now()}`,
            email: `f_${Date.now()}@t.com`,
            password: 'test',
          })
        )._id,
        members: [],
        treasury: { balance: 0, transactions: [] },
        active: true,
        level: 25,
      });
      await createStockCompany({
        name: 'Test Corp',
        ticker: 'TST',
        industry: 'finance',
        isIPO: true,
        active: true,
        sharePrice: 100,
        marketCap: 10_000_000,
        sharesOutstanding: 100_000,
        revenue: 1_000_000,
        realEstateCompanyId: reCompany._id,
      });

      const res = await request(app).get('/stocks/public').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].ticker).toBe('TST');
      expect(res.body[0].marketCap).toBe(10_000_000);
    });
  });

  describe('GET /stocks/dividends', () => {
    it('returns empty dividends when no holdings', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app).get('/stocks/dividends').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.dividends).toEqual([]);
      expect(res.body.totalUnclaimed).toBe(0);
    });

    it('returns unclaimed dividends for IPO holdings', async () => {
      const { user, token } = await createAuthenticatedUser();
      const reCompany = await RealEstateCompany.create({
        name: 'Div Corp',
        founderId: user._id,
        members: [],
        treasury: { balance: 0, transactions: [] },
        active: true,
        level: 25,
        ipo: { listed: true, dividendsPaid: 5000, lastDividendPerShare: 5, lastDividendTick: 100 },
      });
      const stockCompany = await createStockCompany({
        name: 'Div Corp',
        ticker: 'DIV',
        industry: 'finance',
        isIPO: true,
        active: true,
        sharePrice: 50,
        marketCap: 5_000_000,
        sharesOutstanding: 100_000,
        dividendPerShare: 5,
        lastDividendTick: 100,
        revenue: 1_000_000,
        realEstateCompanyId: reCompany._id,
      });
      await StockHolding.create({
        userId: user._id,
        companyId: stockCompany._id,
        shares: 100,
        avgBuyPrice: 50,
        unclaimedDividends: 500,
      });

      const res = await request(app).get('/stocks/dividends').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.dividends.length).toBe(1);
      expect(res.body.dividends[0].ticker).toBe('DIV');
      expect(res.body.dividends[0].unclaimed).toBe(500);
      expect(res.body.totalUnclaimed).toBe(500);
    });
  });

  describe('POST /stocks/dividends/claim', () => {
    it('claims all dividends', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 0 });
      const reCompany = await RealEstateCompany.create({
        name: 'Claim Corp',
        founderId: user._id,
        members: [],
        treasury: { balance: 0, transactions: [] },
        active: true,
        level: 25,
        ipo: { listed: true, dividendsPaid: 5000, lastDividendPerShare: 5, lastDividendTick: 100 },
      });
      const stockCompany = await createStockCompany({
        name: 'Claim Corp',
        ticker: 'CLM',
        industry: 'finance',
        isIPO: true,
        active: true,
        sharePrice: 50,
        marketCap: 5_000_000,
        sharesOutstanding: 100_000,
        dividendPerShare: 5,
        lastDividendTick: 100,
        revenue: 1_000_000,
        realEstateCompanyId: reCompany._id,
      });
      await StockHolding.create({
        userId: user._id,
        companyId: stockCompany._id,
        shares: 100,
        avgBuyPrice: 50,
        unclaimedDividends: 500,
      });

      const res = await request(app).post('/stocks/dividends/claim').set(authHeader(token)).send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalClaimed).toBe(500);
      expect(res.body.balance).toBe(500);
    });

    it('returns error when no unclaimed dividends', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app).post('/stocks/dividends/claim').set(authHeader(token)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No unclaimed dividends');
    });
  });

  describe('non-IPO company dividends', () => {
    it('GET /stocks/dividends returns unclaimed dividends for non-IPO holdings', async () => {
      const { user, token } = await createAuthenticatedUser();
      const stockCompany = await createStockCompany({
        name: 'Private Div Corp',
        ticker: 'PDV',
        industry: 'finance',
        isIPO: false,
        active: true,
        sharePrice: 50,
        marketCap: 5_000_000,
        sharesOutstanding: 100_000,
        dividendPerShare: 2,
        dividendYield: 1.5,
        lastDividendTick: 100,
        revenue: 1_000_000,
      });
      await StockHolding.create({
        userId: user._id,
        companyId: stockCompany._id,
        shares: 100,
        avgBuyPrice: 50,
        unclaimedDividends: 200,
      });

      const res = await request(app).get('/stocks/dividends').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.dividends.length).toBe(1);
      expect(res.body.dividends[0].ticker).toBe('PDV');
      expect(res.body.dividends[0].unclaimed).toBe(200);
      expect(res.body.dividends[0].isIPO).toBe(false);
      expect(res.body.totalUnclaimed).toBe(200);
    });

    it('POST /stocks/dividends/claim claims non-IPO dividends', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 0 });
      const stockCompany = await createStockCompany({
        name: 'Private Claim Corp',
        ticker: 'PCL',
        industry: 'manufacturing',
        isIPO: false,
        active: true,
        sharePrice: 50,
        marketCap: 5_000_000,
        sharesOutstanding: 100_000,
        dividendPerShare: 2,
        lastDividendTick: 100,
        revenue: 1_000_000,
      });
      await StockHolding.create({
        userId: user._id,
        companyId: stockCompany._id,
        shares: 100,
        avgBuyPrice: 50,
        unclaimedDividends: 200,
      });

      const res = await request(app).post('/stocks/dividends/claim').set(authHeader(token)).send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalClaimed).toBe(200);
      expect(res.body.balance).toBe(200);
    });

    it('claims non-IPO dividends even if the company went bankrupt', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 0 });
      const stockCompany = await createStockCompany({
        name: 'Bankrupt Div Corp',
        ticker: 'BKD',
        industry: 'retail',
        isIPO: false,
        active: false,
        sharePrice: 1,
        marketCap: 100_000,
        sharesOutstanding: 100_000,
        dividendPerShare: 2,
        lastDividendTick: 100,
        revenue: 100_000,
      });
      await StockHolding.create({
        userId: user._id,
        companyId: stockCompany._id,
        shares: 50,
        avgBuyPrice: 50,
        unclaimedDividends: 100,
      });

      const res = await request(app).post('/stocks/dividends/claim').set(authHeader(token)).send({});
      expect(res.status).toBe(200);
      expect(res.body.totalClaimed).toBe(100);
    });
  });
});
