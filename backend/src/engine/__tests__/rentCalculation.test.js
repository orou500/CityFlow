import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import { processRent } from '../rentProcessing.js';
import { processPropertyManagement } from '../propertyManagement.js';
import { calculatePropertyRentIncome, simulateOccupancy } from '../../config/propertyManagement.js';
import { createTestUser, createTestCity } from '../../test/helpers.js';

async function makeProperty(overrides = {}) {
  const city = overrides.cityId || (await createTestCity());
  return Property.create({
    cityId: city._id,
    name: `RentProp_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: 100000,
    currentPrice: 100000,
    rent: 1000,
    occupancy: 100,
    ...overrides,
  });
}

afterAll(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
});

describe('calculatePropertyRentIncome', () => {
  it('uses the gross rent scaled by occupancy for regular properties', () => {
    const prop = { rent: 1000, occupancy: 80 };
    expect(calculatePropertyRentIncome(prop)).toBe(800);
  });

  it('prefers rentPerUnit for unit properties', () => {
    const prop = { rent: 1000, rentPerUnit: 500, units: [{ rentPrice: 300 }, { rentPrice: 300 }], occupancy: 100 };
    expect(calculatePropertyRentIncome(prop)).toBe(1000);
  });

  it('falls back to unit rents when no rentPerUnit is set', () => {
    const prop = { rent: 0, units: [{ rentPrice: 400 }, { rentPrice: 600 }], occupancy: 50 };
    expect(calculatePropertyRentIncome(prop)).toBe(500);
  });

  it('clamps occupancy to 0-100', () => {
    expect(calculatePropertyRentIncome({ rent: 1000, occupancy: 150 })).toBe(1000);
    expect(calculatePropertyRentIncome({ rent: 1000, occupancy: -10 })).toBe(0);
  });

  it('houses always earn their full rent regardless of occupancy', () => {
    expect(calculatePropertyRentIncome({ type: 'house', rent: 4300, occupancy: 35 })).toBe(4300);
    expect(calculatePropertyRentIncome({ type: 'house', rent: 4300, occupancy: 0 })).toBe(4300);
    expect(calculatePropertyRentIncome({ type: 'house', rentPerUnit: 5000, rent: 4000, occupancy: 10 })).toBe(5000);
  });

  it('simulateOccupancy returns 100 for houses', () => {
    expect(simulateOccupancy({ type: 'house', rent: 1000 }, 0.8, 1.3)).toBe(100);
    expect(simulateOccupancy({ type: 'apartment', rent: 1000 }, 0.8, 1.3)).not.toBe(100);
  });
});

describe('processRent', () => {
  let user;

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    user = await createTestUser({ balance: 0, uncollectedRent: 0 });
  });

  it('accrues exactly the occupancy-adjusted rent into the collection pool', async () => {
    await makeProperty({ ownerId: user._id, rent: 1000, occupancy: 100 });
    await makeProperty({ ownerId: user._id, rent: 2000, occupancy: 50 });

    const results = await processRent();

    const total = results.reduce((s, r) => s + r.netIncome, 0);
    expect(total).toBe(2000); // 1000 + 1000 (2000 * 0.5)

    const updated = await User.findById(user._id);
    expect(updated.uncollectedRent).toBe(2000);
  });

  it('does not deduct any hidden maintenance from the pool', async () => {
    await makeProperty({ ownerId: user._id, rent: 1000, occupancy: 100 });
    await processRent();

    const updated = await User.findById(user._id);
    expect(updated.uncollectedRent).toBe(1000);
  });

  it('uses rentPerUnit adjustments set through the management panel', async () => {
    const property = await makeProperty({ ownerId: user._id, rent: 1000, units: [], occupancy: 100 });
    property.rentPerUnit = 2500;
    await property.save();

    await processRent();

    const updated = await User.findById(user._id);
    expect(updated.uncollectedRent).toBe(2500);
  });

  it('is deterministic — repeated ticks with the same state accrue identically', async () => {
    await makeProperty({ ownerId: user._id, rent: 1000, occupancy: 75 });
    const first = await processRent();
    const second = await processRent();
    expect(first[0].netIncome).toBe(750);
    expect(second[0].netIncome).toBe(750);
  });
});

describe('processPropertyManagement', () => {
  let user;
  let city;

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await City.deleteMany({});
    user = await createTestUser({ balance: 100000 });
    city = await createTestCity();
  });

  it('does not rewrite property.rent (no exponential decay over ticks)', async () => {
    const property = await makeProperty({ ownerId: user._id, cityId: city._id, rent: 1000, occupancy: 70 });

    await processPropertyManagement(1);
    await processPropertyManagement(2);
    await processPropertyManagement(3);

    const persisted = await Property.findById(property._id);
    expect(persisted.rent).toBe(1000); // gross rent stays stable
  });

  it('charges tier maintenance from balance only (tier none = no charge)', async () => {
    const property = await makeProperty({ ownerId: user._id, cityId: city._id, rent: 1000, occupancy: 100 });
    await processPropertyManagement(1);

    const updated = await User.findById(user._id);
    expect(updated.balance).toBe(100000); // 'none' tier costs nothing

    property.maintenanceLevel = 'basic';
    await property.save();
    await processPropertyManagement(2);

    const persisted = await Property.findById(property._id);
    // basic = 10% of the effective (occupancy-adjusted) income used for the charge
    const expectedCharge = Math.round(calculatePropertyRentIncome(persisted) * 0.1);
    const after = await User.findById(user._id);
    expect(after.balance).toBe(100000 - expectedCharge);
  });
});
