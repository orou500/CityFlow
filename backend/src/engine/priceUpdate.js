import Property from '../models/Property.js';
import City from '../models/City.js';
import { getTickNumber } from '../models/GameState.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function updatePrices(activeEvents) {
  const properties = await Property.find().populate('cityId');
  const tickNumber = await getTickNumber();
  const updates = [];

  let globalPriceMod = 1.0;
  for (const event of activeEvents) {
    if (event.type === 'global' && event.impact.priceMultiplier) {
      globalPriceMod *= event.impact.priceMultiplier;
    }
  }

  for (const property of properties) {
    const city = property.cityId;
    if (!city) continue;

    const localEvents = activeEvents.filter(e =>
      e.affectedCities.some(id => id.toString() === city._id.toString())
    );
    let localPriceMod = 1.0;
    for (const event of localEvents) {
      if (event.impact.priceMultiplier) {
        localPriceMod *= event.impact.priceMultiplier;
      }
    }

    const noise = 1 + (Math.random() - 0.5) * property.volatility * 2;
    const supplyPenalty = city.supplyIndex > 1.5 ? (1.5 / city.supplyIndex) : 1;

    const newPrice =
      property.basePrice *
      city.demandIndex *
      (1 + city.growthRate) *
      noise *
      globalPriceMod *
      localPriceMod *
      supplyPenalty;

    const oldPrice = property.currentPrice;
    property.currentPrice = clamp(
      Math.round(newPrice),
      Math.round(property.basePrice * 0.2),
      Math.round(property.basePrice * 5.0)
    );

    property.rent = Math.round(property.currentPrice * 0.004 * (0.5 + Math.random() * 0.5));

    property.priceHistory.push({ tick: tickNumber, price: property.currentPrice });
    if (property.priceHistory.length > 100) {
      property.priceHistory = property.priceHistory.slice(-100);
    }

    await property.save();
    updates.push({
      propertyId: property._id,
      name: property.name,
      oldPrice,
      newPrice: property.currentPrice,
    });
  }

  return updates;
}
