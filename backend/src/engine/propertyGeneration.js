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
  const [cities, activePlayerCount] = await Promise.all([
    City.find(),
    User.countDocuments({
      lastLoginAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
  ]);

  const results = [];
  const playerFactor = Math.min(activePlayerCount / 50, 1.0);

  for (const city of cities) {
    const currentCount = await Property.countDocuments({ cityId: city._id });

    if (currentCount >= city.totalCapacity) {
      results.push({ cityId: city._id, cityName: city.name, generated: 0, reason: 'at capacity' });
      continue;
    }

    const unsoldCount = await Property.countDocuments({
      cityId: city._id,
      ownerId: null,
      forSale: true,
    });
    const unsoldRatio = currentCount > 0 ? unsoldCount / currentCount : 0;

    if (unsoldRatio >= 0.4) {
      results.push({ cityId: city._id, cityName: city.name, generated: 0, reason: 'saturated' });
      continue;
    }

    const saturationFactor = unsoldRatio <= 0.2 ? 1.0 : Math.max(0, 1 - (unsoldRatio - 0.2) / 0.2);

    const popFactor = Math.pow(city.population / 100000, 0.3);
    const baseCount = (popFactor - 1) * 7 + 2;
    const devRateFactor = city.developmentRate / 0.02;
    const demandModifier = city.demandIndex;

    let rawCount = baseCount * demandModifier * devRateFactor * playerFactor * saturationFactor;

    const randomFactor = 0.7 + Math.random() * 0.6;
    rawCount = Math.round(rawCount * randomFactor);

    const maxNew = city.totalCapacity - currentCount;
    const countToGenerate = Math.max(0, Math.min(rawCount, maxNew));

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
      const demandPriceMod = 0.85 + (city.demandIndex / 3.0) * 0.3;
      const price = Math.round(city.avgPrice * locationMultiplier * demandPriceMod);

      const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];

      properties.push({
        cityId: city._id,
        ownerId: null,
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
      `[PROP_GEN] Generated ${totalGenerated} new properties across ${results.filter((r) => r.generated > 0).length} cities (active players: ${activePlayerCount})`,
    );
  }
  return results;
}
