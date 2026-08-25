import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, createTestCity, authHeader } from '../../test/helpers.js';
import Loan from '../../models/Loan.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import GameState from '../../models/GameState.js';
import { calculateOfferCore, computeAmortization, calculateRiskLevel } from '../../engine/loanOffers.js';
import { processLoans } from '../../engine/loanProcessing.js';
import { LOAN_CONFIG } from '../../config/loans.js';
import mongoose from 'mongoose';

const app = createApp();

function makeProduct(overrides = {}) {
  return {
    id: 'personal',
    name: 'Personal Loan',
    minPrincipal: 10000,
    maxPrincipal: 2500000,
    minMonths: 6,
    maxMonths: 36,
    baseInterestRate: 0.06,
    creditRequirement: 400,
    ...overrides,
  };
}

function core(overrides = {}) {
  return calculateOfferCore({
    amount: 750000,
    durationMonths: 36,
    creditScore: 700,
    existingDebt: 0,
    netWorth: 5000000,
    repaymentHistory: { meaningfulCompleted: 0, totalMissed: 0, defaulted: false },
    product: makeProduct(),
    ...overrides,
  });
}

describe('calculateOfferCore — pricing engine', () => {
  it('returns an approved offer with all terms for a normal profile', () => {
    const offer = core();
    expect(offer.approved).toBe(true);
    expect(offer.interestRate).toBeGreaterThan(0);
    expect(offer.monthlyPayment).toBeGreaterThan(0);
    expect(offer.totalRepayment).toBeGreaterThan(offer.amount);
    expect(offer.totalInterest).toBe(offer.totalRepayment - offer.amount);
    expect(['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']).toContain(offer.riskLevel);
  });

  describe('amount validation', () => {
    it('accepts the minimum valid amount', () => {
      expect(core({ amount: 10000 }).approved).toBe(true);
    });
    it('accepts the maximum valid amount', () => {
      expect(core({ amount: 2500000 }).approved).toBe(true);
    });
    it('rejects an amount above the maximum', () => {
      const offer = core({ amount: 2500001 });
      expect(offer.approved).toBe(false);
      expect(offer.reason).toMatch(/Amount must be between/);
    });
    it('rejects zero, negative, and non-numeric amounts', () => {
      expect(core({ amount: 0 }).approved).toBe(false);
      expect(core({ amount: -5000 }).approved).toBe(false);
      expect(core({ amount: NaN }).approved).toBe(false);
    });
  });

  describe('duration validation', () => {
    it('accepts the minimum and maximum durations', () => {
      expect(core({ durationMonths: 6 }).approved).toBe(true);
      expect(core({ durationMonths: 36 }).approved).toBe(true);
    });
    it('rejects durations outside the product range', () => {
      expect(core({ durationMonths: 5 }).approved).toBe(false);
      expect(core({ durationMonths: 37 }).approved).toBe(false);
    });
    it('rejects non-integer durations', () => {
      expect(core({ durationMonths: 12.5 }).approved).toBe(false);
    });
    it('mortgage product supports up to 84 months', () => {
      const product = makeProduct({
        id: 'mortgage',
        minMonths: 12,
        maxMonths: 84,
        baseInterestRate: 0.035,
        creditRequirement: 600,
      });
      expect(core({ durationMonths: 84, product }).approved).toBe(true);
      expect(core({ durationMonths: 85, product }).approved).toBe(false);
    });
  });

  describe('credit score pricing', () => {
    it('excellent credit gets a lower rate than average', () => {
      const excellent = core({ creditScore: 820 });
      const average = core({ creditScore: 700 });
      expect(excellent.approved).toBe(true);
      expect(excellent.interestRate).toBeLessThan(average.interestRate);
    });
    it('poor credit gets a higher rate than average', () => {
      const poor = core({ creditScore: 550 });
      const average = core({ creditScore: 700 });
      expect(poor.interestRate).toBeGreaterThan(average.interestRate);
    });
    it('extremely poor credit is rejected by product credit requirement', () => {
      const product = makeProduct({ creditRequirement: 600 });
      const offer = core({ creditScore: 400, product });
      expect(offer.approved).toBe(false);
      expect(offer.reason).toMatch(/Credit score/);
    });
  });

  describe('existing debt pricing', () => {
    it('low debt keeps the normal rate', () => {
      const low = core({ existingDebt: 0 });
      const some = core({ existingDebt: 2000000 }); // 40% of net worth -> +0.25pp tier
      expect(low.interestRate).toBeLessThan(some.interestRate);
    });
    it('high debt produces a higher rate', () => {
      const moderate = core({ existingDebt: 1500000 }); // 30% of net worth
      const high = core({ existingDebt: 3500000 }); // 70% of net worth
      expect(high.interestRate).toBeGreaterThan(moderate.interestRate);
    });
    it('excessive leverage is rejected', () => {
      const offer = core({ existingDebt: 8000000 }); // 160% of net worth
      expect(offer.approved).toBe(false);
      expect(offer.reason).toMatch(/leverage/i);
    });
  });

  describe('duration pricing ordering', () => {
    it('same player + amount: rate 12m < 36m < 60m', () => {
      const product = makeProduct({
        id: 'mortgage',
        minMonths: 12,
        maxMonths: 84,
        baseInterestRate: 0.035,
        creditRequirement: 600,
      });
      const r12 = core({ durationMonths: 12, product });
      const r36 = core({ durationMonths: 36, product });
      const r60 = core({ durationMonths: 60, product });
      expect(r12.interestRate).toBeLessThan(r36.interestRate);
      expect(r36.interestRate).toBeLessThan(r60.interestRate);
      expect(r12.totalInterest).toBeLessThan(r36.totalInterest);
      expect(r36.totalInterest).toBeLessThan(r60.totalInterest);
    });
  });

  describe('repayment history pricing', () => {
    const neutral = { meaningfulCompleted: 0, totalMissed: 0, defaulted: false };
    it('good repayment history lowers the rate', () => {
      const good = core({ repaymentHistory: { meaningfulCompleted: 3, totalMissed: 0, defaulted: false } });
      expect(good.interestRate).toBeLessThan(core({ repaymentHistory: neutral }).interestRate);
    });
    it('multiple missed payments raise the rate', () => {
      const bad = core({ repaymentHistory: { meaningfulCompleted: 0, totalMissed: 4, defaulted: false } });
      expect(bad.interestRate).toBeGreaterThan(core({ repaymentHistory: neutral }).interestRate);
    });
    it('a prior default raises the rate the most', () => {
      const defaulted = core({ repaymentHistory: { meaningfulCompleted: 0, totalMissed: 0, defaulted: true } });
      const bad = core({ repaymentHistory: { meaningfulCompleted: 0, totalMissed: 4, defaulted: false } });
      expect(defaulted.interestRate).toBeGreaterThan(bad.interestRate);
    });
  });

  describe('amortization math', () => {
    it('computes a standard amortized payment', () => {
      const { monthlyPayment, totalRepayment, totalInterest } = computeAmortization(750000, 0.064, 36);
      expect(monthlyPayment).toBe(22953); // 750k @ 6.4%/yr, 36 months
      expect(totalRepayment).toBe(monthlyPayment * 36);
      expect(totalInterest).toBe(totalRepayment - 750000);
    });
    it('zero interest splits principal evenly', () => {
      const { monthlyPayment } = computeAmortization(12000, 0, 12);
      expect(monthlyPayment).toBe(1000);
    });
  });

  describe('risk level', () => {
    it('low for small loans with low debt', () => {
      expect(calculateRiskLevel(0.05, 0.05, 0.1)).toBe('LOW');
    });
    it('very high for large leverage', () => {
      expect(calculateRiskLevel(0.05, 0.9, 0.2)).toBe('VERY_HIGH');
    });
  });
});

