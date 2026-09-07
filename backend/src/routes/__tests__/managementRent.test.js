import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import Property from '../../models/Property.js';
import GameState from '../../models/GameState.js';
import User from '../../models/User.js';
import City from '../../models/City.js';
import { RENT_BOUNDS, RENT_SYSTEM, calculateMaximumRent } from '../../config/propertyManagement.js';

const app = createApp();
const TICK = 50;

async function makeProperty(overrides = {}) {
  const city = overrides.cityId || (await createTestCity());
  return Property.create({
    cityId: city._id,
    name: `RentCap_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: 2000000,
    currentPrice: 2000000,
    rent: 6528,
    occupancy: 100,
    qualityScore: 70,
    lastRentAdjustTick: TICK - 1,
    ...overrides,
  });
}

describe('Management rent caps (grandfathering)', () => {
  let owner;
  let token;
  let property;
  let city;

  beforeEach(async () => {
    await Property.deleteMany({});
    await GameState.deleteMany({});
    await User.deleteMany({});
    await City.deleteMany({});
    await GameState.create({ key: 'global', tickNumber: TICK });

    city = await createTestCity();
    const ownerResult = await createAuthenticatedUser({});
    owner = ownerResult.user;
    token = ownerResult.token;
    property = await makeProperty({ ownerId: owner._id, cityId: city._id });
  });

  it('A: allows a normal increase within the 2x market cap', async () => {
    const res = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 12000 });
    expect(res.status).toBe(200);

    const updated = await Property.findById(property._id);
    expect(updated.rentPerUnit).toBe(12000);
    expect(updated.maxValidatedRentPerUnit).toBe(12000);
  });

  it('B: a rent above the current market cap is rejected once the baseline drops (value/market cap is not grandfathered)', async () => {
    // A player set rentPerUnit at the 2x market ceiling (13056), then the
    // auto-grown baseline dropped to 5000 → the current 2x cap is now 10000.
    await Property.findByIdAndUpdate(property._id, { rentPerUnit: 13056, maxValidatedRentPerUnit: 13056 });
    await Property.findByIdAndUpdate(property._id, { rent: 5000 });

    // The stored rent (13056) keeps accruing — re-raising is what is blocked.
    const res = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 13056 });
    expect(res.status).toBe(400);

    // A new rent within the lowered 2x market cap still works.
    await GameState.updateOne({ key: 'global' }, { $set: { tickNumber: TICK + 1 } });
    const ok = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 10000 });
    expect(ok.status).toBe(200);
  });

  it('C: any rent above the current cap is rejected (no bypass via maxValidatedRentPerUnit)', async () => {
    await Property.findByIdAndUpdate(property._id, { rentPerUnit: 13072, maxValidatedRentPerUnit: 13072 });

    const bad = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 13073 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Rent must be between/);
  });

  it('D: a baseline rise raises the cap and unlocks higher rents', async () => {
    await Property.findByIdAndUpdate(property._id, { rent: 8000 });

    const res = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 16000 });
    expect(res.status).toBe(200);
    expect((await Property.findById(property._id)).rentPerUnit).toBe(16000);
  });

  it('E: enforces the value-based rent cap per unit', async () => {
    const low = await makeProperty({
      ownerId: owner._id,
      cityId: city._id,
      basePrice: 100000,
      currentPrice: 100000,
      rent: 2000, // 2x market = 4000 >= value cap 3000, so the value cap binds
    });
    const maxRent = calculateMaximumRent(low); // 3000

    const tooHigh = await request(app)
      .post(`/management/${low._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: maxRent + 1 });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error).toMatch(/cannot exceed/);

    const exact = await request(app)
      .post(`/management/${low._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: maxRent });
    expect(exact.status).toBe(200);

    const multi = await makeProperty({
      ownerId: owner._id,
      cityId: city._id,
      basePrice: 100000,
      currentPrice: 100000,
      rent: 3000,
      units: [
        { unitNumber: 1, type: 'apartment', rentPrice: 1500 },
        { unitNumber: 2, type: 'apartment', rentPrice: 1500 },
      ],
    });
    const multiPerUnit = Math.floor(calculateMaximumRent(multi) / 2);

    const multiTooHigh = await request(app)
      .post(`/management/${multi._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: multiPerUnit + 1 });
    expect(multiTooHigh.status).toBe(400);

    const multiOk = await request(app)
      .post(`/management/${multi._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: multiPerUnit });
    expect(multiOk.status).toBe(200);
  });

  it('G: a property with no history cannot exceed the current cap', async () => {
    const res = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 13057 });
    expect(res.status).toBe(400);
  });

  it('a rent set at exactly 2x the baseline stays valid after the baseline declines; increases wait for the market', async () => {
    // Heritage-Building scenario: the owner set rentPerUnit at the legal max
    // (2 x 4681 = 9362), then the auto-grown baseline dropped to 4356.
    await Property.findByIdAndUpdate(property._id, {
      rent: 4681,
      rentPerUnit: 9362,
      maxValidatedRentPerUnit: 9362,
      previousMonthRent: 4681,
    });
    await Property.findByIdAndUpdate(property._id, { rent: 4356 });

    // The stored rent (9362) keeps accruing, but re-raising it is blocked
    // while the 2x market cap sits below it (the value cap, $60k here, is not
    // the binding constraint for this $2M property).
    await GameState.updateOne({ key: 'global' }, { $set: { tickNumber: TICK + 1 } });
    const increase = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 9363 });
    expect(increase.status).toBe(400);
    expect(increase.body.error).toMatch(/Rent must be between 2178 and 8712 per unit/);

    // The GET endpoint reports the state faithfully (no headroom).
    const get = await request(app).get(`/management/${property._id}`).set(authHeader(token));
    expect(get.body.currentMaxPerUnit).toBe(8712);
    expect(get.body.effectiveMaxPerUnit).toBe(8712);
    expect(get.body.nextAvailableIncrease).toBe(0);
    expect(get.body.canIncreaseRent).toBe(false);

    // Once the market baseline rises, increases unlock again (bounded by the
    // value cap of $60,000, which is not reached here).
    await Property.findByIdAndUpdate(property._id, { rent: 5000 });
    await GameState.updateOne({ key: 'global' }, { $set: { tickNumber: TICK + 2 } });
    const unlocked = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 9600 });
    expect(unlocked.status).toBe(200);
  });

  it('H: enforces the 0.5x minimum multiplier', async () => {
    const minPerUnit = Math.round(6528 * RENT_BOUNDS.minMultiplier);
    const res = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: minPerUnit - 1 });
    expect(res.status).toBe(400);
  });

  it('a decrease rebinds the cap: a later rise above the current market cap is rejected', async () => {
    // Set a legal high rent, then lower it. The cap is always derived from the
    // current market/value, so a later rise above the current cap is rejected.
    await Property.findByIdAndUpdate(property._id, { rentPerUnit: 13056, maxValidatedRentPerUnit: 13056 });

    const lower = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 10000 });
    expect(lower.status).toBe(200);

    await Property.findByIdAndUpdate(property._id, { rent: 5000 });
    await GameState.updateOne({ key: 'global' }, { $set: { tickNumber: TICK + 1 } });

    const rebound = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 12000 });
    expect(rebound.status).toBe(400);
  });

  it('rejects changes during the cooldown window', async () => {
    await Property.findByIdAndUpdate(property._id, { lastRentAdjustTick: TICK });
    const res = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 12000 });
    expect(res.status).toBe(400);
  });

  it('rejects non-owners', async () => {
    const other = await createAuthenticatedUser({});
    const res = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(other.token))
      .send({ rentPerUnit: 12000 });
    expect(res.status).toBe(403);
  });

  it('GET exposes rent cap details for the UI', async () => {
    await Property.findByIdAndUpdate(property._id, { rentPerUnit: 13072, maxValidatedRentPerUnit: 13072 });

    const res = await request(app).get(`/management/${property._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.marketRate).toBe(6528);
    expect(res.body.currentMaxPerUnit).toBe(13056);
    expect(res.body.maxValidatedRentPerUnit).toBe(13072);
    expect(res.body.effectiveMaxPerUnit).toBe(13056);
    expect(res.body.maximumRent).toBe(calculateMaximumRent(property));
    expect(res.body.maximumRentPerUnit).toBe(calculateMaximumRent(property));
    expect(res.body.maxMonthlyRent).toBe(calculateMaximumRent(property));
    expect(res.body.nextAvailableIncrease).toBe(0);
    expect(res.body.canIncreaseRent).toBe(false);
  });

  it('keeps occupancy, maintenance and net income computation intact after a rent change', async () => {
    const set = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 12000 });
    expect(set.status).toBe(200);

    const get = await request(app).get(`/management/${property._id}`).set(authHeader(token));
    expect(get.status).toBe(200);
    expect(get.body.rentPerUnit).toBe(12000);
    expect(get.body.perUnitRent).toBe(12000);
    expect(get.body.rentChangeAvailable).toBe(false);
    expect(typeof get.body.netProfit).toBe('number');
    expect(typeof get.body.netIncome).toBe('number');
    expect(get.body.maintenanceCost).toBe(0);
    expect(get.body.occupancy).toBe(100);
  });

  it('reports monthly increase from the engine-written baseline values (positive, negative, zero)', async () => {
    // Positive: baseline grew this month.
    await Property.findByIdAndUpdate(property._id, { rent: 5000, previousMonthRent: 4681 });
    let get = await request(app).get(`/management/${property._id}`).set(authHeader(token));
    expect(get.body.rent).toBe(5000);
    expect(get.body.monthlyIncrease).toBe(319);
    expect(get.body.monthlyIncreasePct).toBeCloseTo(6.81, 1);

    // Negative: market decline (e.g. quality drop / slowdown) — must be
    // reported accurately, never masked or flipped.
    await Property.findByIdAndUpdate(property._id, { rent: 4356, previousMonthRent: 4681 });
    get = await request(app).get(`/management/${property._id}`).set(authHeader(token));
    expect(get.body.monthlyIncrease).toBe(-325);
    expect(get.body.monthlyIncreasePct).toBeCloseTo(-6.94, 1);

    // Zero: converged at potential.
    await Property.findByIdAndUpdate(property._id, { rent: 5000, previousMonthRent: 5000 });
    get = await request(app).get(`/management/${property._id}`).set(authHeader(token));
    expect(get.body.monthlyIncrease).toBe(0);
    expect(get.body.monthlyIncreasePct).toBe(0);
  });

  it('rejects negative, zero, NaN and Infinity rent amounts', async () => {
    for (const bad of [-100, 0, 'NaN', 'Infinity', '-Infinity']) {
      await GameState.updateOne({ key: 'global' }, { $set: { tickNumber: TICK } });
      const res = await request(app)
        .post(`/management/${property._id}/rent`)
        .set(authHeader(token))
        .send({ rentPerUnit: bad });
      expect(res.status).toBe(400);
    }
  });

  it('rejects any rent above the value-based maximum, even after a value drop', async () => {
    // Set a legal rent near the cap, then let the value fall sharply. The
    // stored rent keeps accruing (no data is destroyed), but re-raising it
    // above the new value-based cap is rejected.
    await GameState.updateOne({ key: 'global' }, { $set: { tickNumber: TICK + 1 } });
    await Property.findByIdAndUpdate(property._id, {
      rent: 100000,
      rentPerUnit: 100000,
      maxValidatedRentPerUnit: 100000,
    });

    await Property.findByIdAndUpdate(property._id, { currentPrice: 100000, basePrice: 100000 });
    const newMaxPerUnit = Math.floor(100000 * RENT_SYSTEM.MAXIMUM_RENT_YIELD); // 3000
    const over = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: newMaxPerUnit + 1 });
    expect(over.status).toBe(400);

    // The stored rent is untouched — the cap change never mutates the stored rent.
    const doc = await Property.findById(property._id);
    expect(doc.rentPerUnit).toBe(100000);
  });

  it('scales the cap with property value at $1M/$5M/$10M/$50M/$100M', async () => {
    const cases = [
      { value: 1000000, expectedPct: 0.03, aboveLegacyFlat: false },
      { value: 5000000, expectedPct: 0.03, aboveLegacyFlat: true },
      { value: 10000000, expectedPct: 0.03, aboveLegacyFlat: true },
      { value: 50000000, expectedPct: 0.03, aboveLegacyFlat: true },
      { value: 100000000, expectedPct: 0.03, aboveLegacyFlat: true },
    ];
    for (const { value, expectedPct, aboveLegacyFlat } of cases) {
      const max = calculateMaximumRent({ currentPrice: value });
      expect(Math.abs(max - Math.floor(value * expectedPct))).toBeLessThan(1);
      if (aboveLegacyFlat) {
        expect(max).toBeGreaterThan(50000); // no artificial $50k ceiling
      }
    }
  });
});
