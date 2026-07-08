import Property from '../models/Property.js';
import City from '../models/City.js';
import { getTickNumber } from '../models/GameState.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function updatePrices(activeEvents) {
  const [cities, tickNumber] = await Promise.all([City.find().lean(), getTickNumber()]);
  const cityMap = new Map(cities.map((c) => [c._id.toString(), c]));

  let globalPriceMod = 1.0;
  for (const event of activeEvents) {
    if (event.type === 'global' && event.impact.priceMultiplier) {
      globalPriceMod *= event.impact.priceMultiplier;
    }
  }

  const cityEventCache = new Map();
  for (const city of cities) {
    const localEvents = activeEvents.filter((e) =>
      e.affectedCities?.some((id) => id.toString() === city._id.toString()),
    );
    let localPriceMod = 1.0;
    for (const event of localEvents) {
      if (event.impact.priceMultiplier) {
        localPriceMod *= event.impact.priceMultiplier;
      }
    }
    cityEventCache.set(city._id.toString(), localPriceMod);
  }

  const properties = await Property.find().lean();

  const updates = [];
  const bulkOps = [];

  for (const property of properties) {
    const city = cityMap.get(property.cityId?.toString());
    if (!city) continue;

    const localPriceMod = cityEventCache.get(city._id.toString()) || 1.0;

    const noise = 1 + (Math.random() - 0.5) * (property.volatility || 0.1) * 2;
    const supplyPenalty = city.supplyIndex > 1.5 ? 1.5 / city.supplyIndex : 1;

    const newPrice =
      (property.basePrice || 0) *
      city.demandIndex *
      (1 + city.growthRate) *
      noise *
      globalPriceMod *
      localPriceMod *
      supplyPenalty;

    const oldPrice = property.currentPrice;
    const clampedPrice = clamp(
      Math.round(newPrice),
      Math.round((property.basePrice || 0) * 0.2),
      Math.round((property.basePrice || 0) * 5.0),
    );

    const newRent = Math.round(clampedPrice * 0.004 * (0.5 + Math.random() * 0.5));

    const priceHistory = (property.priceHistory || []).concat({ tick: tickNumber, price: clampedPrice });
    const trimmedHistory = priceHistory.length > 100 ? priceHistory.slice(-100) : priceHistory;

    bulkOps.push({
      updateOne: {
        filter: { _id: property._id },
        update: {
          $set: { currentPrice: clampedPrice, rent: newRent, priceHistory: trimmedHistory },
        },
      },
    });

    updates.push({
      propertyId: property._id,
      name: property.name,
      oldPrice,
      newPrice: clampedPrice,
    });
  }

  if (bulkOps.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      await Property.bulkWrite(bulkOps.slice(i, i + BATCH_SIZE));
    }
  }

  return updates;
}
