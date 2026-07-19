import StockIndex from '../models/StockIndex.js';
import Company from '../models/Company.js';
import City from '../models/City.js';

const INITIAL_VALUE = 1000;
const HISTORY_MAX = 120;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function initializeIndexes() {
  const existingCount = await StockIndex.countDocuments();
  if (existingCount > 0) return;

  const companies = await Company.find({ active: true }).select('_id industry hqCityId');
  if (companies.length === 0) return;

  const industries = [...new Set(companies.map((c) => c.industry))];
  const cities = await City.find().select('_id name');
  const cityIds = [...new Set(companies.map((c) => c.hqCityId.toString()))];

  const indexes = [];

  indexes.push({
    name: 'World Index',
    ticker: 'WLD',
    type: 'world',
    filterKey: null,
    value: INITIAL_VALUE,
    previousValue: INITIAL_VALUE,
    constituents: companies.map((c) => c._id),
    constituentCount: companies.length,
    sharesOutstanding: 10000000,
    performance: [],
    active: true,
  });

  for (const industry of industries) {
    const industryCompanies = companies.filter((c) => c.industry === industry);
    if (industryCompanies.length === 0) continue;
    indexes.push({
      name: `${industry.charAt(0).toUpperCase() + industry.slice(1)} Index`,
      ticker: industry.slice(0, 4).toUpperCase(),
      type: 'industry',
      filterKey: industry,
      value: INITIAL_VALUE,
      previousValue: INITIAL_VALUE,
      constituents: industryCompanies.map((c) => c._id),
      constituentCount: industryCompanies.length,
      sharesOutstanding: 5000000,
      performance: [],
      active: true,
    });
  }

  for (const cityId of cityIds) {
    const city = cities.find((c) => c._id.toString() === cityId);
    if (!city) continue;
    const cityCompanies = companies.filter((c) => c.hqCityId.toString() === cityId);
    if (cityCompanies.length === 0) continue;
    indexes.push({
      name: `${city.name} Index`,
      ticker: city.name.slice(0, 4).toUpperCase(),
      type: 'city',
      filterKey: cityId,
      value: INITIAL_VALUE,
      previousValue: INITIAL_VALUE,
      constituents: cityCompanies.map((c) => c._id),
      constituentCount: cityCompanies.length,
      sharesOutstanding: 5000000,
      performance: [],
      active: true,
    });
  }

  if (indexes.length > 0) {
    await StockIndex.insertMany(indexes);
    console.log(`[INDEX] Initialized ${indexes.length} indexes`);
  }
}

export async function simulateIndexes(currentTick) {
  const indexCount = await StockIndex.countDocuments();
  if (indexCount === 0) {
    await initializeIndexes();
  }

  const indexes = await StockIndex.find({ active: true });
  if (indexes.length === 0) return [];

  const results = [];

  for (const idx of indexes) {
    const companyIds = idx.constituents;
    if (!companyIds || companyIds.length === 0) {
      results.push({ indexId: idx._id, ticker: idx.ticker, name: idx.name, value: idx.value, change: 0 });
      continue;
    }

    const companies = await Company.find({ _id: { $in: companyIds }, active: true }).select(
      'sharePrice previousSharePrice marketCap',
    );

    if (companies.length === 0) {
      idx.constituentCount = 0;
      idx.dayChange = 0;
      idx.dayChangePercent = 0;
      await idx.save();
      results.push({ indexId: idx._id, ticker: idx.ticker, name: idx.name, value: idx.value, change: 0 });
      continue;
    }

    let weightedChange = 0;
    let totalWeight = 0;
    for (const c of companies) {
      const prevPrice = c.previousSharePrice || c.sharePrice;
      if (prevPrice <= 0) continue;
      const change = c.sharePrice / prevPrice;
      const weight = c.marketCap || c.sharePrice * 100000;
      weightedChange += change * weight;
      totalWeight += weight;
    }

    const marketCapChange = totalWeight > 0 ? weightedChange / totalWeight : 1;
    const noise = 1 + (Math.random() - 0.5) * 0.002;
    const newValue = Math.max(100, idx.value * marketCapChange * noise);

    idx.previousValue = idx.value;
    idx.value = Math.round(newValue * 100) / 100;
    idx.constituentCount = companies.length;
    idx.dayChange = Math.round((idx.value - idx.previousValue) * 100) / 100;
    idx.dayChangePercent = Math.round(((idx.value - idx.previousValue) / idx.previousValue) * 10000) / 100;
    idx.totalReturn = idx.dayChangePercent;

    if (idx.value > (idx.high52Week || 0)) idx.high52Week = idx.value;
    if (idx.value < (idx.low52Week || Infinity) || idx.low52Week === 0) idx.low52Week = idx.value;

    if (!idx.performance) idx.performance = [];
    idx.performance.push({
      tick: currentTick,
      value: idx.value,
      constituents: companies.length,
    });
    if (idx.performance.length > HISTORY_MAX) {
      idx.performance = idx.performance.slice(-HISTORY_MAX);
    }

    idx.marketCap = Math.round(idx.value * idx.sharesOutstanding);

    await idx.save();

    results.push({
      indexId: idx._id,
      ticker: idx.ticker,
      name: idx.name,
      value: idx.value,
      change: idx.dayChange,
      changePercent: idx.dayChangePercent,
    });
  }

  return results;
}
