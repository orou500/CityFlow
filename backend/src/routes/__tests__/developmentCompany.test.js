import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, createTestProperty, authHeader } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import Property from '../../models/Property.js';
import ConstructionProject from '../../models/ConstructionProject.js';
import GameState from '../../models/GameState.js';
import { calculateProjectCost, getAllProjects } from '../../config/developmentProjects.js';

const app = createApp();

async function createFounder(overrides = {}) {
  const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { user, token } = await createAuthenticatedUser({
    balance: 100_000_000,
    level: 20,
    createdAt,
    ...overrides,
  });
  await createTestProperty({ ownerId: user._id, currentPrice: 5_000_000, basePrice: 5_000_000 });
  return { user, token };
}

async function createTestCompany(founder, overrides = {}) {
  const city = await createTestCity();
  const res = await request(app)
    .post('/real-estate-companies')
    .set(authHeader(founder.token))
    .send({ name: `DevCo_${Date.now()}`, description: 'A test company', hqCityId: city._id, ...overrides });
  expect(res.status).toBe(201);
  const company = await RealEstateCompany.findById(res.body._id);
  return { company, res, token: founder.token, city };
}

describe('Company construction (standalone /development/company/start)', () => {
  beforeEach(async () => {
    await GameState.findOneAndUpdate({}, { tickNumber: 100, $setOnInsert: { season: 1 } }, { upsert: true, new: true });
  });

  it('success: charges exactly the computed project cost, creates the project and develops the land', async () => {
    const founder = await createFounder();
    const { company, token, city } = await createTestCompany(founder);

    const land = await Property.create({
      name: `Land_${Date.now()}`,
      type: 'land',
      cityId: city._id,
      companyId: company._id,
      currentPrice: 2_000_000,
      basePrice: 2_000_000,
      location: 'Suburban',
      developmentLevel: 0,
      forSale: false,
    });

    const project = getAllProjects().find((p) => p.id === 'retail_complex');
    expect(project).toBeTruthy();
    const expectedCost = calculateProjectCost(project, city, 'Suburban');

    company.treasury.balance = 20_000_000;
    await company.save();

    const res = await request(app)
      .post('/development/company/start')
      .set(authHeader(token))
      .send({ landId: land._id, projectType: 'retail_complex', companyId: company._id.toString() });

    expect(res.status).toBe(201);

    const companyAfter = await RealEstateCompany.findById(company._id);
    expect(companyAfter.treasury.balance).toBe(20_000_000 - expectedCost);

    const projectDoc = await ConstructionProject.findOne({ landId: land._id });
    expect(projectDoc).toBeTruthy();
    expect(projectDoc.totalCost).toBe(expectedCost);
    expect(projectDoc.investedAmount).toBe(expectedCost);
    expect(projectDoc.status).toBe('under_construction');
    expect(projectDoc.companyId.toString()).toBe(company._id.toString());
    expect(projectDoc.ownerId.toString()).toBe(founder.user._id.toString());
    expect(projectDoc.startPeriod).toBe(100);
    expect(projectDoc.completionPeriod).toBe(100 + project.constructionPeriods);

    const landAfter = await Property.findById(land._id);
    expect(landAfter.developmentLevel).toBe(1);
    expect(landAfter.forSale).toBe(false);

    const tx = companyAfter.treasury.transactions.find((t) => t.type === 'construction');
    expect(tx).toBeTruthy();
    expect(tx.amount).toBe(expectedCost);
    expect(tx.userId.toString()).toBe(founder.user._id.toString());
  });
});
