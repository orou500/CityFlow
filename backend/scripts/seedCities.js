#!/usr/bin/env node
/**
 * Idempotent world expansion script — adds missing cities + districts to an
 * EXISTING database without touching current gameplay data.
 *
 * - Adopts existing cities (matched by seedKey, or by name+country for
 *   legacy cities): their _id and all data are preserved; only a missing
 *   seedKey is backfilled.
 * - Creates any configured city that does not exist yet.
 * - Creates the initial district structure for cities that have none.
 * - Safe to run any number of times; never modifies existing cities or
 *   districts, never deletes anything.
 *
 * Usage:
 *   node scripts/seedCities.js            # dry run (prints what would happen)
 *   node scripts/seedCities.js --apply    # perform the additions
 *   node scripts/seedCities.js --verify   # report current world coverage
 *
 * Requires env MONGODB_URI (uses dotenv, falls back to localhost).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import City from '../src/models/City.js';
import District from '../src/models/District.js';
import { CITIES_DATA, COUNTRIES } from '../src/config/cities.js';
import { seedCities, ensureCityDistricts } from '../src/engine/citySeeding.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--verify') ? 'verify' : 'dry-run';

async function report() {
  const cities = await City.find({});
  const districts = await District.countDocuments({});
  const citiesWithDistricts = await District.distinct('cityId');
  const configuredSeedKeys = new Set(CITIES_DATA.map((c) => c.seedKey));
  const dbSeedKeys = new Set(cities.map((c) => c.seedKey).filter(Boolean));
  const missing = CITIES_DATA.filter((c) => !dbSeedKeys.has(c.seedKey)).map((c) => c.name);
  const legacy = cities.filter((c) => !c.seedKey).map((c) => c.name);
  const noDistricts = cities.filter((c) => !citiesWithDistricts.some((id) => id && id.toString() === c._id.toString())).map((c) => c.name);

  console.log(`[SEED] Configured cities : ${CITIES_DATA.length} (${COUNTRIES.length} countries)`);
  console.log(`[SEED] Cities in DB     : ${cities.length}`);
  console.log(`[SEED] Districts in DB  : ${districts}`);
  console.log(`[SEED] Missing cities   : ${missing.length ? missing.join(', ') : 'none'}`);
  console.log(`[SEED] Legacy (no key)  : ${legacy.length ? legacy.join(', ') : 'none'}`);
  console.log(`[SEED] Cities w/o distr : ${noDistricts.length ? noDistricts.join(', ') : 'none'}`);
  return { cities, missing, legacy, noDistricts };
}

async function main() {
  await mongoose.connect(URI);
  console.log(`[SEED] mode: ${mode}`);

  if (mode === 'verify') {
    await report();
    await mongoose.disconnect();
    return;
  }

  const before = await report();
  if (mode === 'dry-run') {
    console.log('[SEED] DRY RUN — no changes written.');
    await mongoose.disconnect();
    return;
  }

  const { created, adopted, districtsCreated } = await seedCities();
  console.log(`[SEED] Created ${created.length} cities: ${created.map((c) => c.name).join(', ') || 'none'}`);
  console.log(`[SEED] Adopted ${adopted.length} existing cities (seedKey backfilled)`);
  console.log(`[SEED] Created ${districtsCreated} districts`);

  const after = await report();
  const allConfigured = after.missing.length === 0;
  const allDistricts = after.noDistricts.length === 0;
  console.log(`[SEED] All configured cities present: ${allConfigured ? 'YES' : 'NO'}`);
  console.log(`[SEED] All cities have districts    : ${allDistricts ? 'YES' : 'NO'}`);
  if (!before.missing.length && before.noDistricts.length === 0 && before.legacy.length === 0) {
    console.log('[SEED] World already fully seeded — nothing to add (idempotent).');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[SEED] Unexpected error:', err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});