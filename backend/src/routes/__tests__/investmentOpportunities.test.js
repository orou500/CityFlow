import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader, setTestTick } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import CompanyInvestment from '../../models/CompanyInvestment.js';
import InvestmentOpportunity from '../../models/InvestmentOpportunity.js';
import GameState from '../../models/GameState.js';
import City from '../../models/City.js';
import { generateInvestmentOpportunities, processCompanyInvestments } from '../../engine/treasuryInvestments.js';
import { getGlobalEconomicState, calculateCurrentReturn } from '../../config/investmentOpportunities.js';

const app = createApp();

async function createFounder(overrides = {}) {
  const { user, token } = await createAuthenticatedUser({
    balance: 100_000_000,
    level: 20,
    ...overrides,
  });
  return { user, token };
}

async function createTestCompany(founder, overrides = {}) {
  const company = await RealEstateCompany.create({
    name: `InvCo_${Date.now()}`,
    founderId: founder._id,
    members: [{ userId: founder._id, role: 'ceo', shares: 100 }],
    treasury: { balance: 100_000_000, transactions: [] },
    level: 5,
    ...overrides,
  });
  founder.companyId = company._id;
  await founder.save();
  return company;
}

async function setupGameState(tickNumber = 1) {
  await GameState.create({ tickNumber, season: 1 });
}

