import City from '../models/City.js';
import Property from '../models/Property.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function balanceMarket() {
  const forSaleStats = await Property.aggregate([
    {
      $group: {
        _id: '$cityId',
        total: { $sum: 1 },
        forSale: { $sum: { $cond: ['$forSale', 1, 0] } },
      },
    },
  ]);

  const statsMap = new Map();
  for (const stat of forSaleStats) {
    statsMap.set(stat._id.toString(), stat);
  }

  const cities = await City.find();
  const bulkOps = [];
  const results = [];

  for (const city of cities) {
    const stats = statsMap.get(city._id.toString());
    if (!stats || stats.total === 0) {
      results.push({
        cityId: city._id,
        name: city.name,
        forSaleRatio: 0,
        demandIndex: city.demandIndex,
        supplyIndex: city.supplyIndex,
      });
      continue;
    }

    const ratio = stats.forSale / stats.total;

    const updates = {};
    if (ratio > 0.4) {
      updates.supplyIndex = clamp(city.supplyIndex * 0.95, 0.3, 3.0);
    } else if (ratio < 0.1) {
      updates.demandIndex = clamp(city.demandIndex * 1.05, 0.3, 3.0);
    }

    if (city.avgPrice > 0) {
      const affordabilityIndex = city.demandIndex / city.supplyIndex;
      if (affordabilityIndex > 3) {
        updates.demandIndex = clamp(city.demandIndex * 0.98, 0.3, 3.0);
      } else if (affordabilityIndex < 0.4) {
        updates.demandIndex = clamp(city.demandIndex * 1.02, 0.3, 3.0);
      }
    }

    if (Object.keys(updates).length > 0) {
      bulkOps.push({ updateOne: { filter: { _id: city._id }, update: { $set: updates } } });
    }

    results.push({
      cityId: city._id,
      name: city.name,
      forSaleRatio: ratio,
      demandIndex: updates.demandIndex ?? city.demandIndex,
      supplyIndex: updates.supplyIndex ?? city.supplyIndex,
    });
  }

  if (bulkOps.length > 0) {
    await City.bulkWrite(bulkOps);
  }

  return results;
}
