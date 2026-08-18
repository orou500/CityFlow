import City from '../models/City.js';
import Company from '../models/Company.js';
import StockHolding from '../models/StockHolding.js';
import StockMarketEvent from '../models/StockMarketEvent.js';
import {
  INDUSTRIES,
  COMPANY_SIZES,
  COMPANY_NAME_PARTS,
  STOCK_MARKET_CONFIG as CONFIG,
  DIVIDEND_CONFIG as DIVIDENDS,
  COMPANY_EVENTS,
} from '../config/stockMarket.js';
import { publish, CHANNELS } from '../utils/pubsub.js';
import { bulkCreateNotifications } from '../utils/notificationQueue.js';

const HOLDINGS_BATCH_SIZE = 500;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCompanyName(industry) {
  const parts = COMPANY_NAME_PARTS[industry];
  return `${pickRandom(parts.prefixes)} ${pickRandom(parts.suffixes)}`;
}

function generateTicker(name) {
  const words = name.split(' ');
  if (words.length >= 2) {
    return (words[0].slice(0, 2) + words[1].slice(0, 2)).toUpperCase();
  }
  return name.slice(0, 4).toUpperCase();
}

function pickCompanySize(revenue) {
  const sizes = Object.entries(COMPANY_SIZES);
  for (const [key, val] of sizes) {
    if (revenue >= val.revenue[0] && revenue <= val.revenue[1]) return key;
  }
  return 'small';
}

function calculateMarketCap(sharePrice, sharesOutstanding) {
  return Math.round(sharePrice * sharesOutstanding);
}

async function initializeCompanies() {
  const existingCount = await Company.countDocuments();
  if (existingCount > 0) return;

  const cities = await City.find();
  if (cities.length === 0) return;

  const industryKeys = Object.keys(INDUSTRIES);
  const companies = [];

  for (const city of cities) {
    const numCompanies = Math.min(
      CONFIG.initialCompaniesPerCity,
      Math.ceil(Math.random() * CONFIG.initialCompaniesPerCity),
    );
    for (let i = 0; i < numCompanies; i++) {
      const industry = pickRandom(industryKeys);
      const industryData = INDUSTRIES[industry];
      const sizeRoll = Math.random();
      let size;
      if (sizeRoll < 0.3) size = 'startup';
      else if (sizeRoll < 0.55) size = 'small';
      else if (sizeRoll < 0.75) size = 'medium';
      else if (sizeRoll < 0.9) size = 'large';
      else size = 'corporation';

      const sizeData = COMPANY_SIZES[size];
      const employees = Math.round(rand(sizeData.employees[0], sizeData.employees[1]));
      const revenue = Math.round(rand(sizeData.revenue[0], sizeData.revenue[1]));
      const sharePrice = rand(sizeData.sharePrice[0], sizeData.sharePrice[1]);
      const sharesOutstanding = Math.round(rand(CONFIG.sharesPerCompany.min, CONFIG.sharesPerCompany.max));
      const cash = Math.round(revenue * DIVIDENDS.baseInitialCashRatio);
      const debt = Math.round(revenue * DIVIDENDS.initialDebtRatio);

      const name = generateCompanyName(industry);
      let ticker = generateTicker(name);
      let suffix = 1;
      while (companies.some((c) => c.ticker === ticker) || (await Company.findOne({ ticker }))) {
        ticker = generateTicker(name) + suffix;
        suffix++;
      }

      companies.push({
        name,
        ticker,
        industry,
        size,
        revenue,
        employees,
        cash,
        debt,
        profit: 0,
        hqCityId: city._id,
        offices: [{ cityId: city._id, type: 'headquarters', employees: Math.round(employees * 0.4), openedTick: 0 }],
        sharePrice: Math.round(sharePrice * 100) / 100,
        previousSharePrice: Math.round(sharePrice * 100) / 100,
        marketCap: calculateMarketCap(sharePrice, sharesOutstanding),
        sharesOutstanding,
        volatility: industryData.volatility * rand(0.7, 1.3),
        performance: [],
        expansionHistory: [],
        active: true,
        foundedTick: 0,
        description: `${name} is a ${sizeData.label.toLowerCase()} ${industryData.label.toLowerCase()} company headquartered in ${city.name}.`,
        totalReturn: 0,
        dayChange: 0,
        dayChangePercent: 0,
        high52Week: sharePrice,
        low52Week: sharePrice,
      });
    }
  }

  if (companies.length > 0) {
    await Company.insertMany(companies);
    console.log(`[STOCK] Initialized ${companies.length} companies`);
  }
}

