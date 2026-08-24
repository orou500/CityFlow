import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import City from '../../models/City.js';
import District from '../../models/District.js';
import Property from '../../models/Property.js';
import User from '../../models/User.js';
import GameState from '../../models/GameState.js';
import { seedCities, resetCities } from '../citySeeding.js';
import { generateProperties } from '../propertyGeneration.js';
import { simulateCities } from '../citySimulation.js';
import { simulateDistricts } from '../districtSimulation.js';
import { simulateDemographics } from '../demographics.js';
import { updateIntrinsicValues } from '../propertyValuation.js';
import { updatePrices } from '../priceUpdate.js';
import { processPropertyManagement } from '../propertyManagement.js';
import { processRentGrowth } from '../rentGrowth.js';
import { processRent } from '../rentProcessing.js';
import { balanceMarket } from '../marketBalancing.js';
import { CITIES_DATA } from '../../config/cities.js';

const app = createApp();

const NEW_CITY_NAMES = CITIES_DATA.map((c) => c.name).filter((name) =>
  [
    'Miami',
    'Chicago',
    'San Francisco',
    'Manchester',
    'Birmingham',
    'Lyon',
    'Marseille',
    'Munich',
    'Frankfurt',
    'Hamburg',
    'Abu Dhabi',
    'Osaka',
    'Kyoto',
    'Yokohama',
    'Vancouver',
    'Montreal',
    'Melbourne',
    'Brisbane',
    'Busan',
    'Madrid',
    'Rome',
    'Milan',
    'Rotterdam',
    'Zurich',
    'Geneva',
    'Jerusalem',
    'Haifa',
    'Rio de Janeiro',
    'Mexico City',
    'Delhi',
    'Bangalore',
  ].includes(name),
);

const SAMPLE_CITIES = ['Miami', 'Munich', 'Jerusalem', 'Rio de Janeiro', 'Delhi'];

async function runTick(tickNumber, { withGeneration = false } = {}) {
  await simulateCities([]);
  await simulateDistricts();
  await simulateDemographics(tickNumber);
  await updateIntrinsicValues();
  await updatePrices([]);
  await processPropertyManagement(tickNumber);
  await processRentGrowth(tickNumber);
  await processRent();
  await balanceMarket();
  if (withGeneration) await generateProperties();
}

