import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import City from '../../models/City.js';
import District from '../../models/District.js';
import Property from '../../models/Property.js';
import GameState from '../../models/GameState.js';
import { CITIES_DATA, COUNTRIES } from '../../config/cities.js';
import { upsertCities, ensureCityDistricts, seedCities, resetCities } from '../citySeeding.js';
import { simulateCities } from '../citySimulation.js';
import { simulateDemographics } from '../demographics.js';

const REQUESTED_CITIES = [
  'New York',
  'Los Angeles',
  'Miami',
  'Chicago',
  'San Francisco',
  'London',
  'Manchester',
  'Birmingham',
  'Paris',
  'Lyon',
  'Marseille',
  'Berlin',
  'Munich',
  'Frankfurt',
  'Hamburg',
  'Dubai',
  'Abu Dhabi',
  'Tokyo',
  'Osaka',
  'Kyoto',
  'Yokohama',
  'Toronto',
  'Vancouver',
  'Montreal',
  'Sydney',
  'Melbourne',
  'Brisbane',
  'Singapore',
  'Seoul',
  'Busan',
  'Madrid',
  'Barcelona',
  'Rome',
  'Milan',
  'Amsterdam',
  'Rotterdam',
  'Zurich',
  'Geneva',
  'Tel Aviv',
  'Jerusalem',
  'Haifa',
  'São Paulo',
  'Rio de Janeiro',
  'Mexico City',
  'Mumbai',
  'Delhi',
  'Bangalore',
];

const REQUESTED_COUNTRIES = [
  'USA',
  'UK',
  'France',
  'Germany',
  'UAE',
  'Japan',
  'Canada',
  'Australia',
  'Singapore',
  'South Korea',
  'Spain',
  'Italy',
  'Netherlands',
  'Switzerland',
  'Israel',
  'Brazil',
  'Mexico',
  'India',
];

const CITY_COUNTRY_MAP = {
  'New York': 'USA',
  'Los Angeles': 'USA',
  Miami: 'USA',
  Chicago: 'USA',
  'San Francisco': 'USA',
  London: 'UK',
  Manchester: 'UK',
  Birmingham: 'UK',
  Paris: 'France',
  Lyon: 'France',
  Marseille: 'France',
  Berlin: 'Germany',
  Munich: 'Germany',
  Frankfurt: 'Germany',
  Hamburg: 'Germany',
  Dubai: 'UAE',
  'Abu Dhabi': 'UAE',
  Tokyo: 'Japan',
  Osaka: 'Japan',
  Kyoto: 'Japan',
  Yokohama: 'Japan',
  Toronto: 'Canada',
  Vancouver: 'Canada',
  Montreal: 'Canada',
  Sydney: 'Australia',
  Melbourne: 'Australia',
  Brisbane: 'Australia',
  Singapore: 'Singapore',
  Seoul: 'South Korea',
  Busan: 'South Korea',
  Madrid: 'Spain',
  Barcelona: 'Spain',
  Rome: 'Italy',
  Milan: 'Italy',
  Amsterdam: 'Netherlands',
  Rotterdam: 'Netherlands',
  Zurich: 'Switzerland',
  Geneva: 'Switzerland',
  'Tel Aviv': 'Israel',
  Jerusalem: 'Israel',
  Haifa: 'Israel',
  'São Paulo': 'Brazil',
  'Rio de Janeiro': 'Brazil',
  'Mexico City': 'Mexico',
  Mumbai: 'India',
  Delhi: 'India',
  Bangalore: 'India',
};

const LEGACY_CITIES = [
  'New York',
  'London',
  'Tokyo',
  'Tel Aviv',
  'Dubai',
  'Paris',
  'Sydney',
  'Singapore',
  'Berlin',
  'Mumbai',
  'São Paulo',
  'Toronto',
  'Hong Kong',
  'Barcelona',
  'Amsterdam',
  'Seoul',
  'Los Angeles',
  'Istanbul',
];