function calculateCompanyGrowth(company, cityEconCondition) {
  const industry = INDUSTRIES[company.industry];
  const baseGrowth = industry.baseGrowthRate;

  const econMultipliers = {
    boom: 1.5,
    growth: 1.2,
    stable: 1.0,
    slowdown: 0.8,
    recession: 0.5,
  };
  const econMult = econMultipliers[cityEconCondition] || 1.0;

  const sizeMultipliers = {
    startup: 1.4,
    small: 1.2,
    medium: 1.0,
    large: 0.8,
    corporation: 0.6,
  };
  const sizeMult = sizeMultipliers[company.size] || 1.0;

  return baseGrowth * econMult * sizeMult;
}

function simulateStockPrice(company, growthRate) {
  const vol = company.volatility;

  const drift = growthRate * 0.5;
  const shock = (Math.random() * 2 - 1) * vol;
  const priceChange = drift + shock;

  const newPrice = clamp(company.sharePrice * (1 + priceChange), CONFIG.minSharePrice, CONFIG.maxSharePrice);

  return Math.round(newPrice * 100) / 100;
}

function pickCompanyEvent() {
  if (Math.random() > CONFIG.eventChancePerTick) return null;

  const r = Math.random();
  let cumulative = 0;

  const events = [
    { type: 'expansion', chance: CONFIG.expansionChance },
    { type: 'growth', chance: CONFIG.growthChance },
    { type: 'layoff', chance: CONFIG.layoffChance },
    { type: 'relocation', chance: CONFIG.relocationChance },
    { type: 'bankruptcy', chance: CONFIG.bankruptcyChance },
  ];

  for (const evt of events) {
    cumulative += evt.chance;
    if (r <= cumulative) return evt.type;
  }
  return null;
}