describe('World lifecycle — new cities go through the real gameplay mechanisms', () => {
  beforeEach(async () => {
    await City.deleteMany({});
    await District.deleteMany({});
    await Property.deleteMany({});
    await User.deleteMany({});
    await GameState.deleteMany({});
    await seedCities();
    await GameState.create({ key: 'global', tickNumber: 100 });

    // The real generator scales with the active-player base (playerFactor =
    // min(activePlayers/50, 1.0)). Create an active player population so the
    // isolated world generates exactly like production (96 players).
    await User.insertMany(
      Array.from({ length: 50 }, (_, i) => {
        const username = `active_${i}_${Date.now()}`;
        return {
          username,
          normalizedUsername: username.toLowerCase(),
          email: `${username}@example.com`,
          password: 'Password123',
          emailVerified: true,
          lastLoginAt: new Date(),
        };
      }),
    );
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  it('the REAL property generator creates properties in all 31 new cities (persisted with city + district)', async () => {
    const results = await generateProperties();
    expect(results.length).toBe(49);

    for (const name of NEW_CITY_NAMES) {
      const city = await City.findOne({ name });
      expect(city, name).toBeTruthy();
      const entry = results.find((r) => r.cityName === name);
      expect(entry, `${name} in generation results`).toBeTruthy();
      expect(entry.generated, `${name} generated count`).toBeGreaterThan(0);

      const props = await Property.find({ cityId: city._id });
      expect(props.length, `${name} persisted properties`).toBeGreaterThan(0);
      for (const p of props.slice(0, 5)) {
        expect(p.forSale).toBe(true);
        expect(p.ownerId).toBeFalsy();
        expect(p.districtId).toBeTruthy();
        expect(p.rent).toBeGreaterThan(0);
        const district = await District.findById(p.districtId);
        expect(district.cityId.toString()).toBe(city._id.toString());
      }
    }
  });

  it('generated property pricing is derived from the new city economy (avgPrice × multipliers)', async () => {
    await generateProperties();
    for (const name of SAMPLE_CITIES) {
      const city = await City.findOne({ name });
      const props = await Property.find({ cityId: city._id });
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) {
        expect(p.currentPrice).toBeGreaterThanOrEqual(Math.round(city.avgPrice * 0.5));
        expect(p.currentPrice).toBeLessThanOrEqual(Math.round(city.avgPrice * 1.65));
      }
    }
  });

  it('every new-city district is discovered and used by the generator (weighted by demand×growth)', async () => {
    // Deterministic PRNG: same real generator code path, reproducible outcome.
    let state = 1337;
    Math.random = () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const players = await User.find({ lastLoginAt: { $ne: null } })
      .limit(2)
      .lean();

    for (let wave = 0; wave < 5; wave++) {
      await generateProperties();
      // Like production: players buy from the market between waves, keeping
      // the unsold ratio below the generator's saturation threshold so the
      // next wave generates again.
      for (const city of await City.find({})) {
        const unsold = await Property.find({ cityId: city._id, ownerId: null, forSale: true }).limit(100);
        const toBuy = Math.floor(unsold.length * 0.75);
        for (let i = 0; i < toBuy; i++) {
          unsold[i].ownerId = players[i % players.length]._id;
          unsold[i].forSale = false;
          await unsold[i].save();
        }
      }
    }

    for (const name of SAMPLE_CITIES) {
      const city = await City.findOne({ name });
      const districts = await District.find({ cityId: city._id });
      expect(districts.length).toBeGreaterThanOrEqual(3);

      const props = await Property.find({ cityId: city._id, districtId: { $ne: null } });
      const cityDistrictIds = new Set(districts.map((d) => d._id.toString()));
      for (const p of props) {
        expect(cityDistrictIds.has(p.districtId.toString()), `${name} foreign district`).toBe(true);
      }

      const counts = new Map();
      for (const d of districts) counts.set(d._id.toString(), 0);
      for (const p of props) counts.set(p.districtId.toString(), counts.get(p.districtId.toString()) + 1);

      for (const d of districts) {
        expect(counts.get(d._id.toString()), `${name}/${d.name} skipped by generator`).toBeGreaterThan(0);
      }

      const weights = districts.map((d) => ({ id: d._id.toString(), w: d.demandIndex * (1 + d.growthRate) }));
      const totalW = weights.reduce((a, b) => a + b.w, 0);
      const n = props.length;
      for (const x of weights) {
        const share = x.w / totalW;
        const expected = share * n;
        // The generator weights districts by demand×growth: no district should
        // be starved (old bug: all-but-first fell to the last district) nor
        // over-represented beyond noise.
        expect(counts.get(x.id), `${name}/${x.id} weighted share ${share.toFixed(2)}`).toBeGreaterThanOrEqual(
          Math.floor(expected * 0.5),
        );
        expect(counts.get(x.id), `${name}/${x.id} weighted share ${share.toFixed(2)}`).toBeLessThanOrEqual(
          Math.ceil(expected * 2),
        );
      }
    }
  });

  it('the economy tick processes new cities: demand, supply, prices, demographics change', async () => {
    await generateProperties();

    const before = {};
    for (const name of SAMPLE_CITIES) {
      const city = await City.findOne({ name });
      const district = await District.findOne({ cityId: city._id });
      const prop = await Property.findOne({ cityId: city._id });
      before[name] = {
        demand: city.demandIndex,
        supply: city.supplyIndex,
        pop: city.population,
        avgPrice: city.avgPrice,
        econ: city.economicCondition,
        districtDemand: district.demandIndex,
        propPrice: prop.currentPrice,
        propId: prop._id,
      };
    }

    await generateProperties();
    await runTick(101);
    await runTick(102);
    await runTick(103);

    for (const name of SAMPLE_CITIES) {
      const city = await City.findOne({ name });
      const b = before[name];
      const cityChanged =
        city.demandIndex !== b.demand ||
        city.supplyIndex !== b.supply ||
        city.population !== b.pop ||
        city.avgPrice !== b.avgPrice ||
        city.economicCondition !== b.econ;
      expect(cityChanged, `${name} city economy changed over ticks`).toBe(true);

      const prop = await Property.findById(b.propId);
      expect(prop.currentPrice !== b.propPrice || prop.rentHistory?.length > 0, `${name} property responded`).toBe(
        true,
      );

      const district = await District.findOne({ cityId: city._id });
      expect(district.demandIndex !== b.districtDemand || district.avgPrice > 0, `${name} district economy ran`).toBe(
        true,
      );
    }
  });

  it('full property lifecycle in a new city: generate -> marketplace -> view -> buy -> rent -> sell -> filter', async () => {
    const buyer = await createAuthenticatedUser({ balance: 10_000_000, level: 5 });

    await generateProperties();
    const miami = await City.findOne({ name: 'Miami' });

    // Marketplace discovers it by city and by country
    const byCity = await request(app).get('/properties?city=Miami&seller=bank&limit=100');
    expect(byCity.status).toBe(200);
    expect(byCity.body.total).toBeGreaterThan(0);
    expect(
      byCity.body.properties.every((p) => p.cityId?.name === 'Miami' || p.cityId?._id === miami._id.toString()),
    ).toBe(true);
    // Houses always reach 100% occupancy (simulateOccupancy), making rent
    // accrual deterministic — independent of tick timing on slow CI runners.
    const prop = byCity.body.properties.find((p) => p.type === 'house');
    expect(prop, 'house property in Miami').toBeTruthy();

    const byCountry = await request(app).get('/properties?country=Germany&seller=bank&limit=100');
    expect(byCountry.status).toBe(200);
    expect(byCountry.body.properties.some((p) => p.cityId?.name === 'Munich')).toBe(true);

    // Player views it
    const viewRes = await request(app).get(`/properties/${prop._id}`).set(authHeader(buyer.token));
    expect(viewRes.status).toBe(200);
    const viewCityId = viewRes.body.cityId?._id?.toString?.() || viewRes.body.cityId?.toString?.();
    expect(viewCityId).toBe(miami._id.toString());

    // City dashboard lists it
    const cityDetail = await request(app).get(`/cities/${miami._id}`);
    expect(cityDetail.body.properties.some((p) => p._id === prop._id.toString())).toBe(true);

    // Purchase
    const buyRes = await request(app)
      .post('/properties/buy')
      .set(authHeader(buyer.token))
      .send({ propertyId: prop._id });
    expect(buyRes.status).toBe(200);

    const owned = await Property.findById(prop._id);
    expect(owned.ownerId.toString()).toBe(buyer.user._id.toString());
    expect(owned.forSale).toBe(false);
    const ownerAfterBuy = await User.findById(buyer.user._id);
    expect(ownerAfterBuy.balance).toBeLessThan(10_000_000);
    expect(ownerAfterBuy.ownedProperties.some((p) => p.toString() === prop._id.toString())).toBe(true);

    // Rent: growth recorded for the tick + occupancy rises + income accrues
    await processRentGrowth(104);
    await processPropertyManagement(104);
    await processRent();

    const rented = await Property.findById(prop._id);
    expect(rented.rentHistory.some((h) => h.tick === 104)).toBe(true);
    expect(rented.rent).toBeGreaterThan(0);

    for (let t = 105; t <= 110; t++) {
      await processPropertyManagement(t);
      await processRent();
    }
    const ownerAfterRent = await User.findById(buyer.user._id);
    expect(ownerAfterRent.uncollectedRent || 0).toBeGreaterThan(0);

    // Sell back to the market
    const sellRes = await request(app)
      .post('/properties/sell')
      .set(authHeader(buyer.token))
      .send({ propertyId: prop._id });
    expect(sellRes.status).toBe(200);

    const sold = await Property.findById(prop._id);
    expect(sold.ownerId).toBeFalsy();
    expect(sold.forSale).toBe(true);
    const ownerAfterSell = await User.findById(buyer.user._id);
    expect(ownerAfterSell.balance).toBeGreaterThan(ownerAfterBuy.balance);

    // Still discoverable after re-listing (oldest-first puts the early-created
    // property deterministically inside the page)
    const relisted = await request(app).get('/properties?city=Miami&seller=bank&sort=oldest&limit=100');
    expect(relisted.body.properties.some((p) => p._id === prop._id.toString())).toBe(true);
  });

  it('after a season reset all 49 cities remain, districts are recreated, and generation keeps working', async () => {
    const { cities, districtsCreated } = await resetCities();
    expect(cities.length).toBe(49);
    expect(districtsCreated).toBeGreaterThanOrEqual(49 * 3);

    const cityIds = cities.map((c) => c._id);
    expect(await District.countDocuments({ cityId: { $nin: cityIds } })).toBe(0);

    for (const name of NEW_CITY_NAMES) {
      const city = await City.findOne({ name });
      expect(city, name).toBeTruthy();
      const count = await District.countDocuments({ cityId: city._id });
      expect(count, `${name} districts after reset`).toBeGreaterThanOrEqual(3);
    }

    const results = await generateProperties();
    expect(results.length).toBe(49);
    for (const name of SAMPLE_CITIES) {
      const city = await City.findOne({ name });
      expect(await Property.countDocuments({ cityId: city._id })).toBeGreaterThan(0);
    }
  });

  it('all 49 cities participate in the engine loops (no fixed 18-city path)', async () => {
    const cityResults = await simulateCities([]);
    expect(cityResults.length).toBe(49);
    expect(cityResults.every((r) => r.supplyIndex > 0)).toBe(true);

    const demoResults = await simulateDemographics(100);
    expect(demoResults.length).toBe(49);

    const genResults = await generateProperties();
    expect(genResults.length).toBe(49);
    expect(genResults.filter((r) => r.generated > 0).length).toBe(49);

    const districtResults = await simulateDistricts();
    expect(districtResults.length).toBeGreaterThanOrEqual(49 * 3);
  });
});

const originalRandom = Math.random;
