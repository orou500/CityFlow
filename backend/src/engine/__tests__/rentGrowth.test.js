import { describe, it, expect, afterAll } from 'vitest';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import { processRentGrowth } from '../rentGrowth.js';
import { processRent } from '../rentProcessing.js';
import { calculateNetRentIncome } from '../../config/propertyManagement.js';
import {
  MAX_MONTHLY_RENT,
  RENT_SYSTEM,
  clampMonthlyRent,
  calculateRentPotential,
  calculateMonthlyRentGrowth,
} from '../../config/propertyManagement.js';
import { createTestUser, createTestCity } from '../../test/helpers.js';

const STABLE_CITY = { demandIndex: 1.0, supplyIndex: 1.0, economicCondition: 'stable' };

function baseProperty(value = 200000, overrides = {}) {
  return {
    type: 'apartment',
    currentPrice: value,
    basePrice: value,
    qualityScore: 70,
    condition: 100,
    propertyRating: 'standard',
    maintenanceLevel: 'none',
    ...overrides,
  };
}

async function makeProperty(overrides = {}) {
  const city = overrides.cityId || (await createTestCity());
  return Property.create({
    cityId: city._id,
    name: `RentGrowthProp_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: 200000,
    currentPrice: 200000,
    rent: 1100,
    occupancy: 100,
    qualityScore: 70,
    condition: 100,
    ...overrides,
  });
}

afterAll(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
});

describe('calculateRentPotential', () => {
  it('scales with market value', () => {
    const low = calculateRentPotential(baseProperty(200000), STABLE_CITY); // ~2388
    const mid = calculateRentPotential(baseProperty(500000), STABLE_CITY); // ~5970
    const high = calculateRentPotential(baseProperty(2000000), STABLE_CITY); // ~23880
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBe(mid * 4); // linear in value
  });

  it('is capped at $50,000/month for premium real estate', () => {
    expect(calculateRentPotential(baseProperty(50000000), STABLE_CITY)).toBe(MAX_MONTHLY_RENT);
  });

  it('weights property types (house < apartment < commercial)', () => {
    const house = calculateRentPotential(baseProperty(200000, { type: 'house' }), STABLE_CITY);
    const apartment = calculateRentPotential(baseProperty(200000), STABLE_CITY);
    const commercial = calculateRentPotential(baseProperty(200000, { type: 'commercial' }), STABLE_CITY);
    expect(house).toBeLessThan(apartment);
    expect(commercial).toBeGreaterThan(apartment);
  });

  it('responds to city demand and supply', () => {
    const hot = calculateRentPotential(baseProperty(200000), {
      demandIndex: 2.0,
      supplyIndex: 1.0,
      economicCondition: 'stable',
    });
    const cold = calculateRentPotential(baseProperty(200000), {
      demandIndex: 0.5,
      supplyIndex: 1.0,
      economicCondition: 'stable',
    });
    const oversupplied = calculateRentPotential(baseProperty(200000), {
      demandIndex: 1.0,
      supplyIndex: 2.5,
      economicCondition: 'stable',
    });
    expect(hot).toBeGreaterThan(cold);
    expect(oversupplied).toBeLessThan(hot);
  });

  it('responds to the city economy', () => {
    const boom = calculateRentPotential(baseProperty(200000), {
      demandIndex: 1.0,
      supplyIndex: 1.0,
      economicCondition: 'boom',
    });
    const recession = calculateRentPotential(baseProperty(200000), {
      demandIndex: 1.0,
      supplyIndex: 1.0,
      economicCondition: 'recession',
    });
    expect(boom).toBeGreaterThan(recession);
  });

  it('raises potential with rating and invested capital', () => {
    const standard = calculateRentPotential(baseProperty(200000), STABLE_CITY);
    const upgraded = calculateRentPotential(
      baseProperty(200000, {
        propertyRating: 'elite',
        investmentHistory: [{ type: 'upgrade', amount: 100000, tick: 1 }],
      }),
      STABLE_CITY,
    );
    expect(upgraded).toBeGreaterThan(standard);
  });

  it('returns zero for undeveloped land', () => {
    expect(calculateRentPotential(baseProperty(200000, { type: 'land', developmentLevel: 0 }), STABLE_CITY)).toBe(0);
  });

  it('respects quality and condition', () => {
    const mint = calculateRentPotential(baseProperty(200000, { qualityScore: 95, condition: 100 }), STABLE_CITY);
    const runDown = calculateRentPotential(baseProperty(200000, { qualityScore: 30, condition: 40 }), STABLE_CITY);
    expect(mint).toBeGreaterThan(runDown);
  });
});

describe('calculateMonthlyRentGrowth', () => {
  it('caps the first growth month for legacy production properties at +50%', () => {
    const legacy = baseProperty(200000, { rent: 1100, rentHistory: null });
    const growth = calculateMonthlyRentGrowth(legacy, STABLE_CITY);
    expect(growth.isLegacyFirstMonth).toBe(true);
    expect(growth.increasePct).toBe(50);
    expect(growth.newRent).toBe(1650);
  });

  it('does not apply the legacy cap once a property has a rent history', () => {
    const established = baseProperty(200000, { rent: 1100, rentHistory: [{ tick: 1, rent: 1100 }] });
    const growth = calculateMonthlyRentGrowth(established, STABLE_CITY);
    expect(growth.isLegacyFirstMonth).toBe(false);
    expect(growth.increasePct).toBeGreaterThan(50);
  });

  it('grows sharply while far from potential and gently as it approaches', () => {
    const far = calculateMonthlyRentGrowth(
      baseProperty(1000000, { rent: 1000, rentHistory: [{}] }),
      STABLE_CITY, // potential ~11940
    );
    const near = calculateMonthlyRentGrowth(baseProperty(1000000, { rent: 10000, rentHistory: [{}] }), STABLE_CITY);
    expect(far.growthRate).toBeGreaterThan(near.growthRate);
    expect(far.increasePct).toBeGreaterThan(near.increasePct);
  });

  it('never overshoots the rent potential and stays within the cap', () => {
    const growth = calculateMonthlyRentGrowth(baseProperty(1000000, { rent: 8000, rentHistory: [{}] }), STABLE_CITY);
    expect(growth.newRent).toBeLessThanOrEqual(growth.rentPotential);
    expect(growth.newRent).toBeLessThanOrEqual(MAX_MONTHLY_RENT);
  });

  it('bootstraps properties that have units but no rent baseline', () => {
    const growth = calculateMonthlyRentGrowth(baseProperty(200000, { rent: 0 }), STABLE_CITY);
    expect(growth.newRent).toBeGreaterThan(0);
    expect(growth.newRent).toBeLessThanOrEqual(growth.rentPotential);
  });

  it('leaves undeveloped land rent untouched', () => {
    const land = baseProperty(200000, { type: 'land', developmentLevel: 0, rent: 0 });
    const growth = calculateMonthlyRentGrowth(land, STABLE_CITY);
    expect(growth.rentPotential).toBe(0);
    expect(growth.newRent).toBe(0);
  });
});

describe('processRentGrowth (engine)', () => {
  it('grows rent only once per month (idempotent per tick)', async () => {
    const user = await createTestUser({ balance: 0, uncollectedRent: 0 });
    const p = await makeProperty({ ownerId: user._id, rent: 2750, currentPrice: 500000, basePrice: 500000 });

    await processRentGrowth(10);
    const after1 = await Property.findById(p._id);
    expect(after1.lastRentGrowthTick).toBe(10);

    await processRentGrowth(10); // same tick re-run (e.g. restart) → no-op
    const after2 = await Property.findById(p._id);
    expect(after2.rent).toBe(after1.rent);
    expect(after2.rentHistory.length).toBe(1);

    await processRentGrowth(11); // next month grows
    const after3 = await Property.findById(p._id);
    expect(after3.rent).not.toBe(after2.rent);
    expect(after3.lastRentGrowthTick).toBe(11);
  });

  it('persists rent history, previous month rent and potential', async () => {
    const user = await createTestUser({ balance: 0, uncollectedRent: 0 });
    const p = await makeProperty({ ownerId: user._id, rent: 2750, currentPrice: 500000, basePrice: 500000 });

    for (let t = 1; t <= 40; t += 1) {
      await processRentGrowth(t);
    }

    const doc = await Property.findById(p._id);
    expect(doc.rentHistory.length).toBe(RENT_SYSTEM.RENT_HISTORY_MAX_ENTRIES); // 36-entry ring
    expect(doc.rentHistory[0].tick).toBe(5); // oldest kept entry
    expect(doc.lastRentGrowthTick).toBe(40);
    expect(doc.previousMonthRent).toBeGreaterThan(0);
    expect(doc.rentPotential).toBeGreaterThan(0);
    expect(doc.rent).toBe(doc.rentPotential); // converged to potential
  });

  it('never exceeds the $50,000 cap across 60 months, even in a boom', async () => {
    const user = await createTestUser({ balance: 0, uncollectedRent: 0 });
    const city = await createTestCity();
    city.demandIndex = 3.0;
    city.supplyIndex = 0.5;
    city.economicCondition = 'boom';
    await city.save();

    const p = await makeProperty({
      ownerId: user._id,
      cityId: city._id,
      type: 'commercial',
      rent: 40000,
      currentPrice: 50000000,
      basePrice: 50000000,
      qualityScore: 95,
      condition: 100,
    });

    for (let t = 1; t <= 60; t += 1) {
      await processRentGrowth(t);
      const doc = await Property.findById(p._id);
      expect(doc.rent).toBeLessThanOrEqual(MAX_MONTHLY_RENT);
    }
    const doc = await Property.findById(p._id);
    expect(doc.rent).toBe(MAX_MONTHLY_RENT);
  });

  it('holds rent steady once a property has reached its potential', async () => {
    const user = await createTestUser({ balance: 0, uncollectedRent: 0 });
    const p = await makeProperty({
      ownerId: user._id,
      rent: 2388,
      currentPrice: 200000,
      basePrice: 200000,
      rentHistory: [{ tick: 1, rent: 2388 }],
    });

    for (let t = 2; t <= 14; t += 1) {
      await processRentGrowth(t);
    }

    const doc = await Property.findById(p._id);
    expect(doc.rent).toBe(2388);
    expect(doc.rent).toBeLessThanOrEqual(doc.rentPotential);
  });
});

describe('long-term economy simulation', () => {
  const simulate = (value, rent) => {
    let p = baseProperty(value, { rent });
    for (let m = 1; m <= 60; m += 1) {
      const g = calculateMonthlyRentGrowth(p, STABLE_CITY);
      expect(g.newRent).toBeGreaterThanOrEqual(g.previousMonthRent); // no runaway decline
      expect(g.newRent).toBeLessThanOrEqual(MAX_MONTHLY_RENT);
      expect(g.newRent).toBeLessThanOrEqual(g.rentPotential); // no overshoot
      p = { ...p, rent: g.newRent, rentHistory: (p.rentHistory || []).concat([{}]) };
    }
    return p.rent;
  };

  it('produces sharp early growth that flattens at potential for every value tier', () => {
    const cases = [
      { value: 100000, rent: 550, convergesBelow: 5000 },
      { value: 250000, rent: 1375, convergesBelow: 10000 },
      { value: 500000, rent: 2750, convergesBelow: 20000 },
      { value: 1000000, rent: 5500, convergesBelow: 30000 },
      { value: 5000000, rent: 27500, convergesBelow: 51000 },
      { value: 10000000, rent: 40000, convergesBelow: 51000 },
    ];
    for (const { value, rent, convergesBelow } of cases) {
      const final = simulate(value, rent);
      expect(final).toBeGreaterThan(rent); // meaningful growth
      expect(final).toBeLessThan(convergesBelow); // bounded, no runaway
    }
  });

  it('higher-value properties reach a strictly higher final rent', () => {
    const low = simulate(100000, 550);
    const high = simulate(5000000, 27500);
    expect(high).toBeGreaterThan(low);
  });

  it('the cap binds only for the most expensive properties', () => {
    expect(simulate(100000, 550)).toBeLessThan(MAX_MONTHLY_RENT);
    expect(simulate(5000000, 27500)).toBe(MAX_MONTHLY_RENT);
  });
});

describe('rent growth + collection integration', () => {
  it('occupancy and maintenance never rewrite the rent baseline; the pool matches displayed net income', async () => {
    const user = await createTestUser({ balance: 100000, uncollectedRent: 0 });
    const city = await createTestCity();
    const p = await makeProperty({
      ownerId: user._id,
      cityId: city._id,
      rent: 2000,
      occupancy: 80,
      maintenanceLevel: 'basic',
    });

    const results = await processRent();
    const r = results.find((x) => x.propertyId.toString() === p._id.toString());
    expect(r.netIncome).toBe(calculateNetRentIncome(p));

    const updated = await User.findById(user._id);
    expect(updated.uncollectedRent).toBe(r.netIncome); // collection == displayed NET INCOME
    expect(updated.balance).toBe(100000); // maintenance was NOT charged from the balance

    const persisted = await Property.findById(p._id);
    expect(persisted.rent).toBe(2000); // occupancy never overwrites rent
    expect(clampMonthlyRent(persisted.rent)).toBeLessThanOrEqual(MAX_MONTHLY_RENT);
  });
});
