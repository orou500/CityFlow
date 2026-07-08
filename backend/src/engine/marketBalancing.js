import City from '../models/City.js';
import Property from '../models/Property.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function balanceMarket() {
  const cities = await City.find();
  const results = [];

  for (const city of cities) {
    const properties = await Property.find({ cityId: city._id });
    const total = properties.length;
    const owned = properties.filter(p => p.ownerId).length;
    const forSale = properties.filter(p => p.forSale).length;

    if (total === 0) continue;

    const ratio = forSale / total;

    if (ratio > 0.4) {
      city.supplyIndex = clamp(city.supplyIndex * 0.95, 0.3, 3.0);
    } else if (ratio < 0.1) {
      city.demandIndex = clamp(city.demandIndex * 1.05, 0.3, 3.0);
    }

    if (city.avgPrice > 0) {
      const affordabilityIndex = city.demandIndex / city.supplyIndex;
      if (affordabilityIndex > 3) {
        city.demandIndex = clamp(city.demandIndex * 0.98, 0.3, 3.0);
      } else if (affordabilityIndex < 0.4) {
        city.demandIndex = clamp(city.demandIndex * 1.02, 0.3, 3.0);
      }
    }

    await city.save();
    results.push({
      cityId: city._id,
      name: city.name,
      forSaleRatio: ratio,
      demandIndex: city.demandIndex,
      supplyIndex: city.supplyIndex,
    });
  }

  return results;
}
