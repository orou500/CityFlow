import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import {
  createAuthenticatedUser,
  createTestProperty,
  createTestCity,
  authHeader,
  setTestTick,
} from '../../test/helpers.js';
import Transaction from '../../models/Transaction.js';
import { cacheDelPattern } from '../../utils/cache.js';

const app = createApp();

async function createFounder() {
  const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const user = await createAuthenticatedUser({ balance: 200_000_000, level: 30, createdAt });
  await createTestProperty({ ownerId: user.user._id, currentPrice: 5_000_000, basePrice: 5_000_000 });
  return user;
}

async function createCompany(founderToken, hqCityId) {
  const res = await request(app)
    .post('/real-estate-companies')
    .set(authHeader(founderToken))
    .send({
      name: `ActCo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description: 'Test',
      hqCityId,
    });
  expect(res.status).toBe(201);
  return res.body;
}

async function getActivities() {
  const res = await request(app).get('/stats');
  expect(res.status).toBe(200);
  return res.body.recentActivity || [];
}

describe('World Activity — company contributions vs property purchases', () => {
  let hqCityId;

  beforeEach(async () => {
    await setTestTick(100);
    const city = await createTestCity();
    hqCityId = city._id;
  });

  afterEach(async () => {
    delete global.currentTick;
    await cacheDelPattern('cf:stats*');
  });

  it('player contributes money to company -> company_funds_contributed (NOT a property purchase)', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder.token, hqCityId);

    const deposit = await request(app)
      .post(`/real-estate-companies/${company._id}/treasury/deposit`)
      .set(authHeader(founder.token))
      .send({ amount: 200000 });
    expect(deposit.status).toBe(200);

    const activities = await getActivities();
    const contribution = activities.find((a) => a.type === 'company_funds_contributed');
    expect(contribution).toBeDefined();
    expect(contribution.price).toBe(200000);
    expect(contribution.buyerId?.username).toBe(founder.user.username);
    expect(contribution.company?.name).toBe(company.name);
    // It must NOT be classified as a property purchase.
    expect(activities.some((a) => a.type === 'buy' && a.price === 200000 && !a.propertyId)).toBe(false);
  });

  it('player buys property personally -> activity = buy (property purchase) with propertyId', async () => {
    const buyer = await createAuthenticatedUser({ balance: 1_000_000 });
    const property = await createTestProperty({ basePrice: 100000, forSale: true });
    await Transaction.create({
      propertyId: property._id,
      buyerId: buyer.user._id,
      price: 50000,
      type: 'buy',
    });

    const activities = await getActivities();
    const buy = activities.find((a) => a.type === 'buy');
    expect(buy).toBeDefined();
    expect(buy.propertyId?._id?.toString() || buy.propertyId?.toString()).toBe(property._id.toString());
    expect(buy.price).toBe(50000);
    expect(buy.buyerId?.username).toBe(buyer.user.username);
  });

  it('company buys property -> company_property_purchase (distinct from player buy)', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder.token, hqCityId);
    const property = await createTestProperty({ basePrice: 100000 });
    await Transaction.create({
      propertyId: property._id,
      companyId: company._id,
      price: 75000,
      type: 'buy',
    });

    const activities = await getActivities();
    const purchase = activities.find((a) => a.type === 'company_property_purchase');
    expect(purchase).toBeDefined();
    expect(purchase.company?.name).toBe(company.name);
    expect(purchase.price).toBe(75000);
    expect(purchase.propertyId).toBeTruthy();
    // The company purchase must NOT be a personal 'buy' activity.
    expect(activities.some((a) => a.type === 'buy' && a.price === 75000 && a.buyerId)).toBe(false);
  });

  it('company contribution does NOT create a property purchase activity for the same amount', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder.token, hqCityId);
    await request(app)
      .post(`/real-estate-companies/${company._id}/treasury/deposit`)
      .set(authHeader(founder.token))
      .send({ amount: 300000 });

    const activities = await getActivities();
    const contribution = activities.find((a) => a.type === 'company_funds_contributed' && a.price === 300000);
    expect(contribution).toBeDefined();
    // No 'buy' / 'company_property_purchase' entry for the deposit amount.
    expect(
      activities.some((a) => (a.type === 'buy' || a.type === 'company_property_purchase') && a.price === 300000),
    ).toBe(false);
  });

  it('existing personal property purchase activity remains unchanged (type buy)', async () => {
    const buyer = await createAuthenticatedUser({ balance: 1_000_000 });
    const property = await createTestProperty({ basePrice: 100000, forSale: true });
    await Transaction.create({
      propertyId: property._id,
      buyerId: buyer.user._id,
      price: 120000,
      type: 'buy',
    });

    const activities = await getActivities();
    const buy = activities.find((a) => a.type === 'buy' && a.price === 120000);
    expect(buy).toBeDefined();
    expect(buy.buyerId?.username).toBe(buyer.user.username);
    expect(buy.propertyId).toBeTruthy();
  });

  it('activity always carries authoritative backend metadata (actor/company/amount)', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder.token, hqCityId);
    await request(app)
      .post(`/real-estate-companies/${company._id}/treasury/deposit`)
      .set(authHeader(founder.token))
      .send({ amount: 500000 });

    const activities = await getActivities();
    const contribution = activities.find((a) => a.type === 'company_funds_contributed');
    expect(contribution).toBeDefined();
    // Structured metadata present — the frontend never invents type/amount/actor.
    expect(contribution.type).toBe('company_funds_contributed');
    expect(contribution.price).toBe(500000);
    expect(contribution.buyerId?.username).toBe(founder.user.username);
    expect(contribution.company?.name).toBe(company.name);
    expect(contribution.createdAt).toBeTruthy();
  });
});
