import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import Property from '../../models/Property.js';
import GameState from '../../models/GameState.js';
import User from '../../models/User.js';
import City from '../../models/City.js';
import {
  calculatePropertyRentIncome,
  calculateMaintenanceCost,
  calculateOperatingExpenses,
} from '../../config/propertyManagement.js';

const app = createApp();

async function makeProperty(ownerId, cityId, overrides = {}) {
  return Property.create({
    cityId,
    ownerId,
    name: `Income_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: 200000,
    currentPrice: 200000,
    rent: 10000,
    occupancy: 100,
    maintenanceLevel: 'none',
    ...overrides,
  });
}

describe('GET /users/me/rental-income', () => {
  let owner;
  let token;
  let city;

  beforeEach(async () => {
    await Property.deleteMany({});
    await GameState.deleteMany({});
    await User.deleteMany({});
    await City.deleteMany({});
    await GameState.create({ key: 'global', tickNumber: 42 });
    city = await createTestCity();
    const auth = await createAuthenticatedUser({});
    owner = auth.user;
    token = auth.token;
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/users/me/rental-income');
    expect(res.status).toBe(401);
  });

  it('returns an empty breakdown for a player with no properties', async () => {
    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.totalRentalIncome).toBe(0);
    expect(res.body.totalGrossIncome).toBe(0);
    expect(res.body.propertyCount).toBe(0);
    expect(res.body.properties).toEqual([]);
    expect(res.body.latestTick).toBe(42);
  });

  it('returns one property with its authoritative income', async () => {
    const p = await makeProperty(owner._id, city._id, { rent: 10000, occupancy: 100 });
    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.propertyCount).toBe(1);
    expect(res.body.totalRentalIncome).toBe(
      Math.max(
        0,
        calculatePropertyRentIncome(p) -
          calculateMaintenanceCost(p, calculatePropertyRentIncome(p)) -
          calculateOperatingExpenses(p, calculatePropertyRentIncome(p)),
      ),
    );
    expect(res.body.properties[0].propertyId).toBe(p._id.toString());
    expect(res.body.properties[0].monthlyRent).toBe(10000);
  });

  it('total equals the sum of individual property incomes', async () => {
    await makeProperty(owner._id, city._id, { rent: 10000 });
    await makeProperty(owner._id, city._id, { rent: 25000 });
    await makeProperty(owner._id, city._id, { rent: 5000 });

    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.body.propertyCount).toBe(3);
    const sum = res.body.properties.reduce((s, p) => s + p.rentalIncome, 0);
    expect(res.body.totalRentalIncome).toBe(sum);
  });

  it('percentages sum to exactly 100', async () => {
    await makeProperty(owner._id, city._id, { rent: 10000 });
    await makeProperty(owner._id, city._id, { rent: 20000 });
    await makeProperty(owner._id, city._id, { rent: 30000 });

    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    const sum = res.body.properties.reduce((s, p) => s + p.percentageOfTotal, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('sorts by highest rental income first', async () => {
    await makeProperty(owner._id, city._id, { rent: 10000 });
    await makeProperty(owner._id, city._id, { rent: 30000 });
    await makeProperty(owner._id, city._id, { rent: 20000 });

    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    const incomes = res.body.properties.map((p) => p.rentalIncome);
    expect([...incomes].sort((a, b) => b - a)).toEqual(incomes);
  });

  it("never returns another player's properties", async () => {
    const other = await createAuthenticatedUser({});
    await makeProperty(owner._id, city._id, { rent: 10000 });
    await makeProperty(other.user._id, city._id, { rent: 90000 });

    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.body.propertyCount).toBe(1);
    expect(res.body.totalRentalIncome).toBeLessThan(90000);
  });

  it('applies occupancy like the rent tick', async () => {
    await makeProperty(owner._id, city._id, { rent: 10000, occupancy: 50 });
    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    // occupancy-adjusted gross = 10000 * 50% = 5000; no maintenance (none), apartment operating 2%
    expect(res.body.properties[0].grossIncome).toBe(5000);
    expect(res.body.properties[0].operatingExpenses).toBe(Math.round(5000 * 0.02));
    expect(res.body.properties[0].rentalIncome).toBe(5000 - Math.round(5000 * 0.02));
  });

  it('applies maintenance and type-based operating costs', async () => {
    // Standard maintenance: 25% of gross; commercial: 5% operating.
    const p = await makeProperty(owner._id, city._id, {
      type: 'commercial',
      rent: 20000,
      occupancy: 100,
      maintenanceLevel: 'standard',
    });
    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    const gross = calculatePropertyRentIncome(p);
    const maintenance = calculateMaintenanceCost(p, gross);
    const operating = calculateOperatingExpenses(p, gross);
    expect(res.body.properties[0].grossIncome).toBe(gross);
    expect(res.body.properties[0].maintenanceCost).toBe(maintenance);
    expect(res.body.properties[0].operatingExpenses).toBe(operating);
    expect(res.body.properties[0].rentalIncome).toBe(Math.max(0, gross - maintenance - operating));
  });

  it('handles zero-income land properties without dropping them', async () => {
    await makeProperty(owner._id, city._id, { type: 'land', rent: 0, developmentLevel: 0 });
    await makeProperty(owner._id, city._id, { rent: 15000 });

    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.body.propertyCount).toBe(2);
    const land = res.body.properties.find((p) => p.type === 'land');
    expect(land.rentalIncome).toBe(0);
    expect(land.percentageOfTotal).toBe(0);
    // The income-generating property is listed first.
    expect(res.body.properties[0].type).not.toBe('land');
  });

  it('uses rentPerUnit x units as the configured monthly rent when set', async () => {
    await makeProperty(owner._id, city._id, {
      rent: 5000,
      rentPerUnit: 1000,
      units: [
        { unitNumber: 1, type: 'apartment', rentPrice: 1000, occupied: true },
        { unitNumber: 2, type: 'apartment', rentPrice: 1000, occupied: true },
        { unitNumber: 3, type: 'apartment', rentPrice: 1000, occupied: true },
      ],
    });
    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.body.properties[0].monthlyRent).toBe(3000);
  });

  it('reports the latest completed tick from game state', async () => {
    await GameState.updateOne({ key: 'global' }, { $set: { tickNumber: 123 } });
    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.body.latestTick).toBe(123);
  });

  it('handles a large portfolio in a single response', async () => {
    for (let i = 0; i < 40; i += 1) {
      await makeProperty(owner._id, city._id, { rent: 1000 + i * 100 });
    }
    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.propertyCount).toBe(40);
    expect(res.body.properties).toHaveLength(40);
    const sum = res.body.properties.reduce((s, p) => s + p.rentalIncome, 0);
    expect(res.body.totalRentalIncome).toBe(sum);
  });
});
