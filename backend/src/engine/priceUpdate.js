import Property from '../models/Property.js';
import City from '../models/City.js';
import { getTickNumber } from '../models/GameState.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const PRICE_FLOOR = 0.5;
const PRICE_CEILING = 3.0;
const MAX_TICK_CHANGE = 0.03;
const SMOOTHING_FACTOR = 0.2;
const MOMENTUM_AMPLIFICATION = 1.5;
const MOMENTUM_CAP = 0.05;
const NOISE_RANGE = 0.01;

export async function updatePrices(activeEvents) {
  const [cities, tickNumber] = await Promise.all([City.find().lean(), getTickNumber()]);
  const cityMap = new Map(cities.map((c) => [c._id.toString(), c]));

  const cityEventCache = new Map();
  for (const city of cities) {
    const localEvents = activeEvents.filter((e) =>
      e.affectedCities?.some((id) => id.toString() === city._id.toString()),
    );
    let eventDemandMod = 0;
    for (const event of localEvents) {
      eventDemandMod += event.impact.demandDelta || 0;
    }
    const globalEvents = activeEvents.filter((e) => e.type === 'global');
    for (const event of globalEvents) {
      eventDemandMod += (event.impact.demandDelta || 0) * 0.5;
    }
    cityEventCache.set(city._id.toString(), eventDemandMod);
  }

  const properties = await Property.find().lean();

  const updates = [];
  const bulkOps = [];

  for (const property of properties) {
    const city = cityMap.get(property.cityId?.toString());
    if (!city) continue;

    const eventDemandMod = cityEventCache.get(city._id.toString()) || 0;

    const effectiveDemand = clamp(city.demandIndex + eventDemandMod, 0.3, 3.0);

    const demandEffect = 1 + (effectiveDemand - 1.0) * 0.02;
    const growthEffect = 1 + city.growthRate * 0.2;
    const supplyPenalty = city.supplyIndex > 1.5 ? 1 + (1.5 - city.supplyIndex) * 0.1 : 1;

    const targetMultiplier = demandEffect * growthEffect * supplyPenalty;
    const targetPrice = property.basePrice * targetMultiplier;

    const blendedPrice = property.currentPrice * (1 - SMOOTHING_FACTOR) + targetPrice * SMOOTHING_FACTOR;

    const history = property.priceHistory || [];
    let momentum = 0;
    if (history.length >= 3) {
      const prices = history.slice(-3);
      const trend = (prices.at(-1).price - prices[0].price) / prices[0].price;
      momentum = clamp(trend * MOMENTUM_AMPLIFICATION, -MOMENTUM_CAP, MOMENTUM_CAP);
    }

    const noise = 1 + (Math.random() - 0.5) * NOISE_RANGE * 2;

    let newPrice = blendedPrice * (1 + momentum) * noise;

    const oldPrice = property.currentPrice;
    const maxDelta = oldPrice * MAX_TICK_CHANGE;
    const rawDelta = newPrice - oldPrice;
    const clampedDelta = clamp(rawDelta, -maxDelta, maxDelta);
    newPrice = oldPrice + clampedDelta;

    const floor = Math.round((property.basePrice || 0) * PRICE_FLOOR);
    const ceiling = Math.round((property.basePrice || 0) * PRICE_CEILING);
    newPrice = clamp(Math.round(newPrice), floor || 1, ceiling || Infinity);

    const newRent = Math.round(newPrice * 0.004 * (0.5 + Math.random() * 0.5));

    const priceHistory = (property.priceHistory || []).concat({ tick: tickNumber, price: newPrice });
    const trimmedHistory = priceHistory.length > 100 ? priceHistory.slice(-100) : priceHistory;

    bulkOps.push({
      updateOne: {
        filter: { _id: property._id },
        update: {
          $set: { currentPrice: newPrice, rent: newRent, priceHistory: trimmedHistory },
        },
      },
    });

    updates.push({
      propertyId: property._id,
      name: property.name,
      oldPrice,
      newPrice,
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
