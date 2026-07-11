import City from '../models/City.js';
import Property from '../models/Property.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function simulateCities(activeEvents) {
  const [cities, propertyStats] = await Promise.all([
    City.find(),
    Property.aggregate([
      {
        $group: {
          _id: '$cityId',
          total: { $sum: 1 },
          owned: { $sum: { $cond: [{ $ne: ['$ownerId', null] }, 1, 0] } },
          totalPrice: { $sum: '$currentPrice' },
        },
      },
    ]),
  ]);

  const statsMap = new Map();
  for (const stat of propertyStats) {
    statsMap.set(stat._id.toString(), stat);
  }

  const results = [];
  const bulkOps = [];

  for (const city of cities) {
    const activeForCity = activeEvents.filter(
      (e) => e.type === 'global' || e.affectedCities?.some((id) => id.toString() === city._id.toString()),
    );

    let demandMod = 0;
    let supplyMod = 0;
    let growthMod = 0;

    for (const event of activeForCity) {
      demandMod += event.impact.demandDelta || 0;
      supplyMod += event.impact.supplyDelta || 0;
      growthMod += event.impact.growthDelta || 0;
    }

    const stats = statsMap.get(city._id.toString()) || { total: 0, owned: 0, totalPrice: 0 };
    const totalProperties = stats.total;
    const ownedProperties = stats.owned;

    const occupancyRate = totalProperties > 0 ? ownedProperties / totalProperties : 0.5;

    const occupancyBoost = occupancyRate > 0.1 ? (occupancyRate - 0.1) * 0.15 : 0;

    city.demandIndex = clamp(
      city.demandIndex + 0.01 * (1 - city.demandIndex) + demandMod + occupancyBoost,
      0.3,
      3.0,
    );

    city.supplyIndex = clamp(
      city.supplyIndex + 0.03 * (1 - city.supplyIndex) + supplyMod - totalProperties * 0.001,
      0.3,
      3.0,
    );

    const popGrowth = city.growthRate * (1 + city.demandIndex * 0.1) + growthMod;
    city.population = Math.max(10000, Math.floor(city.population * (1 + popGrowth * 0.01)));

    city.growthRate = clamp(city.growthRate + 0.001 * (city.demandIndex - 1) + growthMod * 0.1, -0.05, 0.1);

    city.avgPrice = totalProperties > 0 ? stats.totalPrice / totalProperties : city.avgPrice;
    city.propertyCount = totalProperties;

    bulkOps.push({
      updateOne: {
        filter: { _id: city._id },
        update: {
          $set: {
            demandIndex: city.demandIndex,
            supplyIndex: city.supplyIndex,
            population: city.population,
            growthRate: city.growthRate,
            avgPrice: city.avgPrice,
            propertyCount: city.propertyCount,
          },
        },
      },
    });

    results.push({
      cityId: city._id,
      name: city.name,
      demandIndex: city.demandIndex,
      supplyIndex: city.supplyIndex,
      population: city.population,
      growthRate: city.growthRate,
      avgPrice: city.avgPrice,
    });
  }

  if (bulkOps.length > 0) {
    await City.bulkWrite(bulkOps);
  }

  return results;
}
