import City from '../models/City.js';
import Property from '../models/Property.js';

const ECON_MOD = {
  boom: 0.04,
  growth: 0.02,
  stable: 0.0,
  slowdown: -0.02,
  recession: -0.04,
};

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

    // Supply responds to multiple economic factors:
    // 1. Mean reversion toward equilibrium (1.0)
    // 2. Development rate — cities with high development build more supply
    // 3. Demand pressure — high demand attracts development
    // 4. Population growth — growing cities add supply
    // 5. Economic condition — boom/growth increase supply, recession reduces it
    // 6. Event supply deltas (natural disasters, construction booms, etc.)
    // 7. Saturation — cities near capacity see slower supply growth

    const econMod = ECON_MOD[city.economicCondition] || 0;
    const reversionForce = 0.02 * (1.0 - city.supplyIndex);
    const developmentPush = city.developmentRate * 0.5;
    const demandPull = Math.max(0, city.demandIndex - 1.0) * 0.03;
    const growthContribution = city.growthRate * 2;
    const saturationPenalty = Math.max(0, totalProperties / Math.max(1, city.totalCapacity) - 0.7) * 0.05;
    const noise = (Math.random() - 0.5) * 0.02;

    const supplyDelta =
      reversionForce +
      developmentPush +
      demandPull +
      growthContribution +
      econMod +
      supplyMod -
      saturationPenalty +
      noise;

    city.supplyIndex = clamp(city.supplyIndex + supplyDelta, 0.3, 3.0);

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