async function processCompanyEvent(company, eventType, currentTick) {
  const eventConfig = COMPANY_EVENTS[eventType];
  if (!eventConfig) return null;

  const cities = await City.find();
  const cityUpdates = {};
  let description = '';

  switch (eventType) {
    case 'expansion': {
      const availableCities = cities.filter(
        (c) => !company.offices.some((o) => o.cityId.toString() === c._id.toString()),
      );
      if (availableCities.length === 0) return null;

      const targetCity = pickRandom(availableCities);
      const newEmployees = Math.round(
        company.employees * rand(eventConfig.employeeGrowth[0], eventConfig.employeeGrowth[1]),
      );
      const revenueGrowth = rand(eventConfig.revenueGrowth[0], eventConfig.revenueGrowth[1]);
      const priceImpact = rand(eventConfig.priceImpact[0], eventConfig.priceImpact[1]);

      company.employees += newEmployees;
      company.revenue = Math.round(company.revenue * (1 + revenueGrowth));
      company.offices.push({
        cityId: targetCity._id,
        type: pickRandom(['office', 'factory', 'warehouse']),
        employees: newEmployees,
        openedTick: currentTick,
      });

      const newPrice = clamp(company.sharePrice * (1 + priceImpact), CONFIG.minSharePrice, CONFIG.maxSharePrice);
      company.previousSharePrice = company.sharePrice;
      company.sharePrice = Math.round(newPrice * 100) / 100;

      company.expansionHistory.push({
        tick: currentTick,
        type: 'expansion',
        cityId: targetCity._id,
        description: `Opened new office in ${targetCity.name}`,
      });

      cityUpdates[targetCity._id] = {
        demandDelta: eventConfig.cityDemandBoost,
        populationDelta: eventConfig.cityPopulationBoost,
      };
      description = `${company.name} opened a new office in ${targetCity.name}`;
      break;
    }

    case 'relocation': {
      if (company.offices.length <= 1) return null;

      const hqOffice = company.offices.find((o) => o.type === 'headquarters');
      if (!hqOffice) return null;

      const availableCities = cities.filter(
        (c) =>
          c._id.toString() !== hqOffice.cityId.toString() &&
          !company.offices.some((o) => o.cityId.toString() === c._id.toString()),
      );
      if (availableCities.length === 0) return null;

      const sourceCity = cities.find((c) => c._id.toString() === hqOffice.cityId.toString());
      const destCity = pickRandom(availableCities);

      const employeeLoss = Math.round(
        company.employees * rand(eventConfig.employeeLoss[0], eventConfig.employeeLoss[1]),
      );
      const revenueLoss = rand(eventConfig.revenueLoss[0], eventConfig.revenueLoss[1]);
      const priceImpact = rand(eventConfig.priceImpact[0], eventConfig.priceImpact[1]);

      company.employees = Math.max(10, company.employees - employeeLoss);
      company.revenue = Math.round(company.revenue * (1 - revenueLoss));
      hqOffice.cityId = destCity._id;
      hqOffice.employees = Math.round(company.employees * 0.4);

      const newPrice = clamp(company.sharePrice * (1 + priceImpact), CONFIG.minSharePrice, CONFIG.maxSharePrice);
      company.previousSharePrice = company.sharePrice;
      company.sharePrice = Math.round(newPrice * 100) / 100;

      company.expansionHistory.push({
        tick: currentTick,
        type: 'relocation',
        cityId: destCity._id,
        description: `Relocated headquarters from ${sourceCity?.name || 'unknown'} to ${destCity.name}`,
      });

      if (sourceCity) {
        cityUpdates[sourceCity._id] = {
          demandDelta: eventConfig.sourceCityDemandDrop,
          populationDelta: eventConfig.sourcePopulationDrop,
        };
      }
      cityUpdates[destCity._id] = {
        demandDelta: eventConfig.destCityDemandBoost,
        populationDelta: eventConfig.destPopulationBoost,
      };
      description = `${company.name} relocated from ${sourceCity?.name || 'unknown'} to ${destCity.name}`;
      break;
    }

    case 'layoff': {
      const employeeLoss = Math.round(
        company.employees * rand(eventConfig.employeeLoss[0], eventConfig.employeeLoss[1]),
      );
      const revenueLoss = rand(eventConfig.revenueLoss[0], eventConfig.revenueLoss[1]);
      const priceImpact = rand(eventConfig.priceImpact[0], eventConfig.priceImpact[1]);

      company.employees = Math.max(10, company.employees - employeeLoss);
      company.revenue = Math.round(company.revenue * (1 - revenueLoss));

      for (const office of company.offices) {
        const officeLoss = Math.round(office.employees * rand(0.05, 0.2));
        office.employees = Math.max(1, office.employees - officeLoss);
      }

      const newPrice = clamp(company.sharePrice * (1 + priceImpact), CONFIG.minSharePrice, CONFIG.maxSharePrice);
      company.previousSharePrice = company.sharePrice;
      company.sharePrice = Math.round(newPrice * 100) / 100;

      const hqCity = cities.find((c) => c._id.toString() === company.hqCityId.toString());
      if (hqCity) {
        cityUpdates[hqCity._id] = {
          demandDelta: eventConfig.cityDemandDrop,
          populationDelta: 0,
        };
      }
      description = `${company.name} laid off ${employeeLoss.toLocaleString()} employees`;
      break;
    }

    case 'growth': {
      const employeeGrowth = Math.round(
        company.employees * rand(eventConfig.employeeGrowth[0], eventConfig.employeeGrowth[1]),
      );
      const revenueGrowth = rand(eventConfig.revenueGrowth[0], eventConfig.revenueGrowth[1]);
      const priceImpact = rand(eventConfig.priceImpact[0], eventConfig.priceImpact[1]);

      company.employees += employeeGrowth;
      company.revenue = Math.round(company.revenue * (1 + revenueGrowth));

      for (const office of company.offices) {
        const officeGrowth = Math.round(office.employees * rand(0.02, 0.1));
        office.employees += officeGrowth;
      }

      const newPrice = clamp(company.sharePrice * (1 + priceImpact), CONFIG.minSharePrice, CONFIG.maxSharePrice);
      company.previousSharePrice = company.sharePrice;
      company.sharePrice = Math.round(newPrice * 100) / 100;

      const hqCity = cities.find((c) => c._id.toString() === company.hqCityId.toString());
      if (hqCity) {
        cityUpdates[hqCity._id] = {
          demandDelta: eventConfig.cityDemandBoost,
          populationDelta: Math.round(employeeGrowth * 1.5),
        };
      }
      description = `${company.name} grew by ${employeeGrowth.toLocaleString()} employees`;
      break;
    }

    case 'bankruptcy': {
      company.employees = 0;
      company.revenue = 0;
      company.active = false;
      company.previousSharePrice = company.sharePrice;
      company.sharePrice = CONFIG.minSharePrice;

      const hqCity = cities.find((c) => c._id.toString() === company.hqCityId.toString());
      if (hqCity) {
        cityUpdates[hqCity._id] = {
          demandDelta: eventConfig.cityDemandDrop,
          populationDelta: eventConfig.cityPopulationDrop,
        };
      }
      description = `${company.name} has gone bankrupt`;
      break;
    }
  }

  company.size = pickCompanySize(company.revenue);
  company.marketCap = calculateMarketCap(company.sharePrice, company.sharesOutstanding);

  return { description, cityUpdates };
}

