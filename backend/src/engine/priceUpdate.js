import Property from '../models/Property.js';
import City from '../models/City.js';
import { getTickNumber } from '../models/GameState.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function weightedRandom(options) {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.value;
  }
  return options[options.length - 1].value;
}

const REGIMES = {
  bull: { bias: 0.005, volMod: 0.8 },
  bear: { bias: -0.005, volMod: 0.8 },
  stable: { bias: 0.0, volMod: 0.5 },
  recovery: { bias: 0.003, volMod: 1.0 },
  correction: { bias: -0.003, volMod: 1.0 },
  boom: { bias: 0.008, volMod: 1.4 },
};

const REGIME_NAMES = Object.keys(REGIMES);

function pickRegime(demandIndex) {
  if (demandIndex > 1.5) {
    return weightedRandom([
      { value: 'bull', weight: 30 },
      { value: 'boom', weight: 20 },
      { value: 'stable', weight: 20 },
      { value: 'recovery', weight: 15 },
      { value: 'correction', weight: 10 },
      { value: 'bear', weight: 5 },
    ]);
  }
  if (demandIndex < 0.8) {
    return weightedRandom([
      { value: 'bear', weight: 30 },
      { value: 'correction', weight: 25 },
      { value: 'stable', weight: 20 },
      { value: 'recovery', weight: 15 },
      { value: 'bull', weight: 5 },
      { value: 'boom', weight: 5 },
    ]);
  }
  return weightedRandom([
    { value: 'stable', weight: 30 },
    { value: 'bull', weight: 20 },
    { value: 'bear', weight: 20 },
    { value: 'recovery', weight: 15 },
    { value: 'correction', weight: 10 },
    { value: 'boom', weight: 5 },
  ]);
}

function calculateMomentum(priceHistory) {
  if (!priceHistory || priceHistory.length < 3) return 0;
  const recent = priceHistory.slice(-5);
  let totalChange = 0;
  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].price;
    if (prev > 0) {
      totalChange += (recent[i].price - prev) / prev;
      count++;
    }
  }
  return count > 0 ? totalChange / count : 0;
}

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

  const bulkOps = [];

  for (const property of properties) {
    const city = cityMap.get(property.cityId?.toString());
    if (!city) continue;

    const eventDemandMod = cityEventCache.get(city._id.toString()) || 0;
    const effectiveDemand = clamp(city.demandIndex + eventDemandMod, 0.3, 3.0);

    const demandFactor = 1 + (effectiveDemand - 1.0) * 0.15;
    const supplyFactor = 1 / (1 + (city.supplyIndex - 1.0) * 0.1);
    const growthFactor = 1 + city.growthRate * 0.5;
    const fairValue = (property.basePrice || property.currentPrice) * demandFactor * supplyFactor * growthFactor;

    let regime = property.regime;
    let regimeEndTick = property.regimeEndTick || 0;

    if (!regime || tickNumber >= regimeEndTick) {
      regime = pickRegime(effectiveDemand);
      const duration = 6 + Math.floor(Math.random() * 13);
      regimeEndTick = tickNumber + duration;
    }

    const regimeConfig = REGIMES[regime];

    const regimeBias = regimeConfig.bias;

    const reversionStrength = 0.025;
    const reversion = clamp(
      ((fairValue - property.currentPrice) / property.currentPrice) * reversionStrength,
      -0.02,
      0.02,
    );

    const momentum = calculateMomentum(property.priceHistory) * 0.2;

    const propertyVol = property.volatility || 0.1;
    const noiseBase = propertyVol * 0.012 * regimeConfig.volMod;
    const noise = (Math.random() - 0.5) * noiseBase * 2;

    let change = regimeBias + reversion + momentum + noise;

    const priceRatio = property.basePrice > 0 ? property.currentPrice / property.basePrice : 1.0;

    if (priceRatio > 2.5) {
      const zone = (priceRatio - 2.5) / 0.5;
      change -= zone * 0.008;
    }
    if (priceRatio < 0.6) {
      const zone = (0.6 - priceRatio) / 0.1;
      change += zone * 0.008;
    }

    const maxChange = property.currentPrice * 0.04;
    change = clamp(change, -maxChange / property.currentPrice, maxChange / property.currentPrice);

    let newPrice = property.currentPrice * (1 + change);

    const floor = Math.round((property.basePrice || 0) * 0.5);
    const ceiling = Math.round((property.basePrice || 0) * 3.0);
    newPrice = clamp(Math.round(newPrice), floor || 1, ceiling || Infinity);

    const newRent = Math.round(newPrice * 0.004 * (0.5 + Math.random() * 0.5));

    const priceHistory = (property.priceHistory || []).concat({ tick: tickNumber, price: newPrice });
    const trimmedHistory = priceHistory.length > 100 ? priceHistory.slice(-100) : priceHistory;

    bulkOps.push({
      updateOne: {
        filter: { _id: property._id },
        update: {
          $set: {
            currentPrice: newPrice,
            rent: newRent,
            priceHistory: trimmedHistory,
            regime,
            regimeEndTick,
          },
        },
      },
    });
  }

  if (bulkOps.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      await Property.bulkWrite(bulkOps.slice(i, i + BATCH_SIZE));
    }
  }

  return bulkOps.map((op) => ({
    propertyId: op.updateOne.filter._id,
    newPrice: op.updateOne.update.$set.currentPrice,
  }));
}