describe('POST /bank/apply — flexible loan creation (server-authoritative)', () => {
  beforeEach(async () => {
    await GameState.deleteMany({});
    await GameState.create({ key: 'global', tickNumber: 100 });
    await Loan.deleteMany({});
    await User.deleteMany({});
  });

  async function makeUser(overrides = {}) {
    return createAuthenticatedUser({
      balance: 5_000_000,
      creditScore: 700,
      ...overrides,
    });
  }

  it('creates an amortized loan with a full immutable snapshot', async () => {
    const { user, token } = await makeUser();

    const res = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 750000, durationMonths: 36 });

    expect(res.status).toBe(200);
    const { loan, offer } = res.body;

    // Server-computed terms (client never supplies a rate)
    expect(loan.principal).toBe(750000);
    expect(loan.interestRate).toBe(offer.interestRate);
    expect(loan.monthlyPayment).toBe(offer.monthlyPayment);
    expect(loan.totalRepayment).toBe(offer.totalRepayment);
    expect(loan.totalInterest).toBe(offer.totalInterest);
    expect(loan.durationMonths).toBe(36);
    expect(loan.durationTicks).toBe(36);
    expect(loan.ticksRemaining).toBe(36);
    expect(loan.riskLevel).toBeTruthy();
    expect(loan.creditScoreAtApply).toBe(700);
    expect(loan.amortized).toBe(true);
    expect(loan.monthlyInterestRate).toBeCloseTo(loan.interestRate / 12, 5);
    // Amortized loans carry only the outstanding principal as the balance
    expect(loan.remainingBalance).toBe(750000);

    const freshUser = await User.findById(user._id);
    expect(freshUser.balance).toBe(5_000_000 + 750000);
    expect(freshUser.lifetimeStats.totalLoansTaken).toBe(1);

    // Deterministic payment matches the amortization formula
    const expected = computeAmortization(750000, loan.interestRate, 36);
    expect(loan.monthlyPayment).toBe(expected.monthlyPayment);
  });

  it('accepts durationTicks for backward compatibility', async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 100000, durationTicks: 12 });
    expect(res.status).toBe(200);
    expect(res.body.loan.durationMonths).toBe(12);
  });

  it('rejects amounts above the product maximum', async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 5000000, durationMonths: 12 });
    expect(res.status).toBe(400);
    expect(res.body.offer.approved).toBe(false);
  });

  it('rejects invalid durations', async () => {
    const { token } = await makeUser();
    for (const durationMonths of [5, 37, 12.5, -1]) {
      const res = await request(app)
        .post('/bank/apply')
        .set(authHeader(token))
        .send({ productId: 'personal', principal: 100000, durationMonths });
      expect(res.status, `duration ${durationMonths}`).toBe(400);
    }
  });

  it('rejects products the credit score cannot access', async () => {
    const { token } = await makeUser({ creditScore: 500 });
    const res = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'mortgage', principal: 200000, durationMonths: 24 });
    expect(res.status).toBe(400);
  });

  it('rejects when total debt would exceed the borrowing cap', async () => {
    // Score 580 -> multiplier 0.6 -> cap shrinks relative to net worth as the
    // loan credits the balance, so the second loan cannot fit.
    const { user, token } = await makeUser({ balance: 100000, creditScore: 580 });
    await createTestProperty({ ownerId: user._id, currentPrice: 900000, basePrice: 900000 });
    await Loan.create({
      userId: user._id,
      type: 'personal',
      principal: 400000,
      remainingBalance: 400000,
      interestRate: 0.06,
      durationTicks: 12,
      ticksRemaining: 12,
      paymentPerTick: 50000,
      active: true,
      creditScoreAtApply: 580,
    });

    const first = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 100000, durationMonths: 6 });
    expect(first.status, JSON.stringify(first.body)).toBe(200);

    const second = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 100000, durationMonths: 6 });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/borrowing capacity/);

    expect(await Loan.countDocuments({ userId: user._id, active: true })).toBe(2);
  });

  it('two simultaneous applications cannot bypass the borrowing limit', async () => {
    const { user, token } = await makeUser({ balance: 100000, creditScore: 580 });
    await createTestProperty({ ownerId: user._id, currentPrice: 900000, basePrice: 900000 });
    await Loan.create({
      userId: user._id,
      type: 'personal',
      principal: 400000,
      remainingBalance: 400000,
      interestRate: 0.06,
      durationTicks: 12,
      ticksRemaining: 12,
      paymentPerTick: 50000,
      active: true,
      creditScoreAtApply: 580,
    });

    const [a, b] = await Promise.all([
      request(app)
        .post('/bank/apply')
        .set(authHeader(token))
        .send({ productId: 'personal', principal: 100000, durationMonths: 6 }),
      request(app)
        .post('/bank/apply')
        .set(authHeader(token))
        .send({ productId: 'personal', principal: 100000, durationMonths: 6 }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses, JSON.stringify([a.body, b.body])).toEqual([200, 400]);

    // Exactly one of the two concurrent requests was granted.
    const active = await Loan.find({ userId: user._id, active: true });
    expect(active.length).toBe(2); // 1 pre-loaded + 1 new
    const totalDebt = active.reduce((s, l) => s + l.remainingBalance, 0);
    expect(totalDebt).toBeLessThanOrEqual(540000);
  });

  it('loan snapshot is immutable — later credit/wealth changes do not affect it', async () => {
    const { user, token } = await makeUser({ balance: 5_000_000, creditScore: 700 });

    const res = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 750000, durationMonths: 36 });
    expect(res.status).toBe(200);
    const loanId = res.body.loan._id;
    const snapshot = res.body.loan;

    // Change the player's financial profile afterwards
    await User.findByIdAndUpdate(user._id, { creditScore: 400, balance: 100 });
    await Loan.updateOne({ _id: loanId }, { $set: { ticksRemaining: 30 } });
    await processLoans(101); // engine runs with the new profile

    const fresh = await Loan.findById(loanId);
    expect(fresh.interestRate).toBe(snapshot.interestRate);
    expect(fresh.monthlyPayment).toBe(snapshot.monthlyPayment);
    expect(fresh.totalRepayment).toBe(snapshot.totalRepayment);
    expect(fresh.durationMonths).toBe(36);
  });

  it('the engine fully amortizes a loan to $0 over its term', async () => {
    const { user, token } = await makeUser({ balance: 100_000_000, creditScore: 820 });

    const res = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 240000, durationMonths: 6 });
    expect(res.status).toBe(200);
    const loanId = res.body.loan._id;
    const monthly = res.body.loan.monthlyPayment;
    const postApplyBalance = res.body.balance;

    for (let tick = 101; tick <= 106; tick++) {
      await processLoans(tick);
    }

    const finished = await Loan.findById(loanId);
    expect(finished.active).toBe(false);
    expect(finished.remainingBalance).toBe(0);
    expect(finished.ticksRemaining).toBe(0);
    expect(finished.ticksPaid).toBe(6);

    const freshUser = await User.findById(user._id);
    const paid = postApplyBalance - freshUser.balance;
    // The final payment is adjusted to land exactly at $0, so the total paid
    // is within one monthly payment of the straight amortization schedule.
    expect(paid).toBeGreaterThan(monthly * 5);
    expect(paid).toBeLessThanOrEqual(monthly * 6);
  });
});