async function applyCityUpdates(cityUpdates) {
  const bulkOps = [];
  for (const [cityId, updates] of Object.entries(cityUpdates)) {
    const setOps = {};
    if (updates.demandDelta) {
      setOps.$inc = { demandIndex: updates.demandDelta };
    }
    if (updates.populationDelta) {
      setOps.$inc = {
        ...(setOps.$inc || {}),
        population: updates.populationDelta,
      };
    }
    if (Object.keys(setOps).length > 0) {
      bulkOps.push({ updateOne: { filter: { _id: cityId }, update: setOps } });
    }
  }
  if (bulkOps.length > 0) {
    await City.bulkWrite(bulkOps);
  }
}

/**
 * Simulate a company's financial performance for this tick.
 *
 * Profit is derived from revenue using a size-based margin plus noise.
 * Occasionally a company has a loss-making quarter, which erodes cash.
 * Cash only ever grows from retained profit, so dividends can never
 * create money out of thin air.
 */
export function updateCompanyFinances(company) {
  const margin = DIVIDENDS.profitMarginBySize[company.size] || 0.06;
  const noise = rand(-DIVIDENDS.profitNoise, DIVIDENDS.profitNoise);
  let profit = Math.round(company.revenue * margin * (1 + noise));

  if (Math.random() < DIVIDENDS.lossQuarterChance) {
    const lossRate = rand(DIVIDENDS.lossRateRange[0], DIVIDENDS.lossRateRange[1]);
    profit = -Math.round(company.revenue * lossRate);
  }

  company.profit = profit;
  company.cash = Math.max(0, Math.round((company.cash || 0) + profit));
}

export function isDividendEligible(company, currentTick) {
  if (!DIVIDENDS.enabled) return false;
  if (currentTick - (company.lastDividendTick || 0) < DIVIDENDS.minIntervalTicks) return false;
  if ((company.cash || 0) < DIVIDENDS.minCashToPay) return false;
  if ((company.profit || 0) < DIVIDENDS.minProfitToPay) return false;

  // Balanced against debt: debt must stay below the configured ratio of capital
  const totalCapital = (company.cash || 0) + (company.debt || 0);
  if (totalCapital > 0 && (company.debt || 0) / totalCapital >= DIVIDENDS.maxDebtRatio) return false;

  return true;
}

function rollDividendType() {
  const r = Math.random();
  if (r < DIVIDENDS.exceptionalChancePerTick) return 'exceptional';
  if (r < DIVIDENDS.exceptionalChancePerTick + DIVIDENDS.regularChancePerTick) return 'regular';
  return null;
}

