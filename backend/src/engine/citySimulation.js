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

    let supplyMod = 0;

    for (const event of activeForCity) {
      supplyMod += event.impact.supplyDelta || 0;
    }

    const stats = statsMap.get(city._id.toString()) || { total: 0, owned: 0, totalPrice: 0 };
    const totalProperties = stats.total;

    city.supplyIndex = clamp(
      city.supplyIndex + 0.03 * (1 - city.supplyIndex) + supplyMod - totalProperties * 0.001,
      0.3,
      3.0,
    );

    city.avgPrice = totalProperties > 0 ? stats.totalPrice / totalProperties : city.avgPrice;
    city.propertyCount = totalProperties;

    bulkOps.push({
      updateOne: {
        filter: { _id: city._id },
        update: {
          $set: {
            supplyIndex: city.supplyIndex,
            avgPrice: city.avgPrice,
            propertyCount: city.propertyCount,
          },
        },
      },
    });

    results.push({
      cityId: city._id,
      name: city.name,
      supplyIndex: city.supplyIndex,
      avgPrice: city.avgPrice,
      economicCondition: city.economicCondition,
    });
  }

  if (bulkOps.length > 0) {
    await City.bulkWrite(bulkOps);
  }

  return results;
}
