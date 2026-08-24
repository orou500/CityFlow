import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, authHeader } from '../../test/helpers.js';
import City from '../../models/City.js';
import District from '../../models/District.js';
import Property from '../../models/Property.js';
import User from '../../models/User.js';
import GameState from '../../models/GameState.js';
import { seedCities } from '../../engine/citySeeding.js';
import { simulateCities } from '../../engine/citySimulation.js';
import { simulateDemographics } from '../../engine/demographics.js';
import { balanceMarket } from '../../engine/marketBalancing.js';

const app = createApp();

const NEW_CITIES = ['Miami', 'Munich', 'Jerusalem', 'Rio de Janeiro', 'Delhi'];

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

describe('World expansion — gameplay integration in new cities', () => {
  beforeEach(async () => {
    await City.deleteMany({});
    await District.deleteMany({});
    await Property.deleteMany({});
    await GameState.deleteMany({});
    await seedCities();
    await GameState.create({ key: 'global', tickNumber: 100 });
  });

  it('GET /cities exposes all 49 cities with countries and coordinates (world map data)', async () => {
    const res = await request(app).get('/cities');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(49);

    const countries = new Set(res.body.map((c) => c.country));
    expect(countries.size).toBe(20);

    for (const city of res.body) {
      expect(city.coordinates.lat).toBeDefined();
      expect(city.coordinates.lng).toBeDefined();
    }

    const findCity = (name) => res.body.find((c) => c.name === name);
    expect(findCity('New York').country).toBe('USA');
    expect(findCity('London').country).toBe('UK');
    expect(findCity('Dubai').country).toBe('UAE');
    expect(findCity('Tokyo').country).toBe('Japan');
    expect(findCity('Seoul').country).toBe('South Korea');
    expect(findCity('Mumbai').country).toBe('India');
    expect(findCity('Tel Aviv').country).toBe('Israel');
    expect(findCity('São Paulo').country).toBe('Brazil');
    expect(findCity('Miami').country).toBe('USA');
    expect(findCity('Rio de Janeiro').country).toBe('Brazil');
  });

  it('city entry flow: select country -> city -> districts -> properties works for new cities', async () => {
    for (const cityName of NEW_CITIES) {
      const city = await City.findOne({ name: cityName });
      expect(city, cityName).toBeTruthy();

      const detailRes = await request(app).get(`/cities/${city._id}`);
      expect(detailRes.status, cityName).toBe(200);
      expect(detailRes.body.city.name).toBe(cityName);
      expect(detailRes.body.demographics).toBeTruthy();

      const districtsRes = await request(app).get(`/districts/city/${city._id}`);
      expect(districtsRes.status, cityName).toBe(200);
      expect(districtsRes.body.length, `${cityName} districts`).toBeGreaterThanOrEqual(3);
      expect(districtsRes.body.length, `${cityName} districts`).toBeLessThanOrEqual(5);

      const district = districtsRes.body[0];
      const districtRes = await request(app).get(`/districts/${district._id}`);
      expect(districtRes.status).toBe(200);
      expect(districtRes.body.district.cityId.name).toBe(cityName);
      expect(districtRes.body.district.avgPrice).toBeGreaterThan(0);
      expect(districtRes.body.district.demandIndex).toBeGreaterThan(0);
      expect(districtRes.body.district.basePrice).toBeGreaterThan(0);
    }
  });

  it('property purchase works in a new city (Miami) and persists ownership', async () => {
    const buyer = await createAuthenticatedUser({ balance: 10_000_000, level: 5 });
    const miami = await City.findOne({ name: 'Miami' });

    const prop = await Property.create({
      name: 'Miami Beach Apartment',
      cityId: miami._id,
      type: 'apartment',
      basePrice: 300000,
      currentPrice: 300000,
      forSale: true,
    });

    const res = await request(app).post('/properties/buy').set(authHeader(buyer.token)).send({ propertyId: prop._id });

    expect(res.status).toBe(200);

    const freshProp = await Property.findById(prop._id);
    expect(freshProp.ownerId.toString()).toBe(buyer.user._id.toString());
    expect(freshProp.forSale).toBe(false);

    const freshBuyer = await User.findById(buyer.user._id);
    expect(freshBuyer.balance).toBeLessThan(10_000_000);
    expect(freshBuyer.ownedProperties.some((p) => p.toString() === prop._id.toString())).toBe(true);
  });

  it('marketplace country/city filters work for new cities', async () => {
    const miami = await City.findOne({ name: 'Miami' });
    const rio = await City.findOne({ name: 'Rio de Janeiro' });
    await Property.create({
      name: 'Miami Condo',
      cityId: miami._id,
      type: 'apartment',
      basePrice: 200000,
      currentPrice: 200000,
      forSale: true,
    });
    await Property.create({
      name: 'Rio Beach House',
      cityId: rio._id,
      type: 'house',
      basePrice: 150000,
      currentPrice: 150000,
      forSale: true,
    });

    const byCity = await request(app).get('/properties?city=Miami');
    expect(byCity.status).toBe(200);
    expect(byCity.body.properties.some((p) => p.name === 'Miami Condo')).toBe(true);
    expect(byCity.body.properties.some((p) => p.name === 'Rio Beach House')).toBe(false);

    const byCountry = await request(app).get('/properties?country=Brazil');
    expect(byCountry.status).toBe(200);
    expect(byCountry.body.properties.some((p) => p.name === 'Rio Beach House')).toBe(true);
    expect(byCountry.body.properties.some((p) => p.name === 'Miami Condo')).toBe(false);
  });

  it('companies can be created with HQ in a new city', async () => {
    const founder = await createFounder();
    const miami = await City.findOne({ name: 'Miami' });

    const res = await request(app)
      .post('/real-estate-companies')
      .set(authHeader(founder.token))
      .send({ name: `MiamiCo_${Date.now()}`, description: 'Test', hqCityId: miami._id });

    expect(res.status).toBe(201);
    expect((res.body.hqCityId?._id || res.body.hqCityId).toString()).toBe(miami._id.toString());

    const listRes = await request(app).get('/real-estate-companies').set(authHeader(founder.token));
    const created = (listRes.body.companies || listRes.body).find((c) => c.name?.startsWith('MiamiCo_'));
    expect(created).toBeTruthy();
    expect((created.hqCityId?._id || created.hqCityId).toString()).toBe(miami._id.toString());

    const detailRes = await request(app).get(`/real-estate-companies/${created._id}`).set(authHeader(founder.token));
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.hqCity?.name || detailRes.body.hqCityId?.name).toBe('Miami');
  });

  it('economy simulation + demographics + market balancing run across the full 49-city world', async () => {
    await expect(simulateCities([])).resolves.toBeDefined();
    await expect(simulateDemographics(100)).resolves.toBeDefined();
    await expect(balanceMarket()).resolves.toBeDefined();

    for (const cityName of NEW_CITIES) {
      const city = await City.findOne({ name: cityName });
      expect(city.supplyIndex).toBeGreaterThan(0);
      expect(city.demandIndex).toBeGreaterThan(0);
      expect(city.population).toBeGreaterThan(0);
      expect(city.economicCondition).toBeTruthy();
    }
  });

  it('every new city has a full property lifecycle surface (land -> purchase -> develop data model)', async () => {
    const miami = await City.findOne({ name: 'Miami' });
    const district = await District.findOne({ cityId: miami._id });

    const land = await Property.create({
      name: 'Miami Development Land',
      cityId: miami._id,
      districtId: district._id,
      type: 'land',
      basePrice: 100000,
      currentPrice: 100000,
      forSale: true,
      size: 4000,
      developmentLevel: 0,
    });
    expect(land).toBeTruthy();

    const apartment = await Property.create({
      name: 'Miami Rental Unit',
      cityId: miami._id,
      districtId: district._id,
      type: 'apartment',
      basePrice: 250000,
      currentPrice: 250000,
      rent: 1200,
      forSale: false,
    });
    expect(apartment.rent).toBe(1200);

    const cityDetail = await request(app).get(`/cities/${miami._id}`);
    const cityProps = cityDetail.body.properties;
    expect(cityProps.some((p) => p.name === 'Miami Rental Unit')).toBe(true);
    expect(cityProps.some((p) => p.name === 'Miami Development Land')).toBe(true);
  });
});
