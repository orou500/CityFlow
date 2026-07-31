import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import Company from '../../models/Company.js';
import StockHolding from '../../models/StockHolding.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import Loan from '../../models/Loan.js';
import GameState from '../../models/GameState.js';
import {
  liquidateRealEstateCompanies,
  liquidatePublicCompanies,
  resetCompanyEconomy,
} from '../seasonReset.js';

describe('Season Reset — Company Liquidation', () => {
  let city;
  let founder, member1, member2;

  beforeEach(async () => {
    // Clean up any leftover data from other tests
    await RealEstateCompany.deleteMany({});
    await Company.deleteMany({});
    await StockHolding.deleteMany({});
    await Property.deleteMany({});
    await Loan.deleteMany({});
    await City.deleteMany({});

    await GameState.findOneAndUpdate({}, { tickNumber: 100, $setOnInsert: { season: 1 } }, { upsert: true, new: true });
    city = await City.create({
      name: 'Test City',
      country: 'Testland',
      coordinates: { lat: 0, lng: 0 },
      population: 100000,
    });
    founder = await User.create({
      username: `founder_${Date.now()}`,
      email: `founder_${Date.now()}@test.com`,
      password: 'Password123',
      balance: 100_000_000,
      level: 30,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    member1 = await User.create({
      username: `member1_${Date.now()}`,
      email: `m1_${Date.now()}@test.com`,
      password: 'Password123',
      balance: 10_000_000,
      level: 15,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    member2 = await User.create({
      username: `member2_${Date.now()}`,
      email: `m2_${Date.now()}@test.com`,
      password: 'Password123',
      balance: 5_000_000,
      level: 10,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
  });

  afterEach(async () => {
    await RealEstateCompany.deleteMany({});
    await Company.deleteMany({});
    await StockHolding.deleteMany({});
    await Property.deleteMany({});
    await Loan.deleteMany({});
    await City.deleteMany({});
    await User.deleteMany({});
  });

  // ─── LIQUIDATE RE COMPANIES ───────────────────────────────

  it('distributes company net value to members by share ownership', async () => {
    const company = await RealEstateCompany.create({
      name: `LiquidationTest_${Date.now()}`,
      founderId: founder._id,
      members: [
        { userId: founder._id, role: 'ceo', shares: 600 },
        { userId: member1._id, role: 'director', shares: 250 },
        { userId: member2._id, role: 'member', shares: 150 },
      ],
      shares: { totalShares: 1000, treasuryShares: 0, parValue: 100 },
      treasury: { balance: 50_000_000, transactions: [] },
      stats: { netWorth: 50_000_000, propertiesOwned: 3, totalRentalIncome: 0 },
      level: 5,
      active: true,
      foundedTick: 0,
    });

    // Add company-owned properties
    const prop1 = await Property.create({
      name: 'Company HQ', type: 'commercial', cityId: city._id,
      ownerId: founder._id, companyId: company._id,
      currentPrice: 30_000_000, basePrice: 30_000_000,
    });
    const prop2 = await Property.create({
      name: 'Warehouse', type: 'commercial', cityId: city._id,
      ownerId: founder._id, companyId: company._id,
      currentPrice: 20_000_000, basePrice: 20_000_000,
    });

    // Record balances before liquidation
    const founderBefore = await User.findById(founder._id);
    const member1Before = await User.findById(member1._id);
    const member2Before = await User.findById(member2._id);

    const result = await liquidateRealEstateCompanies();

    expect(result.liquidated).toBe(1);
    expect(result.totalPayout).toBeGreaterThan(0);

    // Company value = 50M treasury + 30M + 20M properties = 100M
    // Founder (60%): 60M, Member1 (25%): 25M, Member2 (15%): 15M
    const founderAfter = await User.findById(founder._id);
    const member1After = await User.findById(member1._id);
    const member2After = await User.findById(member2._id);

    expect(founderAfter.balance).toBeGreaterThan(founderBefore.balance);
    expect(member1After.balance).toBeGreaterThan(member1Before.balance);
    expect(member2After.balance).toBeGreaterThan(member2Before.balance);

    // Verify proportional distribution
    const founderGain = founderAfter.balance - founderBefore.balance;
    const member1Gain = member1After.balance - member1Before.balance;
    const member2Gain = member2After.balance - member2Before.balance;

    expect(founderGain).toBeGreaterThan(member1Gain);
    expect(member1Gain).toBeGreaterThan(member2Gain);
  });

  it('handles company with debt reducing net value', async () => {
    const company = await RealEstateCompany.create({
      name: `DebtTest_${Date.now()}`,
      founderId: founder._id,
      members: [{ userId: founder._id, role: 'ceo', shares: 1000 }],
      shares: { totalShares: 1000, treasuryShares: 0, parValue: 100 },
      treasury: { balance: 100_000_000, transactions: [] },
      stats: { netWorth: 100_000_000, propertiesOwned: 0, totalRentalIncome: 0 },
      level: 3,
      active: true,
      foundedTick: 0,
    });

    const loan = await Loan.create({
      userId: founder._id,
      companyId: company._id,
      principal: 80_000_000,
      remainingBalance: 60_000_000,
      active: true,
      type: 'business',
      interestRate: 0.08,
      durationTicks: 24,
      ticksRemaining: 20,
      paymentPerTick: 5_000_000,
    });

    const founderBefore = await User.findById(founder._id);
    await liquidateRealEstateCompanies();

    // Net value = 100M treasury - 60M debt = 40M
    // Founder gets 100% = 40M
    const founderAfter = await User.findById(founder._id);
    expect(founderAfter.balance).toBe(founderBefore.balance + 40_000_000);
  });

  it('returns zero payout for company with zero net value', async () => {
    const company = await RealEstateCompany.create({
      name: `ZeroVal_${Date.now()}`,
      founderId: founder._id,
      members: [{ userId: founder._id, role: 'ceo', shares: 1000 }],
      shares: { totalShares: 1000, treasuryShares: 0, parValue: 100 },
      treasury: { balance: 0, transactions: [] },
      stats: { netWorth: 0, propertiesOwned: 0 },
      level: 1,
      active: true,
      foundedTick: 0,
    });

    const founderBefore = await User.findById(founder._id);
    const result = await liquidateRealEstateCompanies();

    expect(result.totalPayout).toBe(0);
    const founderAfter = await User.findById(founder._id);
    expect(founderAfter.balance).toBe(founderBefore.balance);
  });

  // ─── IPO LIQUIDATION ──────────────────────────────────────

  it('distributes IPO company value to shareholders', async () => {
    const stockCompany = await Company.create({
      name: 'Test Public Co',
      ticker: 'TPC',
      industry: 'finance',
      size: 'medium',
      sharePrice: 100,
      previousSharePrice: 100,
      marketCap: 100_000_000,
      sharesOutstanding: 1_000_000,
      isIPO: true,
      active: true,
      hqCityId: city._id,
      foundedTick: 0,
    });

    // Create shareholder holdings
    await StockHolding.create([
      { userId: founder._id, companyId: stockCompany._id, shares: 500_000, avgBuyPrice: 90, locked: false },
      { userId: member1._id, companyId: stockCompany._id, shares: 300_000, avgBuyPrice: 95, locked: false },
      { userId: member2._id, companyId: stockCompany._id, shares: 200_000, avgBuyPrice: 85, locked: false },
    ]);

    const founderBefore = await User.findById(founder._id);
    const member1Before = await User.findById(member1._id);
    const member2Before = await User.findById(member2._id);

    // Price per share = marketCap / sharesOutstanding = 100M / 1M = 100
    // Founder: 500K * 100 = 50M, Member1: 300K * 100 = 30M, Member2: 200K * 100 = 20M
    const result = await liquidatePublicCompanies();

    expect(result.liquidated).toBe(1);
    expect(result.totalPayout).toBe(100_000_000);

    const founderAfter = await User.findById(founder._id);
    const member1After = await User.findById(member1._id);
    const member2After = await User.findById(member2._id);

    expect(founderAfter.balance - founderBefore.balance).toBe(50_000_000);
    expect(member1After.balance - member1Before.balance).toBe(30_000_000);
    expect(member2After.balance - member2Before.balance).toBe(20_000_000);
  });

  // ─── ECONOMY RESET (keep identity, members) ───────────────

  it('resets company economy while preserving members and roles', async () => {
    const company = await RealEstateCompany.create({
      name: `EconomyReset_${Date.now()}`,
      founderId: founder._id,
      description: 'Preserved description',
      members: [
        { userId: founder._id, role: 'ceo', shares: 700 },
        { userId: member1._id, role: 'director', shares: 200 },
        { userId: member2._id, role: 'member', shares: 100 },
      ],
      shares: { totalShares: 1000, treasuryShares: 0, parValue: 100 },
      treasury: { balance: 50_000_000, transactions: [{ type: 'deposit', amount: 50_000_000, description: 'test', tick: 0 }] },
      stats: { netWorth: 50_000_000, propertiesOwned: 3, totalRentalIncome: 10_000 },
      level: 10,
      xp: 5000,
      reputation: 500,
      prestige: 3,
      active: true,
      foundedTick: 0,
      creationFee: 5_000_000,
    });

    await resetCompanyEconomy();

    const reset = await RealEstateCompany.findById(company._id);

    // Preserved: identity, members, roles
    expect(reset.name).toBe(company.name);
    expect(reset.founderId.toString()).toBe(founder._id.toString());
    expect(reset.description).toBe('Preserved description');
    expect(reset.members).toHaveLength(3);
    expect(reset.members.find((m) => m.role === 'ceo')).toBeDefined();
    expect(reset.members.find((m) => m.role === 'director')).toBeDefined();
    expect(reset.members.find((m) => m.role === 'member')).toBeDefined();
    expect(reset.active).toBe(true);

    // Prestige increased
    expect(reset.prestige).toBe(4);

    // Reset financials
    expect(reset.treasury.balance).toBe(0);
    expect(reset.treasury.transactions).toHaveLength(0);
    expect(reset.stats.propertiesOwned).toBe(0);
    expect(reset.stats.netWorth).toBe(0);
    expect(reset.level).toBe(1);
    expect(reset.xp).toBe(0);
    expect(reset.reputation).toBe(0);
    expect(reset.ipo.listed).toBe(false);
  });

  // ─── FULL INTEGRATION ─────────────────────────────────────

  it('full round-trip: liquidate → pay members → economy reset → members preserved', async () => {
    // Create RE company with properties and treasury
    const company = await RealEstateCompany.create({
      name: `FullCycle_${Date.now()}`,
      founderId: founder._id,
      members: [
        { userId: founder._id, role: 'ceo', shares: 700 },
        { userId: member1._id, role: 'director', shares: 300 },
      ],
      shares: { totalShares: 1000, treasuryShares: 0, parValue: 100 },
      treasury: { balance: 20_000_000, transactions: [] },
      stats: { netWorth: 20_000_000, propertiesOwned: 1 },
      level: 5,
      active: true,
      foundedTick: 0,
    });

    await Property.create({
      name: 'Company Asset', type: 'commercial', cityId: city._id,
      ownerId: founder._id, companyId: company._id,
      currentPrice: 80_000_000, basePrice: 80_000_000,
    });

    // Create IPO company
    const stockCompany = await Company.create({
      name: 'Test IPO Co', ticker: 'TIC', industry: 'finance', size: 'medium',
      sharePrice: 50, previousSharePrice: 50,
      marketCap: 50_000_000, sharesOutstanding: 1_000_000,
      isIPO: true, active: true, hqCityId: city._id, foundedTick: 0,
    });

    await StockHolding.create({
      userId: member1._id, companyId: stockCompany._id,
      shares: 10_000, avgBuyPrice: 45, locked: false,
    });

    // Record starting balances
    const founderBefore = await User.findById(founder._id);
    const member1Before = await User.findById(member1._id);

    // Run liquidation
    const reResult = await liquidateRealEstateCompanies();
    const ipoResult = await liquidatePublicCompanies();

    // Verify payouts
    expect(reResult.liquidated).toBe(1);
    expect(reResult.totalPayout).toBeGreaterThan(0);
    expect(ipoResult.liquidated).toBe(1);
    expect(ipoResult.totalPayout).toBeGreaterThan(0);

    // Verify payouts in balances
    const founderAfter = await User.findById(founder._id);
    const member1After = await User.findById(member1._id);
    expect(founderAfter.balance).toBeGreaterThan(founderBefore.balance);
    expect(member1After.balance).toBeGreaterThan(member1Before.balance);

    // Reset economy (keep members)
    await resetCompanyEconomy();

    const resetCompany = await RealEstateCompany.findById(company._id);
    expect(resetCompany.active).toBe(true);
    expect(resetCompany.members).toHaveLength(2);
    expect(resetCompany.members.find((m) => m.role === 'ceo')).toBeDefined();
    expect(resetCompany.members.find((m) => m.role === 'director')).toBeDefined();
    expect(resetCompany.treasury.balance).toBe(0);

    // Stock company should still exist (not deleted yet — that happens in resetWorld cleanup)
    const stockStillExists = await Company.findById(stockCompany._id);
    expect(stockStillExists).toBeDefined();

    // Clean up
    await Company.deleteMany({});
    await StockHolding.deleteMany({});
  });
});