describe('GET /bank/offer-preview', () => {
  beforeEach(async () => {
    await Loan.deleteMany({});
    await User.deleteMany({});
  });

  it('returns the authoritative live offer for amount + duration', async () => {
    const { token } = await createAuthenticatedUser({ balance: 5_000_000, creditScore: 700 });

    const res = await request(app)
      .get('/bank/offer-preview?productId=personal&amount=750000&durationMonths=36')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
    expect(res.body.interestRate).toBeGreaterThan(0);
    expect(res.body.monthlyPayment).toBeGreaterThan(0);
    expect(res.body.totalRepayment).toBe(750000 + res.body.totalInterest);
    expect(res.body.riskLevel).toBeTruthy();
    expect(res.body.maxPrincipal).toBeGreaterThanOrEqual(750000);
  });

  it('reflects an unapproved state with the rejection reason', async () => {
    const { token } = await createAuthenticatedUser({ balance: 500000, creditScore: 670 });

    const res = await request(app)
      .get('/bank/offer-preview?productId=personal&amount=600000&durationMonths=6')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(false);
    expect(res.body.reason).toBeTruthy();
  });

  it('duration pricing increases with term length', async () => {
    const { token } = await createAuthenticatedUser({ balance: 5_000_000, creditScore: 820 });

    const r12 = await request(app)
      .get('/bank/offer-preview?productId=mortgage&amount=750000&durationMonths=12')
      .set(authHeader(token));
    const r60 = await request(app)
      .get('/bank/offer-preview?productId=mortgage&amount=750000&durationMonths=60')
      .set(authHeader(token));

    expect(r12.body.approved).toBe(true);
    expect(r60.body.approved).toBe(true);
    expect(r12.body.interestRate).toBeLessThan(r60.body.interestRate);
  });
});

