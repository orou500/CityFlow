import City from '../models/City.js';
import Property from '../models/Property.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function simulateCities(activeEvents) {
  const cities = await City.find();
  const results = [];

  for (const city of cities) {
    const activeForCity = activeEvents.filter(
      (e) => e.type === 'global' || e.affectedCities.some((id) => id.toString() === city._id.toString()),
    );

    let demandMod = 0;
    let supplyMod = 0;
    let growthMod = 0;

    for (const event of activeForCity) {
      demandMod += event.impact.demandDelta || 0;
      supplyMod += event.impact.supplyDelta || 0;
      growthMod += event.impact.growthDelta || 0;
    }

    const properties = await Property.find({ cityId: city._id });
    const totalProperties = properties.length;
    const ownedProperties = properties.filter((p) => p.ownerId).length;

    const occupancyRate = totalProperties > 0 ? ownedProperties / totalProperties : 0.5;

    city.demandIndex = clamp(
      city.demandIndex + 0.05 * (1 - city.demandIndex) + demandMod + (occupancyRate - 0.5) * 0.1,
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

    const totalPrice = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    city.avgPrice = totalProperties > 0 ? totalPrice / totalProperties : city.avgPrice;
    city.propertyCount = totalProperties;

    await city.save();
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

  return results;
}
