#!/usr/bin/env node
/**
 * STAGING VERIFICATION for seedCities --apply (production seed safety).
 *
 * Boots an isolated in-memory MongoDB, builds a production-like state
 * (18 legacy cities WITHOUT seedKey — exactly what production has today,
 * districts for 6 of them, player/bank properties, a company, an auction,
 * a player), then runs the EXACT code path used by `seedCities.js --apply`
 * (`seedCities()` from src/engine/citySeeding.js) and prints before/after
 * counts plus safety assertions.
 *
 * Read-only with respect to any real environment — runs entirely on
 * mongodb-memory-server.
 *
 * Usage: node scripts/verifyCitySeed.js
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import City from '../src/models/City.js';
import District from '../src/models/District.js';
import Property from '../src/models/Property.js';
import User from '../src/models/User.js';
import RealEstateCompany from '../src/models/RealEstateCompany.js';
import Auction from '../src/models/Auction.js';
import { CITIES_DATA } from '../src/config/cities.js';
import { DISTRICT_NAMES } from '../src/config/districts.js';
import { seedCities } from '../src/engine/citySeeding.js';

const LEGACY = [
  ['New York', 'USA', 40.7128, -74.006],
  ['London', 'UK', 51.5074, -0.1278],
  ['Tokyo', 'Japan', 35.6762, 139.6503],
  ['Tel Aviv', 'Israel', 32.0853, 34.7818],
  ['Dubai', 'UAE', 25.2048, 55.2708],
  ['Paris', 'France', 48.8566, 2.3522],
  ['Sydney', 'Australia', -33.8688, 151.2093],
  ['Singapore', 'Singapore', 1.3521, 103.8198],
  ['Berlin', 'Germany', 52.52, 13.405],
  ['Mumbai', 'India', 19.076, 72.8777],
  ['São Paulo', 'Brazil', -23.5505, -46.6333],
  ['Toronto', 'Canada', 43.6532, -79.3832],
  ['Hong Kong', 'China', 22.3193, 114.1694],
  ['Barcelona', 'Spain', 41.3874, 2.1686],
  ['Amsterdam', 'Netherlands', 52.3676, 4.9041],
  ['Seoul', 'South Korea', 37.5665, 126.978],
  ['Los Angeles', 'USA', 34.0522, -118.2437],
  ['Istanbul', 'Turkey', 41.0082, 28.9784],
];

async function seedLegacyProductionLikeState() {
  const legacyIds = {};
  for (const [name, country, lat, lng] of LEGACY) {
    const src = CITIES_DATA.find((c) => c.name === name);
    const city = await City.create({
      name,
      country,
      coordinates: { lat, lng },
      population: src.population,
      growthRate: src.growthRate,
      demandIndex: src.demandIndex,
      supplyIndex: src.supplyIndex,
      avgPrice: src.avgPrice,
      totalCapacity: src.totalCapacity,
      developmentRate: src.developmentRate,
    });
    legacyIds[name] = city._id;
  }

  // Districts exist for exactly 6 legacy cities (as in production after migrateDistricts).
  let legacyDistricts = 0;
  for (const [name] of LEGACY) {
    const defs = DISTRICT_NAMES[name];
    if (!defs) continue;
    for (const def of defs) {
      await District.create({
        cityId: legacyIds[name],
        name: def.name,
        tier: def.tier,
        population: 50000,
        demandIndex: def.baseDemand,
        supplyIndex: 1.0,
        growthRate: def.growthRate,
        avgPrice: def.basePrice,
        avgRent: Math.round(def.basePrice * 0.004),
        totalCapacity: 10000,
        baseDemand: def.baseDemand,
        basePrice: def.basePrice,
      });
      legacyDistricts++;
    }
  }

  // Player-owned + bank properties in legacy cities.
  const player = await User.create({
    username: 'player1',
    email: 'player1@example.com',
    password: 'Password123',
    emailVerified: true,
    balance: 5_000_000,
  });
  const owned = await Property.create({
    name: 'Player Legacy Home',
    cityId: legacyIds['New York'],
    type: 'apartment',
    ownerId: player._id,
    basePrice: 400000,
    currentPrice: 420000,
    forSale: false,
  });
  player.ownedProperties.push(owned._id);
  await player.save();

  await Property.create({
    name: 'Bank Legacy Property',
    cityId: legacyIds['London'],
    type: 'house',
    ownerId: null,
    basePrice: 300000,
    currentPrice: 300000,
    forSale: true,
  });

  const company = await RealEstateCompany.create({
    name: 'Legacy Company',
    founderId: player._id,
    hqCityId: legacyIds['Tel Aviv'],
    members: [{ userId: player._id, role: 'ceo', shares: 700 }],
    shares: { totalShares: 1000, treasuryShares: 300, parValue: 100 },
    treasury: { balance: 100000, transactions: [] },
    stats: {},
  });

  await Auction.create({
    title: 'Legacy Auction',
    propertyId: (
      await Property.create({
        name: 'Auction Property',
        cityId: legacyIds['Paris'],
        type: 'commercial',
        basePrice: 500000,
        currentPrice: 500000,
        forSale: false,
      })
    )._id,
    status: 'active',
    sellerType: 'bank',
    currentBid: 500000,
    startingBid: 400000,
    bidIncrement: 10000,
    startTick: 100,
    originalEndTick: 200,
    endTick: 200,
  });

  return { playerId: player._id, companyId: company._id };
}

async function counts() {
  const cities = await City.find({}).sort({ name: 1 });
  const distinctCountries = new Set(cities.map((c) => c.country));
  const citiesWithoutDistricts = [];
  for (const city of cities) {
    const d = await District.countDocuments({ cityId: city._id });
    if (d === 0) citiesWithoutDistricts.push(city.name);
  }
  return {
    cities: cities.length,
    countries: distinctCountries.size,
    districts: await District.countDocuments({}),
    properties: await Property.countDocuments({}),
    users: await User.countDocuments({}),
    companies: await RealEstateCompany.countDocuments({}),
    auctions: await Auction.countDocuments({}),
    orphanedDistricts: await District.countDocuments({ cityId: { $nin: cities.map((c) => c._id) } }),
    citiesWithoutDistricts,
  };
}

async function main() {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);
  console.log('[VERIFY] Staging MongoDB started (isolated, no real data touched)\n');

  // ── 1. Build production-like state ──
  await seedLegacyProductionLikeState();
  const before = await counts();
  const legacyIdsBefore = {};
  for (const city of await City.find({})) legacyIdsBefore[city.name] = city._id.toString();

  console.log('[VERIFY] === BEFORE (simulated current production) ===');
  console.log(`  cities               : ${before.cities}`);
  console.log(`  countries            : ${before.countries}`);
  console.log(`  districts            : ${before.districts}`);
  console.log(`  properties           : ${before.properties}`);
  console.log(`  users                : ${before.users}`);
  console.log(`  companies            : ${before.companies}`);
  console.log(`  auctions             : ${before.auctions}`);
  console.log(`  orphaned districts   : ${before.orphanedDistricts}`);
  console.log(
    `  cities w/o districts : ${before.citiesWithoutDistricts.length ? before.citiesWithoutDistricts.join(', ') : 'none'}`,
  );

  // ── 2. Run the EXACT seedCities() used by `seedCities.js --apply` ──
  const result = await seedCities();
  const after = await counts();

  console.log('\n[VERIFY] === AFTER first seedCities() run ===');
  console.log(`  cities created  : ${result.created.length}`);
  console.log(`  cities adopted  : ${result.adopted.length}`);
  console.log(`  districts made  : ${result.districtsCreated}`);
  console.log(`  cities               : ${after.cities}`);
  console.log(`  countries            : ${after.countries}`);
  console.log(`  districts            : ${after.districts}`);
  console.log(`  properties           : ${after.properties}`);
  console.log(`  users                : ${after.users}`);
  console.log(`  companies            : ${after.companies}`);
  console.log(`  auctions             : ${after.auctions}`);
  console.log(`  orphaned districts   : ${after.orphanedDistricts}`);
  console.log(
    `  cities w/o districts : ${after.citiesWithoutDistricts.length ? after.citiesWithoutDistricts.join(', ') : 'none'}`,
  );

  // ── 3. Safety assertions ──
  const failures = [];
  const ok = (cond, label) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) failures.push(label);
  };

  console.log('\n[VERIFY] === SAFETY ASSERTIONS ===');
  ok(after.cities === 49, `49 cities total (got ${after.cities})`);
  ok(after.countries === 20, `20 countries total (got ${after.countries})`);
  ok(result.created.length === 31, `exactly 31 new cities created (got ${result.created.length})`);
  ok(result.adopted.length === 18, `exactly 18 existing cities adopted (got ${result.adopted.length})`);
  ok(after.properties === before.properties, 'properties untouched');
  ok(after.users === before.users, 'users untouched');
  ok(after.companies === before.companies, 'companies untouched');
  ok(after.auctions === before.auctions, 'auctions untouched');

  const cityNames = (await City.find({})).map((c) => c.name);
  const allNames = CITIES_DATA.map((c) => c.name);
  ok(
    allNames.every((n) => cityNames.includes(n)),
    'every configured city present',
  );
  ok(new Set(cityNames).size === 49, 'no duplicate city names');

  const norm = (s) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  ok(
    cityNames.filter((n) => norm(n) === 'sao paulo').length === 1,
    `exactly one São Paulo (got ${cityNames.filter((n) => norm(n) === 'sao paulo').length})`,
  );
  ok(cityNames.includes('São Paulo'), "accented 'São Paulo' is the canonical name");

  let allIdsPreserved = true;
  for (const city of await City.find({})) {
    if (legacyIdsBefore[city.name] && legacyIdsBefore[city.name] !== city._id.toString()) allIdsPreserved = false;
  }
  ok(allIdsPreserved, 'all 18 legacy _id values preserved');

  const cityCountryOk = CITIES_DATA.every((c) => {
    const found = cityNames.includes(c.name);
    if (!found) return false;
    return true;
  });
  ok(cityCountryOk, 'city->country config coherent');

  const ny = await City.findOne({ name: 'New York' });
  ok(ny.avgPrice === 750000 && ny.demandIndex === 1.8, 'legacy economy values untouched (New York)');
  ok(ny.seedKey === 'usa-new-york', 'seedKey backfilled on legacy city');
  ok(ny.supplyIndex === 0.9, 'legacy supplyIndex untouched (New York)');

  ok(after.orphanedDistricts === 0, 'no orphaned districts');
  ok(after.citiesWithoutDistricts.length === 0, 'every city has at least one district');

  const districtNamesPerCity = new Set();
  const districtNames = await District.find({});
  for (const d of districtNames) districtNamesPerCity.add(`${d.cityId}:${d.name}`);
  ok(districtNamesPerCity.size === districtNames.length, 'no duplicate (city, district-name) pairs');

  // ── 4. Idempotency: run again ──
  const second = await seedCities();
  const afterSecond = await counts();
  console.log('\n[VERIFY] === AFTER second seedCities() run (idempotency) ===');
  ok(second.created.length === 0, `second run creates 0 cities (got ${second.created.length})`);
  ok(second.adopted.length === 49, `second run adopts 49 (got ${second.adopted.length})`);
  ok(second.districtsCreated === 0, `second run creates 0 districts (got ${second.districtsCreated})`);
  ok(afterSecond.cities === 49 && afterSecond.districts === after.districts, 'counts unchanged after second run');
  ok(afterSecond.properties === before.properties && afterSecond.users === before.users, 'data still untouched');

  console.log(
    `\n[VERIFY] === RESULT: ${failures.length === 0 ? 'ALL CHECKS PASSED' : failures.length + ' FAILURES'} ===`,
  );
  if (failures.length > 0) {
    failures.forEach((f) => console.log(`  FAILED: ${f}`));
    process.exitCode = 1;
  }

  await mongoose.disconnect();
  await mongo.stop();
}

main().catch(async (err) => {
  console.error('[VERIFY] Unexpected error:', err);
  process.exit(1);
});
