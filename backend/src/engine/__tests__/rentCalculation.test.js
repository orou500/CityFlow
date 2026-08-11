import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import { processRent } from '../rentProcessing.js';
import { processPropertyManagement } from '../propertyManagement.js';
import {
  calculatePropertyRentIncome,
  simulateOccupancy,
  calculateNetRentIncome,
} from '../../config/propertyManagement.js';
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

  it('accrues the occupancy-adjusted rent minus operating expenses into the collection pool', async () => {
    await makeProperty({ ownerId: user._id, rent: 1000, occupancy: 100 });
    await makeProperty({ ownerId: user._id, rent: 2000, occupancy: 50 });

    const results = await processRent();

    const total = results.reduce((s, r) => s + r.netIncome, 0);
    expect(total).toBe(1960); // (1000-20) + (1000-20), apartment 2% operating expense

    const updated = await User.findById(user._id);
    expect(updated.uncollectedRent).toBe(1960);
  });

  it('does not deduct any hidden maintenance from the pool', async () => {
    const property = await makeProperty({ ownerId: user._id, rent: 1000, occupancy: 100 }); // maintenance: none
    await processRent();

    const updated = await User.findById(user._id);
    expect(updated.uncollectedRent).toBe(calculateNetRentIncome(property)); // only operating expense, no maintenance
  });

  it('uses rentPerUnit adjustments set through the management panel', async () => {
    const property = await makeProperty({ ownerId: user._id, rent: 1000, units: [], occupancy: 100 });
    property.rentPerUnit = 2500;
    await property.save();

    await processRent();

    const updated = await User.findById(user._id);
    expect(updated.uncollectedRent).toBe(calculateNetRentIncome(property)); // 2500 - 2% operating = 2450
  });

  it('is deterministic — repeated ticks with the same state accrue identically', async () => {
    const property = await makeProperty({ ownerId: user._id, rent: 1000, occupancy: 75 });
    const first = await processRent();
    const second = await processRent();
    const expected = calculateNetRentIncome(property); // 750 - 2% operating = 735
    expect(first[0].netIncome).toBe(expected);
    expect(second[0].netIncome).toBe(expected);
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

  it('never charges maintenance from the balance — it folds into the rent pool', async () => {
    const property = await makeProperty({ ownerId: user._id, cityId: city._id, rent: 1000, occupancy: 100 });
    property.maintenanceLevel = 'basic';
    await property.save();
    await processPropertyManagement(1);

    const afterMgmt = await User.findById(user._id);
    expect(afterMgmt.balance).toBe(100000); // management never touches the balance

    await processRent();
    const afterRent = await User.findById(user._id);
    const expectedNet = calculateNetRentIncome(property); // 1000 - 100 maint - 20 operating = 880
    expect(afterRent.uncollectedRent).toBe(expectedNet);
  });

  it('matches the displayed net income exactly when collecting rent', async () => {
    const property = await makeProperty({ ownerId: user._id, cityId: city._id, rent: 2000, occupancy: 80 });
    property.maintenanceLevel = 'basic'; // 10%
    await property.save();

    await processRent();
    const net = calculateNetRentIncome(property); // 2000*0.8=1600 - 160 maint - 2% operating = 1408

    const updated = await User.findById(user._id);
    expect(updated.uncollectedRent).toBe(net);
  });
});
