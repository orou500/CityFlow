import City from '../models/City.js';
import Property from '../models/Property.js';
import { ECONOMIC_CONDITIONS, DEMOGRAPHICS_CONFIG as CONFIG } from '../config/demographics.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickEconomicTransition(current) {
  const transitions = CONFIG.economicTransitions[current] || CONFIG.economicTransitions.stable;
  const r = Math.random();
  let cumulative = 0;
  for (const [condition, probability] of Object.entries(transitions)) {
    cumulative += probability;
    if (r <= cumulative) return condition;
  }
  return current;
}

function calculateAttractiveness(city) {
  const econ = ECONOMIC_CONDITIONS[city.economicCondition] || ECONOMIC_CONDITIONS.stable;
  const demandScore = (city.demandIndex - 1.0) * 0.3;
  const growthScore = city.growthRate * 2;
  const econScore = (econ.attractiveness - 1.0) * 0.4;
  const affordableRent = city.avgRent > 0 && city.avgRent < 2000 ? 0.1 : city.avgRent >= 2000 ? -0.1 : 0;
  return 1.0 + demandScore + growthScore + econScore + affordableRent;
}

function calculateDemandIndex(city) {
  const popLog = Math.log10(Math.max(10000, city.population) / 100000);
  const demandFromPopulation = popLog * CONFIG.demandPopulationWeight;
  const growthDemand = city.growthRate * 10 * CONFIG.demandGrowthWeight;
  const netMig = (city.immigration || 0) - (city.emigration || 0);
  const migrationDemand = (netMig / Math.max(1, city.population * 0.001)) * CONFIG.demandMigrationWeight;
  const econ = ECONOMIC_CONDITIONS[city.economicCondition] || ECONOMIC_CONDITIONS.stable;
  const economicDemand = econ.demandModifier * CONFIG.demandEconomicWeight * 10;
  const rawDemand = 1.0 + demandFromPopulation + growthDemand + migrationDemand + economicDemand;
  return clamp(rawDemand, 0.3, 3.0);
}

export async function simulateDemographics(currentTick) {
  const cities = await City.find();

  const cityIds = cities.map((c) => c._id);
  const propertyStats = await Property.aggregate([
    { $match: { cityId: { $in: cityIds }, type: { $ne: 'land' } } },
    {
      $group: {
        _id: '$cityId',
        totalUnits: { $sum: { $size: { $ifNull: ['$units', []] } } },
        totalRent: { $sum: '$rent' },
        propertyCount: { $sum: 1 },
        occupiedCount: {
          $sum: {
            $cond: [
              { $gt: ['$occupancy', 0] },
              { $multiply: [{ $size: { $ifNull: ['$units', []] } }, { $divide: ['$occupancy', 100] }] },
              0,
            ],
          },
        },
      },
    },
  ]);

  const statsMap = new Map();
  for (const stat of propertyStats) {
    statsMap.set(stat._id.toString(), stat);
  }

  const cityData = cities.map((city) => {
    const stats = statsMap.get(city._id.toString()) || {
      totalUnits: 0,
      totalRent: 0,
      propertyCount: 0,
      occupiedCount: 0,
    };
    const totalHousingCapacity =
      stats.totalUnits > 0 ? stats.totalUnits : Math.max(100, Math.round(city.population / 10));
    const occupiedUnits = Math.round(stats.occupiedCount);
    const avgRent = stats.totalUnits > 0 ? Math.round(stats.totalRent / stats.totalUnits) : city.avgRent || 500;
    const attractiveness = calculateAttractiveness(city);
    return { city, stats, totalHousingCapacity, occupiedUnits, avgRent, attractiveness };
  });

  const totalWorldPopulation = cityData.reduce((sum, d) => sum + d.city.population, 0);

  for (const d of cityData) {
    if (Math.random() < CONFIG.economicTransitionChance) {
      d.city.economicCondition = pickEconomicTransition(d.city.economicCondition);
    }
  }

  for (const d of cityData) {
    const city = d.city;
    const econ = ECONOMIC_CONDITIONS[city.economicCondition] || ECONOMIC_CONDITIONS.stable;

    const births = Math.round(city.population * (CONFIG.baseBirthRate + econ.birthRateMod));
    const deaths = Math.round(city.population * (CONFIG.baseDeathRate + econ.deathRateMod));
    const naturalChange = births - deaths;

    const emigrationPool = Math.round(city.population * CONFIG.migrationPoolPercent);
    d.emigrationPool = Math.max(0, emigrationPool);
    d.births = births;
    d.deaths = deaths;
    d.naturalChange = naturalChange;
  }

  const totalAttractiveness = cityData.reduce((sum, d) => sum + d.attractiveness, 0);
  const totalEmigrationPool = cityData.reduce((sum, d) => sum + d.emigrationPool, 0);

  for (const d of cityData) {
    const shareOfMigrants = totalAttractiveness > 0 ? d.attractiveness / totalAttractiveness : 1 / cityData.length;
    const immigration = Math.round(totalEmigrationPool * shareOfMigrants);
    d.immigration = immigration;
  }

  const bulkOps = [];

  for (const d of cityData) {
    try {
      const city = d.city;
      const netMigration = d.immigration - d.emigrationPool;
      const totalChange = d.naturalChange + netMigration;

      city.population = clamp(city.population + totalChange, CONFIG.minPopulation, CONFIG.maxPopulation);

      city.immigration = d.immigration;
      city.emigration = d.emigrationPool;

      const econ = ECONOMIC_CONDITIONS[city.economicCondition] || ECONOMIC_CONDITIONS.stable;
      city.growthRate = clamp(
        city.growthRate +
          0.001 * (city.demandIndex - 1.0) +
          econ.demandModifier * 0.05 +
          (netMigration > 0 ? 0.0003 : -0.0003),
        -0.05,
        0.1,
      );

      const newDemandIndex = calculateDemandIndex(city);
      city.demandIndex = clamp(city.demandIndex + (newDemandIndex - city.demandIndex) * 0.3, 0.3, 3.0);

      city.avgRent = Math.round(
        city.avgRent + (d.avgRent - city.avgRent) * CONFIG.rentSmoothingFactor * econ.rentModifier,
      );

      if (!city.demographicsHistory) city.demographicsHistory = [];
      city.demographicsHistory.push({
        tick: currentTick,
        population: city.population,
        demandIndex: Math.round(city.demandIndex * 100) / 100,
        supplyIndex: Math.round(city.supplyIndex * 100) / 100,
        growthRate: Math.round(city.growthRate * 10000) / 10000,
        avgRent: city.avgRent,
        immigration: city.immigration,
        emigration: city.emigration,
        economicCondition: city.economicCondition,
      });
      if (city.demographicsHistory.length > CONFIG.historyMaxEntries) {
        city.demographicsHistory = city.demographicsHistory.slice(-CONFIG.historyMaxEntries);
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: city._id },
          update: {
            $set: {
              economicCondition: city.economicCondition,
              avgRent: city.avgRent,
              immigration: city.immigration,
              emigration: city.emigration,
              population: city.population,
              growthRate: city.growthRate,
              demandIndex: city.demandIndex,
              demographicsHistory: city.demographicsHistory,
            },
          },
        },
      });
    } catch (err) {
      console.error(`Demographics error for city ${d.city.name}:`, err.message);
    }
  }

  if (bulkOps.length > 0) {
    await City.bulkWrite(bulkOps);
  }

  return bulkOps.map((op) => ({
    cityId: op.updateOne.filter._id,
    population: op.updateOne.update.$set.population,
    economicCondition: op.updateOne.update.$set.economicCondition,
  }));
}