describe('LOAN_CONFIG sanity', () => {
  it('duration premium table is ascending', () => {
    for (let i = 1; i < LOAN_CONFIG.durationPremiums.length; i++) {
      expect(LOAN_CONFIG.durationPremiums[i].premium).toBeGreaterThanOrEqual(
        LOAN_CONFIG.durationPremiums[i - 1].premium,
      );
      expect(LOAN_CONFIG.durationPremiums[i].months).toBeGreaterThan(LOAN_CONFIG.durationPremiums[i - 1].months);
    }
  });

  it('amount and debt premium tables are ascending', () => {
    for (const key of ['amountPremiums', 'debtPremiums']) {
      const table = LOAN_CONFIG[key];
      for (let i = 1; i < table.length; i++) {
        expect(table[i].premium).toBeGreaterThanOrEqual(table[i - 1].premium);
      }
    }
  });
});

describe('AUDIT — borrowing capacity cannot be manufactured from borrowed cash', () => {
  // lendingNetWorth = propertyValue + max(0, balance − existingDebt).
  // A loan credits balance and debits existingDebt by the same principal, so
  // borrowing must never increase the lending net worth used for capacity.
  beforeEach(async () => {
    await GameState.deleteMany({});
    await GameState.create({ key: 'global', tickNumber: 100 });
    await Loan.deleteMany({});
    await User.deleteMany({});
    await Property.deleteMany({});
  });

  it('borrow max -> borrow again: second loan is rejected (score 800, 2.0x tier)', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 100000, creditScore: 820 });
    await createTestProperty({ ownerId: user._id, currentPrice: 1000000, basePrice: 1000000 });

    // lendingNetWorth = 1,000,000 + max(0, 100k − 0) = 1.1M -> maxDebt = 2.2M
    const first = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'mortgage', principal: 2200000, durationMonths: 24 });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.offer.lendingNetWorth).toBe(1100000);
    expect(first.body.offer.maxDebt).toBe(2200000);

    // Balance is now 2.3M — but lending net worth is UNCHANGED (2.3M − 2.2M = 100k).
    const preview = await request(app)
      .get('/bank/offer-preview?productId=mortgage&amount=100000&durationMonths=24')
      .set(authHeader(token));
    expect(preview.body.lendingNetWorth).toBe(1100000);
    expect(preview.body.approved).toBe(false);

    // Any second loan is rejected — borrowed cash created no new capacity
    // (the excessive-leverage gate fires first at 200% of lending net worth).
    const second = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'mortgage', principal: 100000, durationMonths: 24 });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/borrowing capacity|leverage/i);

    const totalDebt = (await Loan.find({ userId: user._id, active: true })).reduce((s, l) => s + l.remainingBalance, 0);
    expect(totalDebt).toBe(2200000);
  });

  it('borrow max concurrently: only one loan is granted (score 800 tier)', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 100000, creditScore: 820 });
    await createTestProperty({ ownerId: user._id, currentPrice: 1000000, basePrice: 1000000 });

    const [a, b] = await Promise.all([
      request(app)
        .post('/bank/apply')
        .set(authHeader(token))
        .send({ productId: 'mortgage', principal: 2200000, durationMonths: 24 }),
      request(app)
        .post('/bank/apply')
        .set(authHeader(token))
        .send({ productId: 'mortgage', principal: 2200000, durationMonths: 24 }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses, JSON.stringify([a.body, b.body])).toEqual([200, 400]);

    const active = await Loan.find({ userId: user._id, active: true });
    expect(active.length).toBe(1);
    const totalDebt = active.reduce((s, l) => s + l.remainingBalance, 0);
    expect(totalDebt).toBe(2200000);
  });

  it('borrow -> buy property with the cash -> borrow again (legitimate leverage)', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 100000, creditScore: 820 });
    await createTestProperty({ ownerId: user._id, currentPrice: 1000000, basePrice: 1000000 });

    const first = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'mortgage', principal: 2200000, durationMonths: 24 });
    expect(first.status).toBe(200);

    // Convert borrowed cash into real property: buy a 1.5M property.
    const city = await createTestCity();
    const bought = await Property.create({
      name: 'Leveraged Purchase',
      cityId: city._id,
      type: 'apartment',
      ownerId: user._id,
      basePrice: 1500000,
      currentPrice: 1500000,
      forSale: false,
    });
    const freshUser = await User.findById(user._id);
    freshUser.balance -= 1500000;
    freshUser.ownedProperties.push(bought._id);
    await freshUser.save();

    // lendingNetWorth = (1M + 1.5M) + max(0, 0.8M − 2.2M) = 2.5M
    const preview = await request(app)
      .get('/bank/offer-preview?productId=mortgage&amount=1000000&durationMonths=24')
      .set(authHeader(token));
    expect(preview.body.lendingNetWorth).toBe(2500000);
    expect(preview.body.approved).toBe(true);

    const second = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'mortgage', principal: 1000000, durationMonths: 24 });
    expect(second.status, JSON.stringify(second.body)).toBe(200);
  });

  it('borrow -> repay part -> borrow again (repayment restores capacity)', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 100000, creditScore: 820 });
    await createTestProperty({ ownerId: user._id, currentPrice: 1000000, basePrice: 1000000 });

    const first = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'mortgage', principal: 2200000, durationMonths: 24 });
    expect(first.status).toBe(200);
    const loanId = first.body.loan._id;

    // Repay 1M: debt 1.2M, balance 1.3M -> lendingNW = 1M + max(0, 1.3M − 1.2M) = 1.1M
    const repay = await request(app).post('/bank/repay').set(authHeader(token)).send({ loanId, amount: 1000000 });
    expect(repay.status).toBe(200);

    const room = await request(app)
      .get('/bank/offer-preview?productId=mortgage&amount=800000&durationMonths=24')
      .set(authHeader(token));
    expect(room.body.approved).toBe(true);

    const second = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'mortgage', principal: 800000, durationMonths: 24 });
    expect(second.status).toBe(200);

    // Now the total debt is capped again: another 400k pushes over 2.2M.
    const third = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'mortgage', principal: 400000, durationMonths: 24 });
    expect(third.status).toBe(400);
  });

  it('company loans and legacy personal loans count against flexible-loan capacity', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 100000, creditScore: 700 });
    await createTestProperty({ ownerId: user._id, currentPrice: 1000000, basePrice: 1000000 });

    // Company loan (companyId set) + legacy personal loan (term-based).
    await Loan.create({
      userId: user._id,
      companyId: new mongoose.Types.ObjectId(),
      type: 'business',
      principal: 400000,
      remainingBalance: 400000,
      interestRate: 0.06,
      durationTicks: 12,
      ticksRemaining: 12,
      paymentPerTick: 40000,
      active: true,
      creditScoreAtApply: 700,
    });
    await Loan.create({
      userId: user._id,
      type: 'personal',
      principal: 200000,
      remainingBalance: 250000, // legacy loans carry principal + interest
      interestRate: 0.06,
      durationTicks: 12,
      ticksRemaining: 12,
      paymentPerTick: 21000,
      active: true,
      creditScoreAtApply: 700,
    });

    // lendingNW = 1M + max(0, 100k − 650k) = 1M -> maxDebt = 1M -> room = 350k
    const preview = await request(app)
      .get('/bank/offer-preview?productId=personal&amount=350000&durationMonths=6')
      .set(authHeader(token));
    expect(preview.body.existingDebt).toBe(650000);
    expect(preview.body.approved).toBe(true);

    const ok = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 350000, durationMonths: 6 });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);

    const over = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 1000, durationMonths: 6 });
    expect(over.status).toBe(400);
  });

  it('a company loan cannot manufacture personal capacity, and repaying it restores capacity', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 100000, creditScore: 700 });
    await createTestProperty({ ownerId: user._id, currentPrice: 1000000, basePrice: 1000000 });

    // Company loan money never touches the player's balance; it must also not
    // add capacity — it only consumes it.
    await Loan.create({
      userId: user._id,
      companyId: new mongoose.Types.ObjectId(),
      type: 'business',
      principal: 400000,
      remainingBalance: 400000,
      interestRate: 0.06,
      durationTicks: 12,
      ticksRemaining: 12,
      paymentPerTick: 40000,
      active: true,
      creditScoreAtApply: 700,
    });

    const preview = await request(app)
      .get('/bank/offer-preview?productId=personal&amount=100000&durationMonths=6')
      .set(authHeader(token));
    expect(preview.body.existingDebt).toBe(400000);
    expect(preview.body.lendingNetWorth).toBe(1000000); // unchanged by the company loan
    expect(preview.body.maxDebt).toBe(1000000);
    expect(preview.body.approved).toBe(true);

    // Fill the remaining room (600k) with a mortgage loan.
    const ok = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'mortgage', principal: 600000, durationMonths: 24 });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);

    // Capacity is exhausted — the second personal loan must fail.
    const over = await request(app)
      .post('/bank/apply')
      .set(authHeader(token))
      .send({ productId: 'personal', principal: 1000, durationMonths: 6 });
    expect(over.status).toBe(400);

    // Repaying the COMPANY loan restores exactly that much capacity.
    const companyLoan = await Loan.findOne({ userId: user._id, companyId: { $ne: null } });
    const repay = await request(app)
      .post('/bank/repay')
      .set(authHeader(token))
      .send({ loanId: companyLoan._id, amount: 400000 });
    expect(repay.status).toBe(200);

    const restored = await request(app)
      .get('/bank/offer-preview?productId=personal&amount=399000&durationMonths=6')
      .set(authHeader(token));
    expect(restored.body.approved).toBe(true);
  });

  it('legacy (non-amortized) loans keep the original term-based repayment math', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 100_000_000, creditScore: 700 });

    // Legacy loan: full interest loaded upfront, amortized:false, no monthly
    // snapshot fields — exactly what pre-flexible-loan data looks like.
    const legacy = await Loan.create({
      userId: user._id,
      type: 'personal',
      principal: 120000,
      remainingBalance: 120000 + Math.round(120000 * 0.12), // 134400
      interestRate: 0.12, // whole-term rate
      durationTicks: 12,
      ticksRemaining: 12,
      paymentPerTick: Math.ceil(134400 / 12), // 11200
      active: true,
      creditScoreAtApply: 700,
      amortized: false,
    });

    await processLoans(101);

    const fresh = await Loan.findById(legacy._id);
    // Old formula: interest = remainingBalance × (rate / durationTicks)
    const expectedInterest = Math.round(134400 * (0.12 / 12)); // 1344
    const expectedPrincipal = 11200 - expectedInterest; // 9856
    expect(fresh.ticksPaid).toBe(1);
    expect(fresh.remainingBalance).toBe(134400 - expectedPrincipal);
    expect(fresh.monthlyPayment).toBeUndefined();
    expect(fresh.amortized).toBe(false);
    expect(fresh.interestRate).toBe(0.12);
  });

  it('client-provided financial values are ignored at apply time', async () => {
    const { token } = await createAuthenticatedUser({ balance: 5_000_000, creditScore: 700 });

    const res = await request(app).post('/bank/apply').set(authHeader(token)).send({
      productId: 'personal',
      principal: 750000,
      durationMonths: 36,
      interestRate: 0.001, // bogus
      monthlyPayment: 1, // bogus
      creditScore: 850, // bogus
      netWorth: 999999999, // bogus
      lendingNetWorth: 999999999, // bogus
      existingDebt: 0, // bogus
      maxLoan: 999999999, // bogus
      maxDebt: 999999999, // bogus
    });

    expect(res.status).toBe(200);
    const { loan, offer } = res.body;
    expect(loan.interestRate).toBe(offer.interestRate);
    expect(loan.monthlyPayment).toBe(offer.monthlyPayment);
    expect(loan.interestRate).not.toBe(0.001);
    expect(loan.monthlyPayment).not.toBe(1);
    expect(offer.creditScore).toBe(700);
    expect(offer.netWorth).toBeLessThan(100000000);
    expect(offer.lendingNetWorth).toBe(5000000);
    expect(offer.maxDebt).toBe(5000000);
  });

  it('the income proxy (balance × 5%) has no input into loan offers', () => {
    // The offer engine has no income parameter — eligibility and pricing are
    // driven purely by credit score, debt, lending net worth and duration.
    const args = {
      amount: 100000,
      durationMonths: 12,
      creditScore: 700,
      existingDebt: 0,
      netWorth: 1000000,
      repaymentHistory: { meaningfulCompleted: 0, totalMissed: 0, defaulted: false },
      product: makeProduct(),
    };
    const base = calculateOfferCore(args);
    const withIncome = calculateOfferCore({ ...args, income: 999999 }); // would-be bogus input
    expect(withIncome.interestRate).toBe(base.interestRate);
    expect(withIncome.monthlyPayment).toBe(base.monthlyPayment);
    expect(withIncome.approved).toBe(base.approved);
  });
});

