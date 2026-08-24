import City from '../models/City.js';
import District from '../models/District.js';
import { CITIES_DATA } from '../config/cities.js';
import { DISTRICT_NAMES } from '../config/districts.js';

/**
 * Idempotent, production-safe city seeding.
 *
 * - Adopt-or-create: an existing city is matched by seedKey, or by (name,
 *   country) as a fallback for cities seeded before seedKey existed. Matched
 *   cities keep their MongoDB _id and ALL existing data; only a missing
 *   seedKey is backfilled. Unmatched entries are created fresh.
 * - Re-running never duplicates cities and never modifies existing cities.
 */

export async function upsertCities() {
  const created = [];
  const adopted = [];

  for (const entry of CITIES_DATA) {
    const existing = await City.findOne({
      $or: [{ seedKey: entry.seedKey }, { name: entry.name, country: entry.country }],
    });
    if (existing) {
      if (!existing.seedKey) {
        existing.seedKey = entry.seedKey;
        await existing.save();
      }
      adopted.push(existing);
    } else {
      const city = await City.create(entry);
      created.push(city);
    }
  }

  return { created, adopted };
}

/**
 * Create the initial district structure for cities that have none, using the
 * same data model as existing cities: per-city definitions from
 * DISTRICT_NAMES when available, otherwise the generic Downtown/Suburbs/Uptown
 * structure derived from the city's economy values. Idempotent (per-city,
 * per-name unique index) and additive — existing districts are never touched.
 */
export async function ensureCityDistricts(cities) {
  const created = [];

  for (const city of cities) {
    const existingCount = await District.countDocuments({ cityId: city._id });
    if (existingCount > 0) continue;

    const districtDefs = DISTRICT_NAMES[city.name];
    const defs = districtDefs || [
      {
        name: 'Downtown',
        tier: 'growing',
        baseDemand: city.demandIndex,
        basePrice: city.avgPrice,
        growthRate: city.growthRate,
      },
      {
        name: 'Suburbs',
        tier: 'affordable',
        baseDemand: city.demandIndex * 0.8,
        basePrice: city.avgPrice * 0.6,
        growthRate: city.growthRate * 1.2,
      },
      {
        name: 'Uptown',
        tier: 'premium',
        baseDemand: city.demandIndex * 1.3,
        basePrice: city.avgPrice * 1.5,
        growthRate: city.growthRate * 0.8,
      },
    ];

    for (const def of defs) {
      const district = await District.create({
        cityId: city._id,
        name: def.name,
        tier: def.tier,
        population: Math.floor(city.population / defs.length),
        demandIndex: def.baseDemand,
        supplyIndex: city.supplyIndex,
        growthRate: def.growthRate,
        avgPrice: def.basePrice,
        avgRent: Math.round(def.basePrice * 0.004),
        propertyCount: 0,
        totalCapacity: Math.floor(city.totalCapacity / defs.length),
        baseDemand: def.baseDemand,
        basePrice: def.basePrice,
      });
      created.push(district);
    }
  }

  return created;
}

/**
 * Combined idempotent seeding: upsert all configured cities, then create
 * districts for any city that has none. Safe to run at any time against an
 * existing database.
 */
export async function seedCities() {
  const { created, adopted } = await upsertCities();
  const allCities = await City.find({});
  const districts = await ensureCityDistricts(allCities);
  return { created, adopted, districtsCreated: districts.length };
}

/** Fresh-world seeding (dev seed / season reset): wipes and re-inserts all cities + districts. */
export async function resetCities() {
  await City.deleteMany({});
  await District.deleteMany({});
  const cities = await City.insertMany(CITIES_DATA);
  const districts = await ensureCityDistricts(cities);
  return { cities, districtsCreated: districts.length };
}
