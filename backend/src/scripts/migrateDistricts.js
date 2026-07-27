import mongoose from 'mongoose';
import { config } from '../config/index.js';
import City from '../models/City.js';
import District from '../models/District.js';
import Property from '../models/Property.js';
import { DISTRICT_NAMES } from '../config/districts.js';

async function migrate() {
  await mongoose.connect(config.mongodbUri);
  console.log('[MIGRATION] Connected to MongoDB');

  const cities = await City.find();
  console.log(`[MIGRATION] Found ${cities.length} cities`);

  let totalDistricts = 0;
  let totalPropertiesUpdated = 0;

  for (const city of cities) {
    const existingDistricts = await District.countDocuments({ cityId: city._id });
    if (existingDistricts > 0) {
      console.log(`[MIGRATION] ${city.name} already has ${existingDistricts} districts, skipping`);
      continue;
    }

    const districtDefs = DISTRICT_NAMES[city.name];
    if (!districtDefs) {
      console.log(`[MIGRATION] No district definitions for ${city.name}, creating defaults`);
      const defaultDistricts = [
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
      for (const def of defaultDistricts) {
        await District.create({
          cityId: city._id,
          name: def.name,
          tier: def.tier,
          population: Math.floor(city.population / defaultDistricts.length),
          demandIndex: def.baseDemand,
          supplyIndex: city.supplyIndex,
          growthRate: def.growthRate,
          avgPrice: def.basePrice,
          avgRent: Math.floor(def.basePrice * 0.001),
          propertyCount: 0,
          totalCapacity: Math.floor(city.totalCapacity / defaultDistricts.length),
          baseDemand: def.baseDemand,
          basePrice: def.basePrice,
        });
        totalDistricts++;
      }
      console.log(`[MIGRATION] Created ${defaultDistricts.length} default districts for ${city.name}`);
      continue;
    }

    const districts = [];
    for (const def of districtDefs) {
      const district = await District.create({
        cityId: city._id,
        name: def.name,
        tier: def.tier,
        population: Math.floor(city.population / districtDefs.length),
        demandIndex: def.baseDemand,
        supplyIndex: city.supplyIndex * (0.8 + Math.random() * 0.4),
        growthRate: def.growthRate,
        avgPrice: def.basePrice,
        avgRent: Math.floor(def.basePrice * 0.001),
        propertyCount: 0,
        totalCapacity: Math.floor(city.totalCapacity / districtDefs.length),
        baseDemand: def.baseDemand,
        basePrice: def.basePrice,
      });
      districts.push(district);
      totalDistricts++;
    }

    console.log(`[MIGRATION] Created ${districts.length} districts for ${city.name}`);

    const properties = await Property.find({ cityId: city._id, districtId: null });
    if (properties.length > 0) {
      const districtCount = districts.length;
      const bulkOps = [];
      const districtCounts = new Map();
      for (const district of districts) {
        districtCounts.set(district._id.toString(), 0);
      }
      for (const property of properties) {
        const assignedDistrict = districts[Math.floor(Math.random() * districtCount)];
        bulkOps.push({
          updateOne: { filter: { _id: property._id }, update: { $set: { districtId: assignedDistrict._id } } },
        });
        districtCounts.set(
          assignedDistrict._id.toString(),
          (districtCounts.get(assignedDistrict._id.toString()) || 0) + 1,
        );
        totalPropertiesUpdated++;
      }
      if (bulkOps.length > 0) {
        for (let i = 0; i < bulkOps.length; i += 500) {
          await Property.bulkWrite(bulkOps.slice(i, i + 500));
        }
      }
      const countBulkOps = [];
      for (const district of districts) {
        countBulkOps.push({
          updateOne: {
            filter: { _id: district._id },
            update: { $set: { propertyCount: districtCounts.get(district._id.toString()) || 0 } },
          },
        });
      }
      if (countBulkOps.length > 0) {
        await District.bulkWrite(countBulkOps);
      }
      console.log(`[MIGRATION] Assigned ${properties.length} properties to districts in ${city.name}`);
    }
  }

  console.log(`[MIGRATION] Done: ${totalDistricts} districts created, ${totalPropertiesUpdated} properties assigned`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('[MIGRATION] Failed:', err);
  process.exit(1);
});
