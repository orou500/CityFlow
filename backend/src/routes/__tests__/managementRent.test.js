import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import Property from '../../models/Property.js';
import GameState from '../../models/GameState.js';
import User from '../../models/User.js';
import City from '../../models/City.js';
import { MAX_MONTHLY_RENT, RENT_BOUNDS } from '../../config/propertyManagement.js';

const app = createApp();
const TICK = 50;

async function makeProperty(overrides = {}) {
  const city = overrides.cityId || (await createTestCity());
  return Property.create({
    cityId: city._id,
    name: `RentCap_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: 200000,
    currentPrice: 200000,
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

  it('B: a rent at the market cap stays valid when the baseline rent drops', async () => {
    await Property.findByIdAndUpdate(property._id, { rentPerUnit: 13056, maxValidatedRentPerUnit: 13056 });
    await Property.findByIdAndUpdate(property._id, { rent: 5000 });

    const res = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 13056 });
    expect(res.status).toBe(200);
  });

  it('C: a previously validated rent above the current cap stays valid, +1 is rejected', async () => {
    await Property.findByIdAndUpdate(property._id, { rentPerUnit: 13072, maxValidatedRentPerUnit: 13072 });

    const ok = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 13072 });
    expect(ok.status).toBe(200);

    await GameState.updateOne({ key: 'global' }, { $set: { tickNumber: TICK + 1 } });

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

  it('E: enforces the $50,000 absolute monthly cap', async () => {
    const singleBad = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: MAX_MONTHLY_RENT + 1 });
    expect(singleBad.status).toBe(400);

    const multi = await makeProperty({
      ownerId: owner._id,
      cityId: city._id,
      rent: 30000,
      units: [
        { unitNumber: 1, type: 'apartment', rentPrice: 15000 },
        { unitNumber: 2, type: 'apartment', rentPrice: 15000 },
      ],
    });

    const multiBad = await request(app)
      .post(`/management/${multi._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: Math.floor(MAX_MONTHLY_RENT / 2) + 1 });
    expect(multiBad.status).toBe(400);

    const multiOk = await request(app)
      .post(`/management/${multi._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: Math.floor(MAX_MONTHLY_RENT / 2) });
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

    // Re-saving the (still legal, grandfathered) value works.
    const resave = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 9362 });
    expect(resave.status).toBe(200);

    // Any increase above the grandfathered ceiling is rejected while the
    // market baseline gives a 2x cap below it.
    await GameState.updateOne({ key: 'global' }, { $set: { tickNumber: TICK + 1 } });
    const increase = await request(app)
      .post(`/management/${property._id}/rent`)
      .set(authHeader(token))
      .send({ rentPerUnit: 9363 });
    expect(increase.status).toBe(400);
    expect(increase.body.error).toMatch(/Rent must be between 2178 and 9362 per unit/);

    // The GET endpoint reports the state faithfully (no headroom).
    const get = await request(app).get(`/management/${property._id}`).set(authHeader(token));
    expect(get.body.currentMaxPerUnit).toBe(8712);
    expect(get.body.effectiveMaxPerUnit).toBe(9362);
    expect(get.body.nextAvailableIncrease).toBe(0);
    expect(get.body.canIncreaseRent).toBe(false);

    // Once the market baseline rises, increases unlock again.
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

  it('a decrease overwrites the grandfathered cap (no permanent bypass)', async () => {
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
    expect(res.body.effectiveMaxPerUnit).toBe(13072);
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
});