describe('AUDIT — /bank/options advertises only approvable amounts', () => {
  beforeEach(async () => {
    await GameState.deleteMany({});
    await GameState.create({ key: 'global', tickNumber: 100 });
    await Loan.deleteMany({});
    await User.deleteMany({});
    await Property.deleteMany({});
  });

  it('options use lending net worth and effectiveMaxPrincipal respects existing debt', async () => {
    // gross netWorth = 1M, lendingNetWorth = 900k + max(0, 100k − 400k) = 900k
    const { user, token } = await createAuthenticatedUser({ balance: 100000, creditScore: 670 });
    await createTestProperty({ ownerId: user._id, currentPrice: 900000, basePrice: 900000 });
    await Loan.create({
      userId: user._id,
      type: 'personal',
      principal: 400000,
      remainingBalance: 400000,
      interestRate: 0.06,
      durationTicks: 12,
      ticksRemaining: 12,
      paymentPerTick: 40000,
      active: true,
      creditScoreAtApply: 670,
    });

    const res = await request(app).get('/bank/options').set(authHeader(token));
    expect(res.status).toBe(200);

    for (const opt of res.body) {
      // maxDebt = 900k x 1.0 = 900k; room after existing debt = 500k.
      // No product may advertise more than the approvable maximum.
      expect(opt.effectiveMaxPrincipal, opt.productId).toBeLessThanOrEqual(500000);
      expect(opt.effectiveMaxPrincipal).toBeGreaterThanOrEqual(0);
    }

    // The personal product (cap = lendingNW x 0.5 = 450k) keeps its cap;
    // products whose raw cap exceeded the room are clamped to the room.
    const personal = res.body.find((o) => o.productId === 'personal');
    expect(personal.maxPrincipal).toBeLessThanOrEqual(450000);
    expect(personal.effectiveMaxPrincipal).toBeLessThanOrEqual(personal.maxPrincipal);
  });

  it('every advertised slider position is approvable end-to-end (options -> offer)', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 100000, creditScore: 700 });
    await createTestProperty({ ownerId: user._id, currentPrice: 1000000, basePrice: 1000000 });

    const options = (await request(app).get('/bank/options').set(authHeader(token))).body;
    expect(options.length).toBeGreaterThan(0);

    for (const opt of options) {
      const max = opt.effectiveMaxPrincipal ?? opt.maxPrincipal;
      // Sample the full range including both endpoints.
      for (const amount of [opt.minPrincipal, Math.floor((opt.minPrincipal + max) / 2), max]) {
        if (amount < opt.minPrincipal) continue;
        const preview = await request(app)
          .get(`/bank/offer-preview?productId=${opt.productId}&amount=${amount}&durationMonths=${opt.minMonths}`)
          .set(authHeader(token));
        // The advertised maximum must never be rejected for exceeding capacity
        // (credit gate aside — these fixtures all pass it).
        expect(preview.body.approved, `${opt.productId} @ ${amount}`).not.toBe(false);
      }
    }
  });

  it('a player with no remaining debt room gets no usable personal option', async () => {
    // lendingNW = 900k; pre-load debt to exactly the cap -> room = 0.
    const { user, token } = await createAuthenticatedUser({ balance: 100000, creditScore: 670 });
    await createTestProperty({ ownerId: user._id, currentPrice: 900000, basePrice: 900000 });
    await Loan.create({
      userId: user._id,
      type: 'personal',
      principal: 900000,
      remainingBalance: 900000,
      interestRate: 0.06,
      durationTicks: 12,
      ticksRemaining: 12,
      paymentPerTick: 80000,
      active: true,
      creditScoreAtApply: 670,
    });

    const res = await request(app).get('/bank/options').set(authHeader(token));
    expect(res.status).toBe(200);
    for (const opt of res.body) {
      expect(opt.effectiveMaxPrincipal, opt.productId).toBeLessThanOrEqual(0);
    }
  });
});