describe('CityFlow world data — CITIES_DATA config', () => {
  it('contains all requested cities', () => {
    const names = CITIES_DATA.map((c) => c.name);
    for (const city of REQUESTED_CITIES) {
      expect(names).toContain(city);
    }
    expect(CITIES_DATA.length).toBe(49);
  });

  it('contains all requested countries', () => {
    for (const country of REQUESTED_COUNTRIES) {
      expect(COUNTRIES).toContain(country);
    }
  });

  it('has unique seedKeys', () => {
    const keys = CITIES_DATA.map((c) => c.seedKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
  });

  it('has unique country values (country IDs)', () => {
    const countries = CITIES_DATA.map((c) => c.country);
    const distinct = new Set(countries);
    expect(distinct.size).toBe(COUNTRIES.length);
    expect(distinct.size).toBe(20);
    expect(countries.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
  });

  it('maps every city to the correct country', () => {
    for (const city of CITIES_DATA) {
      if (CITY_COUNTRY_MAP[city.name]) {
        expect(city.country).toBe(CITY_COUNTRY_MAP[city.name]);
      }
    }
    for (const [cityName, country] of Object.entries(CITY_COUNTRY_MAP)) {
      const entry = CITIES_DATA.find((c) => c.name === cityName);
      expect(entry, `missing city ${cityName}`).toBeTruthy();
      expect(entry.country).toBe(country);
    }
  });

  it('has valid coordinates for every city', () => {
    for (const city of CITIES_DATA) {
      const { lat, lng } = city.coordinates;
      expect(lat, `${city.name} lat`).toBeGreaterThanOrEqual(-90);
      expect(lat, `${city.name} lat`).toBeLessThanOrEqual(90);
      expect(lng, `${city.name} lng`).toBeGreaterThanOrEqual(-180);
      expect(lng, `${city.name} lng`).toBeLessThanOrEqual(180);
      expect(lat === 0 && lng === 0, `${city.name} has null-island coordinates`).toBe(false);
    }
  });

  it('has sensible economy values for every city', () => {
    for (const city of CITIES_DATA) {
      expect(city.demandIndex).toBeGreaterThan(0.5);
      expect(city.demandIndex).toBeLessThanOrEqual(2.5);
      expect(city.supplyIndex).toBeGreaterThan(0.4);
      expect(city.supplyIndex).toBeLessThanOrEqual(2.0);
      expect(city.avgPrice).toBeGreaterThan(50000);
      expect(city.population).toBeGreaterThan(100000);
      expect(city.growthRate).toBeGreaterThan(0);
      expect(city.developmentRate).toBeGreaterThan(0);
      expect(city.totalCapacity).toBeGreaterThan(0);
    }
  });
});

describe('CityFlow world data — idempotent seeding (seedCities/upsertCities)', () => {
  beforeEach(async () => {
    await City.deleteMany({});
    await District.deleteMany({});
    await Property.deleteMany({});
    await GameState.deleteMany({});
  });

  it('creates all configured cities with seedKeys', async () => {
    const { created } = await upsertCities();
    expect(created.length).toBe(CITIES_DATA.length);

    const cities = await City.find({});
    expect(cities.length).toBe(CITIES_DATA.length);
    expect(cities.every((c) => c.seedKey)).toBe(true);
  });

  it('is idempotent — running twice creates no duplicates and changes nothing', async () => {
    await upsertCities();
    const afterFirst = await City.find({}).sort({ seedKey: 1 });
    const snapshot = afterFirst.map((c) => ({
      seedKey: c.seedKey,
      name: c.name,
      country: c.country,
      avgPrice: c.avgPrice,
      demandIndex: c.demandIndex,
    }));

    const second = await upsertCities();
    expect(second.created.length).toBe(0);
    expect(second.adopted.length).toBe(CITIES_DATA.length);

    const afterSecond = await City.find({}).sort({ seedKey: 1 });
    expect(afterSecond.length).toBe(afterFirst.length);
    for (let i = 0; i < afterFirst.length; i++) {
      expect(afterSecond[i]._id.toString()).toBe(afterFirst[i]._id.toString());
      expect(afterSecond[i].name).toBe(snapshot[i].name);
      expect(afterSecond[i].country).toBe(snapshot[i].country);
      expect(afterSecond[i].avgPrice).toBe(snapshot[i].avgPrice);
      expect(afterSecond[i].demandIndex).toBe(snapshot[i].demandIndex);
    }
  });

  it('adopts legacy cities (no seedKey) preserving their _id and values', async () => {
    const legacy = {
      name: 'New York',
      country: 'USA',
      coordinates: { lat: 40.7128, lng: -74.006 },
      population: 8336817,
      growthRate: 0.008,
      demandIndex: 1.8,
      supplyIndex: 0.9,
      avgPrice: 750000,
      totalCapacity: 500000,
      developmentRate: 0.025,
    };
    const legacyCity = await City.create(legacy);
    const legacyId = legacyCity._id;

    const { created, adopted } = await upsertCities();
    expect(created.length).toBe(CITIES_DATA.length - 1);
    expect(adopted.some((c) => c._id.toString() === legacyId.toString())).toBe(true);

    const fresh = await City.findById(legacyId);
    expect(fresh.seedKey).toBe('usa-new-york');
    expect(fresh.name).toBe('New York');
    expect(fresh.avgPrice).toBe(750000);
    expect(fresh.demandIndex).toBe(1.8);
    expect(fresh.coordinates.lat).toBe(40.7128);
  });

  it('keeps all 18 legacy cities unchanged (same seedKeys, same values)', async () => {
    const { created } = await upsertCities();
    expect(created.length).toBe(49);

    for (const legacyName of LEGACY_CITIES) {
      const city = await City.findOne({ name: legacyName });
      expect(city, legacyName).toBeTruthy();
      expect(city.seedKey).toBeTruthy();
    }

    const ny = await City.findOne({ name: 'New York' });
    expect(ny.avgPrice).toBe(750000);
    expect(ny.demandIndex).toBe(1.8);
    expect(ny.supplyIndex).toBe(0.9);
    const hk = await City.findOne({ name: 'Hong Kong' });
    expect(hk.avgPrice).toBe(850000);
    expect(hk.country).toBe('China');
    const ist = await City.findOne({ name: 'Istanbul' });
    expect(ist.country).toBe('Turkey');
  });

  it('creates districts for every city (data-driven definitions or generic fallback)', async () => {
    const { created } = await upsertCities();
    const districts = await ensureCityDistricts(created);
    expect(districts.length).toBeGreaterThanOrEqual(CITIES_DATA.length * 3);

    for (const city of created) {
      const cityDistricts = await District.find({ cityId: city._id });
      expect(cityDistricts.length).toBeGreaterThanOrEqual(3);
      expect(cityDistricts.length).toBeLessThanOrEqual(5);
      for (const d of cityDistricts) {
        expect(d.tier).toBeTruthy();
        expect(d.baseDemand).toBeGreaterThan(0);
        expect(d.basePrice).toBeGreaterThan(0);
      }
    }
  });

  it('district seeding is idempotent — no duplicates on re-run', async () => {
    const { created } = await upsertCities();
    await ensureCityDistricts(created);
    const countAfterFirst = await District.countDocuments({});
    await ensureCityDistricts(created);
    const countAfterSecond = await District.countDocuments({});
    expect(countAfterSecond).toBe(countAfterFirst);

    const ny = await City.findOne({ name: 'New York' });
    const names = (await District.find({ cityId: ny._id })).map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('properties can be created in new cities', async () => {
    const { created } = await upsertCities();
    const miami = created.find((c) => c.name === 'Miami');
    expect(miami).toBeTruthy();

    const prop = await Property.create({
      name: 'Test Miami Property',
      cityId: miami._id,
      type: 'apartment',
      basePrice: 300000,
      currentPrice: 300000,
      forSale: true,
    });
    expect(prop.cityId.toString()).toBe(miami._id.toString());

    const found = await Property.findById(prop._id).populate('cityId');
    expect(found.cityId.name).toBe('Miami');
  });

  it('new cities work with the economy engine (simulateCities + simulateDemographics)', async () => {
    await GameState.create({ key: 'global', tickNumber: 100 });
    const { created } = await upsertCities();
    await ensureCityDistricts(created);

    await expect(simulateCities([])).resolves.toBeDefined();
    await expect(simulateDemographics(100)).resolves.toBeDefined();

    const miami = await City.findOne({ name: 'Miami' });
    expect(miami.supplyIndex).toBeGreaterThan(0);
    expect(miami.population).toBeGreaterThan(0);
  });

  it('seedCities combined run is idempotent and total', async () => {
    const first = await seedCities();
    expect(first.created.length).toBe(CITIES_DATA.length);
    expect(first.districtsCreated).toBeGreaterThanOrEqual(CITIES_DATA.length * 3);

    const second = await seedCities();
    expect(second.created.length).toBe(0);
    expect(second.districtsCreated).toBe(0);

    expect(await City.countDocuments({})).toBe(CITIES_DATA.length);
  });

  it('resetCities recreates the full world (used by dev seed and season reset)', async () => {
    await upsertCities();
    await City.create({
      name: 'Doomed City',
      country: 'Nowhere',
      coordinates: { lat: 0.1, lng: 0.1 },
      avgPrice: 100000,
    });

    const { cities, districtsCreated } = await resetCities();
    expect(cities.length).toBe(CITIES_DATA.length);
    expect(districtsCreated).toBeGreaterThanOrEqual(CITIES_DATA.length * 3);

    const names = (await City.find({})).map((c) => c.name);
    expect(names).not.toContain('Doomed City');
    expect(names).toContain('Miami');
    expect(names).toContain('Delhi');
  });

  it('season reset never leaves orphaned districts and every city has districts', async () => {
    await upsertCities();
    await ensureCityDistricts(await City.find({}));

    await resetCities();

    const cityIds = (await City.find({})).map((c) => c._id);
    const orphaned = await District.countDocuments({ cityId: { $nin: cityIds } });
    expect(orphaned).toBe(0);

    const noDistrictCities = [];
    for (const city of await City.find({})) {
      const d = await District.countDocuments({ cityId: city._id });
      if (d === 0) noDistrictCities.push(city.name);
    }
    expect(noDistrictCities).toEqual([]);

    const all = await District.find({});
    expect(new Set(all.map((d) => `${d.cityId}:${d.name}`)).size).toBe(all.length);
  });
});
