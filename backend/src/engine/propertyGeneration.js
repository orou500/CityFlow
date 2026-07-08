import City from '../models/City.js';
import Property from '../models/Property.js';
import User from '../models/User.js';

const PROPERTY_TYPES = ['apartment', 'house', 'commercial', 'land'];
const PROPERTY_NAMES = [
  'Sunset Tower',
  'Harbor View',
  'Central Plaza',
  'Royal Manor',
  'Sky Residence',
  'Ocean Breeze',
  'City Heights',
  'Golden Gate',
  'Silver Lake',
  'Pinewood Estate',
  'Metro Loft',
  'Garden Villa',
  'Urban Nest',
  'Crystal Tower',
  'Heritage Home',
  'Park Avenue',
  'Riverside Flat',
  'Downtown Hub',
  'Elite Suite',
  'Grand Terrace',
];

const LOCATIONS = [
  'Downtown',
  'Midtown',
  'Suburban',
  'Waterfront',
  'Business District',
  'Central',
  'Industrial Zone',
  'Residential Area',
  'Commercial District',
  'Historic District',
  'Tech Hub',
  'University Area',
];

const LAND_SIZES = [2000, 3000, 4000, 5000, 6000, 7500, 8000, 10000, 12000, 15000, 20000];

export async function generateProperties() {
  const systemUser = await User.findOne({ username: '__system__' });
  if (!systemUser) {
    console.log('[PROP_GEN] System user not found, skipping');
    return [];
  }

  const cities = await City.find();
  const results = [];

  for (const city of cities) {
    const currentCount = await Property.countDocuments({ cityId: city._id });

    if (currentCount >= city.totalCapacity) {
      results.push({ cityId: city._id, cityName: city.name, generated: 0, reason: 'at capacity' });
      continue;
    }

    const demandFactor = city.demandIndex / 100;
    const rawDemand = Math.floor(city.population * city.developmentRate * demandFactor);
    const maxNew = city.totalCapacity - currentCount;
    const countToGenerate = Math.min(rawDemand, maxNew);

    if (countToGenerate <= 0) {
      results.push({ cityId: city._id, cityName: city.name, generated: 0, reason: 'no demand' });
      continue;
    }

    const properties = [];
    const usedNames = new Set();

    for (let i = 0; i < countToGenerate; i++) {
      let nameIndex;
      do {
        nameIndex = Math.floor(Math.random() * PROPERTY_NAMES.length);
      } while (usedNames.has(nameIndex) && usedNames.size < PROPERTY_NAMES.length);
      usedNames.add(nameIndex);

      const type = PROPERTY_TYPES[Math.floor(Math.random() * PROPERTY_TYPES.length)];
      const locationMultiplier = 0.6 + Math.random() * 0.8;
      const marketCondition = demandFactor > 0.07 ? 1.1 : demandFactor < 0.03 ? 0.9 : 1.0;
      const price = Math.round(city.avgPrice * locationMultiplier * marketCondition);

      const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];

      properties.push({
        cityId: city._id,
        ownerId: systemUser._id,
        type,
        name: `${PROPERTY_NAMES[nameIndex]} - ${city.name}`,
        basePrice: price,
        currentPrice: price,
        rent: Math.round(price * 0.004),
        volatility: 0.05 + Math.random() * 0.15,
        forSale: true,
        location,
        ...(type === 'land'
          ? { size: LAND_SIZES[Math.floor(Math.random() * LAND_SIZES.length)], developmentLevel: 0 }
          : {}),
      });
    }

    await Property.insertMany(properties);
    city.propertyCount = currentCount + properties.length;
    await city.save();

    results.push({
      cityId: city._id,
      cityName: city.name,
      generated: properties.length,
      reason: 'demand',
    });
  }

  const totalGenerated = results.reduce((s, r) => s + r.generated, 0);
  if (totalGenerated > 0) {
    console.log(
      `[PROP_GEN] Generated ${totalGenerated} new properties across ${results.filter((r) => r.generated > 0).length} cities`,
    );
  }
  return results;
}