/**
 * Pay a dividend to all current shareholders. Payout is deducted from the
 * company's cash and each holder receives `perShare * shares` exactly once
 * (accrued on their StockHolding as unclaimedDividends).
 */
export async function distributeDividend(company, type, tickNumber) {
  const sharesOutstanding = company.sharesOutstanding || 1;
  const payoutRatio =
    DIVIDENDS.payoutRatioOfProfit * (type === 'exceptional' ? DIVIDENDS.exceptionalPayoutMultiplier : 1);
  const dividendPool = Math.min(
    Math.floor((company.profit || 0) * payoutRatio),
    Math.floor((company.cash || 0) * DIVIDENDS.maxPayoutRatioOfCash),
  );
  if (dividendPool <= 0) return null;

  let perShare = Math.min(Math.round((dividendPool / sharesOutstanding) * 100) / 100, DIVIDENDS.maxDividendPerShare);
  if (perShare <= 0) return null;

  // Never pay out more cash than the company holds
  const maxAffordablePerShare = Math.floor(((company.cash || 0) / sharesOutstanding) * 100) / 100;
  if (perShare > maxAffordablePerShare) {
    perShare = maxAffordablePerShare;
    if (perShare <= 0) return null;
  }

  let actualDistributed = 0;
  let holdersPaid = 0;
  let skip = 0;
  while (true) {
    const holdings = await StockHolding.find({ companyId: company._id, shares: { $gt: 0 } })
      .skip(skip)
      .limit(HOLDINGS_BATCH_SIZE)
      .lean();
    if (holdings.length === 0) break;
    const bulkOps = [];
    const notificationItems = [];
    for (const h of holdings) {
      const amount = Math.round(perShare * h.shares * 100) / 100;
      actualDistributed += amount;
      bulkOps.push({
        updateOne: {
          filter: { _id: h._id },
          update: { $inc: { unclaimedDividends: amount } },
        },
      });
      if (amount > 0) {
        // One notification per (user, company, dividend tick) — the DB-level
        // unique (userId, eventKey) index makes re-runs idempotent, and the
        // companyId in the key keeps multiple payers in the same tick as
        // separate notifications. Claiming the dividend later never re-fires.
        notificationItems.push({
          userId: h.userId,
          type: 'dividend',
          title: `Dividend received from ${company.name}`,
          message: `You received a $${amount.toLocaleString()} dividend from ${company.name}.`,
          eventKey: `dividend:${company._id}:${tickNumber}:${h.userId}`,
          route: `/company/${company._id}`,
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          amount,
          companyName: company.name,
          global: false,
        });
      }
    }
    await StockHolding.bulkWrite(bulkOps);
    if (notificationItems.length > 0) {
      await bulkCreateNotifications(notificationItems);
    }
    holdersPaid += holdings.length;
    skip += HOLDINGS_BATCH_SIZE;
  }
  actualDistributed = Math.round(actualDistributed * 100) / 100;
  if (actualDistributed <= 0) return null;

  const yieldPct =
    company.sharePrice > 0
      ? Math.round(((perShare * DIVIDENDS.yieldAnnualizedTicks) / company.sharePrice) * 10000) / 100
      : 0;

  company.cash = Math.max(0, Math.round((company.cash || 0) - actualDistributed));
  company.dividendPerShare = perShare;
  company.lastDividendPerShare = perShare;
  company.lastDividendTick = tickNumber;
  company.dividendYield = yieldPct;
  company.totalDividendsPaid = (company.totalDividendsPaid || 0) + actualDistributed;
  if (!company.dividendHistory) company.dividendHistory = [];
  company.dividendHistory.push({ tick: tickNumber, perShare, total: actualDistributed, yield: yieldPct, type });
  if (company.dividendHistory.length > DIVIDENDS.historyMaxEntries) {
    company.dividendHistory = company.dividendHistory.slice(-DIVIDENDS.historyMaxEntries);
  }

  const headline =
    type === 'exceptional'
      ? `${company.ticker} had an exceptional quarter and announced a $${perShare.toFixed(2)} per share dividend`
      : `${company.ticker} paid $${perShare.toFixed(2)} per share dividend`;

  try {
    await StockMarketEvent.create({
      companyId: company._id,
      tick: tickNumber,
      type: 'dividend_paid',
      severity: 'positive',
      headline,
      description: `${company.name} distributed $${actualDistributed.toLocaleString()} in dividends to ${holdersPaid} shareholder(s).`,
      metadata: { perShare, totalPool: actualDistributed, holders: holdersPaid, dividendType: type },
    });
  } catch (err) {
    console.error(`[STOCK] Error saving dividend event for ${company.ticker}:`, err.message);
  }

  publish(CHANNELS.PUBLIC_COMPANY_DIVIDENDS, {
    tick: tickNumber,
    dividends: [{ companyId: company._id, ticker: company.ticker, perShare, holdersInBatch: holdersPaid }],
  }).catch(() => {});

  return { perShare, total: actualDistributed, yield: yieldPct, holders: holdersPaid, type };
}