describe('Investment Opportunities', () => {
  beforeEach(async () => {
    await InvestmentOpportunity.deleteMany({});
    await CompanyInvestment.deleteMany({});
    await RealEstateCompany.deleteMany({});
    await GameState.deleteMany({});
    await City.deleteMany({});
  });

  it('generates fallback products when no opportunities exist', async () => {
    const { user: founder, token } = await createFounder();
    const company = await createTestCompany(founder);

    const res = await request(app)
      .get(`/real-estate-companies/${company._id}/investments/products`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('type');
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('annualReturnRate');
  });

  it('creates an active investment for small amounts', async () => {
    const { user: founder, token } = await createFounder();
    const company = await createTestCompany(founder, {
      treasury: { balance: 10_000_000, transactions: [] },
    });

    const res = await request(app)
      .post(`/real-estate-companies/${company._id}/investments`)
      .set(authHeader(token))
      .send({ investmentType: 'government_bond', amount: 1_000_000 });

    expect(res.status).toBe(200);
    expect(res.body.investment.status).toBe('active');
    expect(res.body.treasury.balance).toBe(9_000_000);
  });

  it('creates a proposed investment for large amounts', async () => {
    const { user: founder, token } = await createFounder();
    const company = await createTestCompany(founder, {
      treasury: { balance: 50_000_000, transactions: [] },
    });

    const res = await request(app)
      .post(`/real-estate-companies/${company._id}/investments`)
      .set(authHeader(token))
      .send({ investmentType: 'government_bond', amount: 10_000_000 });

    expect(res.status).toBe(200);
    expect(res.body.investment.status).toBe('proposed');
    expect(res.body.treasury.balance).toBe(50_000_000);
  });

  it('allows members to vote on investment proposals', async () => {
    const { user: founder } = await createFounder();
    const { user: member, token: memberToken } = await createFounder({
      username: 'member_test',
      email: 'member@test.com',
    });
    const company = await createTestCompany(founder, {
      members: [
        { userId: founder._id, role: 'ceo', shares: 50 },
        { userId: member._id, role: 'director', shares: 50 },
      ],
      treasury: { balance: 50_000_000, transactions: [] },
    });

    const investment = await CompanyInvestment.create({
      companyId: company._id,
      investmentType: 'government_bond',
      name: 'Test Bond',
      principal: 10_000_000,
      currentValue: 10_000_000,
      annualReturnRate: 0.03,
      baseAnnualReturnRate: 0.03,
      durationTicks: 24,
      risk: 'low',
      requiresVote: true,
      proposal: {
        proposedBy: founder._id,
        status: 'pending',
        votes: [{ userId: founder._id, vote: 'yes' }],
        proposedTick: 1,
        expiresAtTick: 9,
      },
      startTick: 1,
      maturityTick: 25,
      status: 'proposed',
    });

    const res = await request(app)
      .post(`/real-estate-companies/${company._id}/investments/${investment._id}/vote`)
      .set(authHeader(memberToken))
      .send({ vote: 'yes' });

    expect(res.status).toBe(200);
    expect(res.body.investment.proposal.votes.length).toBe(2);
  });

  it('vote approval success: debits treasury exactly, activates investment with correct ticks', async () => {
    await setTestTick(5);
    const { user: founder } = await createFounder();
    const { user: member, token: memberToken } = await createFounder({
      username: 'member_approve',
      email: 'member_approve@test.com',
    });
    const company = await createTestCompany(founder, {
      members: [
        { userId: founder._id, role: 'ceo', shares: 50 },
        { userId: member._id, role: 'director', shares: 50 },
      ],
      treasury: { balance: 50_000_000, transactions: [] },
    });

    const investment = await CompanyInvestment.create({
      companyId: company._id,
      investmentType: 'government_bond',
      name: 'Test Bond',
      principal: 10_000_000,
      currentValue: 10_000_000,
      annualReturnRate: 0.03,
      baseAnnualReturnRate: 0.03,
      durationTicks: 24,
      risk: 'low',
      requiresVote: true,
      proposal: {
        proposedBy: founder._id,
        status: 'pending',
        votes: [{ userId: founder._id, vote: 'yes' }],
        proposedTick: 1,
        expiresAtTick: 9,
      },
      startTick: 1,
      maturityTick: 25,
      status: 'proposed',
    });

    const res = await request(app)
      .post(`/real-estate-companies/${company._id}/investments/${investment._id}/vote`)
      .set(authHeader(memberToken))
      .send({ vote: 'yes' });

    expect(res.status).toBe(200);
    expect(res.body.investment.status).toBe('active');
    expect(res.body.treasury.balance).toBe(40_000_000);

    const fresh = await CompanyInvestment.findById(investment._id);
    expect(fresh.status).toBe('active');
    expect(fresh.proposal.status).toBe('approved');
    expect(fresh.startTick).toBe(5);
    expect(fresh.maturityTick).toBe(5 + fresh.durationTicks);

    const companyAfter = await RealEstateCompany.findById(company._id);
    expect(companyAfter.treasury.balance).toBe(40_000_000);
    const tx = companyAfter.treasury.transactions.find((t) => t.type === 'investment_withdrawal');
    expect(tx).toBeTruthy();
    expect(tx.amount).toBe(10_000_000);
  });

  it('auto-approves investment proposals via tick processing', async () => {
    await setupGameState(5);
    const { user: founder } = await createFounder();
    const company = await createTestCompany(founder, {
      treasury: { balance: 50_000_000, transactions: [] },
    });

    await CompanyInvestment.create({
      companyId: company._id,
      investmentType: 'government_bond',
      name: 'Test Bond',
      principal: 10_000_000,
      currentValue: 10_000_000,
      annualReturnRate: 0.03,
      baseAnnualReturnRate: 0.03,
      durationTicks: 24,
      risk: 'low',
      requiresVote: true,
      proposal: {
        proposedBy: founder._id,
        status: 'pending',
        votes: [{ userId: founder._id, vote: 'yes' }],
        proposedTick: 1,
        expiresAtTick: 9,
      },
      startTick: 1,
      maturityTick: 25,
      status: 'proposed',
    });

    await processCompanyInvestments(5);

    const updatedInvestment = await CompanyInvestment.findOne({ companyId: company._id });
    expect(updatedInvestment.status).toBe('active');

    const updatedCompany = await RealEstateCompany.findById(company._id);
    expect(updatedCompany.treasury.balance).toBe(40_000_000);
  });

  it('processes active investment value changes', async () => {
    await setupGameState(2);
    const { user: founder } = await createFounder();
    const company = await createTestCompany(founder, {
      treasury: { balance: 10_000_000, transactions: [] },
    });

    const investment = await CompanyInvestment.create({
      companyId: company._id,
      investmentType: 'government_bond',
      name: 'Test Bond',
      principal: 1_000_000,
      currentValue: 1_000_000,
      annualReturnRate: 0.03,
      baseAnnualReturnRate: 0.03,
      durationTicks: 24,
      risk: 'low',
      startTick: 1,
      maturityTick: 25,
      globalEconomicIndex: 1,
      status: 'active',
    });

    await processCompanyInvestments(2);

    const updated = await CompanyInvestment.findById(investment._id);
    expect(updated.currentValue).not.toBe(1_000_000);
    expect(updated.performanceHistory.length).toBeGreaterThan(0);
  });

  it('matures investments when reaching maturity tick', async () => {
    await setupGameState(25);
    const { user: founder } = await createFounder();
    const company = await createTestCompany(founder, {
      treasury: { balance: 0, transactions: [] },
    });

    await CompanyInvestment.create({
      companyId: company._id,
      investmentType: 'government_bond',
      name: 'Test Bond',
      principal: 1_000_000,
      currentValue: 1_100_000,
      annualReturnRate: 0.03,
      baseAnnualReturnRate: 0.03,
      durationTicks: 24,
      risk: 'low',
      startTick: 1,
      maturityTick: 25,
      globalEconomicIndex: 1,
      status: 'active',
    });

    await processCompanyInvestments(25);

    const updatedInvestment = await CompanyInvestment.findOne({ companyId: company._id });
    expect(updatedInvestment.status).toBe('matured');

    const updatedCompany = await RealEstateCompany.findById(company._id);
    expect(updatedCompany.treasury.balance).toBeGreaterThan(0);
  });

  it('generates opportunities from tick engine', async () => {
    await setupGameState(1);
    const result = await generateInvestmentOpportunities(1);
    expect(typeof result).toBe('object');
    expect(result.generated).toBeGreaterThanOrEqual(0);
    expect(result.expired).toBeGreaterThanOrEqual(0);

    const opportunities = await InvestmentOpportunity.find({ active: true });
    expect(opportunities.length).toBeGreaterThanOrEqual(0);
  });

  it('calculates economic state based on cities', async () => {
    await City.create([
      {
        name: 'Boomtown',
        population: 100000,
        economicCondition: 'boom',
        demandIndex: 1.5,
        supplyIndex: 1.0,
        growthRate: 0.05,
        coordinates: { lat: 0, lng: 0 },
        country: 'Testland',
      },
      {
        name: 'Stabletown',
        population: 100000,
        economicCondition: 'stable',
        demandIndex: 1.0,
        supplyIndex: 1.0,
        growthRate: 0.01,
        coordinates: { lat: 1, lng: 1 },
        country: 'Testland',
      },
    ]);

    const state = await getGlobalEconomicState();
    expect(state.condition).toBeDefined();
    expect(state.index).toBeGreaterThan(0);
  });

  it('calculates current return with economy modifiers', () => {
    const ret = calculateCurrentReturn(0.05, 'medium', 1.2, 0.5);
    expect(ret).toBeGreaterThan(0);
  });
});