export async function simulateStockMarket(currentTick) {
  const companyCount = await Company.countDocuments();
  if (companyCount === 0) {
    await initializeCompanies();
  }

  const companies = await Company.find({ active: true, isIPO: { $ne: true } });
  if (companies.length === 0) return [];

  const cities = await City.find();
  const cityMap = new Map(cities.map((c) => [c._id.toString(), c]));

  const results = [];
  const allCityUpdates = {};

  for (const company of companies) {
    const city = cityMap.get(company.hqCityId.toString());
    const cityEcon = city?.economicCondition || 'stable';

    const growthRate = calculateCompanyGrowth(company, cityEcon);
    const newPrice = simulateStockPrice(company, growthRate);

    company.previousSharePrice = company.sharePrice;
    company.sharePrice = newPrice;
    company.marketCap = calculateMarketCap(newPrice, company.sharesOutstanding);
    company.dayChange = Math.round((newPrice - company.previousSharePrice) * 100) / 100;
    company.dayChangePercent =
      Math.round(((newPrice - company.previousSharePrice) / company.previousSharePrice) * 10000) / 100;
    company.totalReturn = Math.round(((newPrice - CONFIG.minSharePrice) / CONFIG.minSharePrice) * 10000) / 100;

    if (newPrice > (company.high52Week || 0)) company.high52Week = newPrice;
    if (newPrice < (company.low52Week || Infinity) || company.low52Week === 0) company.low52Week = newPrice;

    const companySize = pickCompanySize(company.revenue);
    if (companySize !== company.size) company.size = companySize;

    if (!company.performance) company.performance = [];
    company.performance.push({
      tick: currentTick,
      price: newPrice,
      employees: company.employees,
      revenue: company.revenue,
      marketCap: company.marketCap,
    });
    if (company.performance.length > CONFIG.historyMaxEntries) {
      company.performance = company.performance.slice(-CONFIG.historyMaxEntries);
    }

    let eventResult = null;
    const eventType = pickCompanyEvent();
    if (eventType) {
      eventResult = await processCompanyEvent(company, eventType, currentTick);
      if (eventResult) {
        for (const [cityId, updates] of Object.entries(eventResult.cityUpdates)) {
          allCityUpdates[cityId] = allCityUpdates[cityId] || { demandDelta: 0, populationDelta: 0 };
          allCityUpdates[cityId].demandDelta += updates.demandDelta || 0;
          allCityUpdates[cityId].populationDelta += updates.populationDelta || 0;
        }
      }
    }

    updateCompanyFinances(company);
    company.lastProfitTick = currentTick;

    let dividendResult = null;
    if (isDividendEligible(company, currentTick)) {
      const dividendType = rollDividendType();
      if (dividendType) {
        dividendResult = await distributeDividend(company, dividendType, currentTick);
      }
    }

    await company.save();

    results.push({
      companyId: company._id,
      ticker: company.ticker,
      name: company.name,
      price: company.sharePrice,
      change: company.dayChange,
      changePercent: company.dayChangePercent,
      event: eventResult?.description || null,
      dividend: dividendResult,
    });
  }

  await applyCityUpdates(allCityUpdates);

  return results;
}
