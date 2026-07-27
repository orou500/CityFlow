import MarketReport from '../models/MarketReport.js';
import City from '../models/City.js';
import District from '../models/District.js';
import { REPORT_TYPES } from '../config/marketIntelligence.js';
import { ECONOMIC_CONDITIONS, DEMOGRAPHICS_CONFIG } from '../config/demographics.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addNoise(value, tierAccuracy) {
  const noiseFactor = (1 - tierAccuracy) * 0.5;
  return value * (1 + (Math.random() * 2 - 1) * noiseFactor);
}

function computeEconomicProbabilities(currentCondition) {
  const transitions = DEMOGRAPHICS_CONFIG.economicTransitions;
  const matrix = transitions[currentCondition];
  if (!matrix) {
    return { boom: 0.05, growth: 0.2, stable: 0.4, slowdown: 0.25, recession: 0.1 };
  }
  return {
    boom: matrix.boom || 0,
    growth: matrix.growth || 0,
    stable: matrix.stable || 0,
    slowdown: matrix.slowdown || 0,
    recession: matrix.recession || 0,
  };
}

export async function generatePriceForecastReport(cityId, tier) {
  const city = await City.findById(cityId);
  if (!city) throw new Error('City not found');

  const reportConfig = REPORT_TYPES.price_forecast;
  const accuracy = reportConfig.accuracy[tier];

  const econProbs = computeEconomicProbabilities(city.economicCondition);

  const boomMod = ECONOMIC_CONDITIONS.boom?.priceModifier || 1.1;
  const recessionMod = ECONOMIC_CONDITIONS.recession?.priceModifier || 0.88;
  const baseMod = ECONOMIC_CONDITIONS[city.economicCondition]?.priceModifier || 1.0;
  const demandPressure = (city.demandIndex - 1.0) * 0.08;
  const supplyPressure = (1.0 - city.supplyIndex) * 0.04;

  const mostLikelyChange = addNoise(baseMod - 1.0 + demandPressure + supplyPressure + city.growthRate * 0.5, accuracy);
  const bestCaseChange = addNoise(boomMod - 1.0 + Math.abs(demandPressure) + 0.03, accuracy);
  const worstCaseChange = addNoise(recessionMod - 1.0 - Math.abs(supplyPressure) - 0.02, accuracy);

  const rangeWidth = (1 - accuracy) * 0.1;

  return {
    scope: 'city',
    scopeName: city.name,
    snapshot: {
      currentPrice: city.avgPrice,
      avgPrice: city.avgPrice,
      avgRent: city.avgRent,
      demandIndex: Math.round(city.demandIndex * 100) / 100,
      supplyIndex: Math.round(city.supplyIndex * 100) / 100,
      growthRate: Math.round(city.growthRate * 10000) / 100,
      economicCondition: city.economicCondition,
    },
    forecast: {
      mostLikely: {
        change: Math.round(mostLikelyChange * 100 * 10) / 10,
        newPrice: Math.round(city.avgPrice * (1 + mostLikelyChange)),
      },
      bestCase: {
        change: Math.round(bestCaseChange * 100 * 10) / 10,
        newPrice: Math.round(city.avgPrice * (1 + bestCaseChange)),
      },
      worstCase: {
        change: Math.round(worstCaseChange * 100 * 10) / 10,
        newPrice: Math.round(city.avgPrice * (1 + worstCaseChange)),
      },
      priceToRentRatio: {
        current: city.avgRent > 0 ? Math.round((city.avgPrice / (city.avgRent * 12)) * 10) / 10 : null,
        projected:
          city.avgRent > 0
            ? Math.round(((city.avgPrice * (1 + mostLikelyChange)) / (city.avgRent * 12)) * 10) / 10
            : null,
      },
      confidenceInterval: `${Math.round((mostLikelyChange - rangeWidth) * 100)}% to ${Math.round((mostLikelyChange + rangeWidth) * 100)}%`,
    },
    economicProbability: {
      boom: Math.round(econProbs.boom * 100),
      growth: Math.round(econProbs.growth * 100),
      stable: Math.round(econProbs.stable * 100),
      slowdown: Math.round(econProbs.slowdown * 100),
      recession: Math.round(econProbs.recession * 100),
    },
  };
}

export async function generateRiskAssessmentReport(cityId, tier) {
  const city = await City.findById(cityId);
  if (!city) throw new Error('City not found');

  const reportConfig = REPORT_TYPES.risk_assessment;
  const accuracy = reportConfig.accuracy[tier];

  const factors = [];
  let riskScore = 20;

  const hazardRisk = city.hazardRisk || {};
  const maxHazard = Math.max(
    hazardRisk.hurricane || 0,
    hazardRisk.flood || 0,
    hazardRisk.earthquake || 0,
    hazardRisk.wildfire || 0,
    hazardRisk.storm || 0,
  );

  if (maxHazard > 50) {
    factors.push({ name: 'Hazard Exposure', level: 'high', contribution: maxHazard * 0.3 });
    riskScore += maxHazard * 0.3;
  } else if (maxHazard > 20) {
    factors.push({ name: 'Hazard Exposure', level: 'moderate', contribution: maxHazard * 0.2 });
    riskScore += maxHazard * 0.2;
  } else {
    factors.push({ name: 'Hazard Exposure', level: 'low', contribution: maxHazard * 0.1 });
    riskScore += maxHazard * 0.1;
  }

  if (city.economicCondition === 'recession') {
    factors.push({ name: 'Economic Risk', level: 'high', contribution: 15 });
    riskScore += 15;
  } else if (city.economicCondition === 'slowdown') {
    factors.push({ name: 'Economic Risk', level: 'moderate', contribution: 8 });
    riskScore += 8;
  } else if (city.economicCondition === 'boom') {
    factors.push({ name: 'Economic Risk', level: 'low', contribution: -5 });
    riskScore -= 5;
  } else {
    factors.push({ name: 'Economic Risk', level: 'low', contribution: 0 });
  }

  if (city.demandIndex < 0.5) {
    factors.push({ name: 'Demand Risk', level: 'high', contribution: 15 });
    riskScore += 15;
  } else if (city.demandIndex < 0.8) {
    factors.push({ name: 'Demand Risk', level: 'moderate', contribution: 8 });
    riskScore += 8;
  } else {
    factors.push({ name: 'Demand Risk', level: 'low', contribution: 0 });
  }

  if (city.growthRate < 0) {
    factors.push({ name: 'Growth Risk', level: 'high', contribution: 10 });
    riskScore += 10;
  } else if (city.growthRate < 0.005) {
    factors.push({ name: 'Growth Risk', level: 'moderate', contribution: 5 });
    riskScore += 5;
  } else {
    factors.push({ name: 'Growth Risk', level: 'low', contribution: 0 });
  }

  riskScore = clamp(Math.round(addNoise(riskScore, accuracy)), 0, 100);

  let overallLevel;
  if (riskScore <= 20) overallLevel = 'very_low';
  else if (riskScore <= 40) overallLevel = 'low';
  else if (riskScore <= 60) overallLevel = 'moderate';
  else if (riskScore <= 80) overallLevel = 'high';
  else overallLevel = 'very_high';

  const econModifier = city.economicCondition === 'recession' ? 1.5 : city.economicCondition === 'boom' ? 0.7 : 1.0;
  const baseHazards = [
    { type: 'hurricane', base: 0.03 },
    { type: 'flood', base: 0.04 },
    { type: 'earthquake', base: 0.02 },
    { type: 'wildfire', base: 0.03 },
    { type: 'storm', base: 0.05 },
  ];
  const hazardProbabilities = baseHazards.map((h) => {
    const prob = clamp(addNoise(h.base * econModifier, accuracy) * 100, 0, 15);
    return { type: h.type, probability4Ticks: Math.round(prob * 10) / 10 };
  });

  const tips = [];
  if (city.demandIndex < 0.8) tips.push('Low demand may lead to price declines — consider diversifying');
  if (city.growthRate < 0) tips.push('Negative growth trend — monitor for further deterioration');
  if (city.economicCondition === 'recession') tips.push('Recession conditions increase risk across all property types');
  if (city.supplyIndex > 1.5) tips.push('Oversupply may suppress prices — be cautious with new purchases');
  if (maxHazard > 30) tips.push('High hazard exposure — ensure adequate risk mitigation');
  if (tips.length === 0) tips.push('Market conditions are generally favorable for investment');

  return {
    scope: 'city',
    scopeName: city.name,
    overall: {
      level: overallLevel,
      score: riskScore,
    },
    factors: factors.map((f) => ({
      ...f,
      contribution: Math.round(f.contribution * 10) / 10,
    })),
    hazardProbabilities,
    expectedVolatility: Math.round(clamp(riskScore * 0.25, 5, 25) * 10) / 10,
    mitigationTips: tips,
  };
}

export async function generateGrowthOpportunitiesReport(tier) {
  const reportConfig = REPORT_TYPES.growth_opportunities;
  const accuracy = reportConfig.accuracy[tier];
  const maxResults = reportConfig.maxResults[tier];

  const cities = await City.find().sort({ demandIndex: -1 });
  const districts = await District.find().populate('cityId', 'name country').sort({ demandIndex: -1 });

  const emergingCities = cities
    .filter((c) => c.demandIndex > 1.0 && c.growthRate > 0.005)
    .sort((a, b) => {
      const scoreA = (a.demandIndex - 1) * 2 + a.growthRate * 10 + (a.economicCondition === 'boom' ? 1 : 0);
      const scoreB = (b.demandIndex - 1) * 2 + b.growthRate * 10 + (b.economicCondition === 'boom' ? 1 : 0);
      return scoreB - scoreA;
    })
    .slice(0, maxResults)
    .map((c) => ({
      name: c.name,
      country: c.country,
      demandIndex: Math.round(addNoise(c.demandIndex, accuracy) * 100) / 100,
      growthRate: Math.round(addNoise(c.growthRate, accuracy) * 10000) / 100,
      avgPrice: c.avgPrice,
      reason:
        c.demandIndex > 1.5
          ? 'High demand growth'
          : c.growthRate > 0.015
            ? 'Rapidly growing market'
            : c.economicCondition === 'boom'
              ? 'Economic boom conditions'
              : 'Positive market fundamentals',
    }));

  const emergingDistricts = districts
    .filter((d) => d.demandIndex > 1.0 && d.supplyIndex < 1.2 && d.growthRate > 0.005)
    .sort((a, b) => {
      const scoreA = (a.demandIndex - 1) * 3 + (1 - a.supplyIndex) * 2 + a.growthRate * 10;
      const scoreB = (b.demandIndex - 1) * 3 + (1 - b.supplyIndex) * 2 + b.growthRate * 10;
      return scoreB - scoreA;
    })
    .slice(0, maxResults)
    .map((d) => ({
      name: d.name,
      cityName: d.cityId?.name || 'Unknown',
      demandIndex: Math.round(addNoise(d.demandIndex, accuracy) * 100) / 100,
      growthRate: Math.round(addNoise(d.growthRate, accuracy) * 10000) / 100,
      avgPrice: d.avgPrice,
      reason:
        d.supplyIndex < 0.7
          ? 'Severe undersupply'
          : d.demandIndex > 1.5
            ? 'Strong demand surge'
            : 'Supply-constrained growth',
    }));

  const undervaluedAreas = districts
    .filter((d) => d.basePrice > 0 && d.avgPrice < d.basePrice * 0.9)
    .sort((a, b) => a.avgPrice / a.basePrice - b.avgPrice / b.basePrice)
    .slice(0, maxResults)
    .map((d) => ({
      name: d.name,
      cityName: d.cityId?.name || 'Unknown',
      currentPrice: d.avgPrice,
      basePrice: d.basePrice,
      discountPercent: Math.round(((d.basePrice - d.avgPrice) / d.basePrice) * 100),
    }));

  const eventDrivenOpportunities = districts
    .filter((d) => d.activeEvents?.some((e) => e.type === 'positive'))
    .flatMap((d) =>
      d.activeEvents
        .filter((e) => e.type === 'positive')
        .map((e) => ({
          name: d.name,
          cityName: d.cityId?.name || 'Unknown',
          eventName: e.name,
          expectedImpact: e.effects?.demandDelta
            ? `+${Math.round(e.effects.demandDelta * 100)}% demand`
            : 'Positive event',
        })),
    )
    .slice(0, maxResults);

  const populationGrowthSignals = cities
    .filter((c) => c.population > 0)
    .sort((a, b) => {
      const netA = a.growthRate + (a.immigration || 0) / (a.population || 1);
      const netB = b.growthRate + (b.immigration || 0) / (b.population || 1);
      return netB - netA;
    })
    .slice(0, maxResults)
    .map((c) => ({
      name: c.name,
      growthRate: Math.round(c.growthRate * 10000) / 100,
      netMigration: (c.immigration || 0) - (c.emigration || 0),
      reason: (c.immigration || 0) > (c.emigration || 0) ? 'Net positive migration' : 'Above-average population growth',
    }));

  return {
    emergingCities: tier === 'basic' ? emergingCities.slice(0, 3) : emergingCities,
    emergingDistricts: tier === 'basic' ? emergingDistricts.slice(0, 3) : emergingDistricts,
    undervaluedAreas,
    eventDrivenOpportunities,
    populationGrowthSignals,
  };
}

export async function evaluateExpiredReports(currentTick) {
  const expired = await MarketReport.find({
    expiresAtTick: { $lte: currentTick },
    status: 'active',
  });

  if (expired.length === 0) return 0;

  const bulkOps = [];

  for (const report of expired) {
    let actualOutcome = null;
    let forecastAccuracy = null;

    if (report.reportType === 'price_forecast' && report.cityId) {
      const city = await City.findById(report.cityId);
      if (city) {
        const priceChange = report.data?.snapshot?.avgPrice
          ? ((city.avgPrice - report.data.snapshot.avgPrice) / report.data.snapshot.avgPrice) * 100
          : 0;
        actualOutcome = {
          avgPrice: city.avgPrice,
          priceChange: Math.round(priceChange * 10) / 10,
          economicCondition: city.economicCondition,
        };
        const predicted = report.data?.forecast?.mostLikely?.change || 0;
        forecastAccuracy = Math.max(0, 100 - Math.abs(predicted - priceChange));
      }
    } else if (report.reportType === 'risk_assessment' && report.cityId) {
      const city = await City.findById(report.cityId);
      if (city) {
        actualOutcome = {
          economicCondition: city.economicCondition,
          demandIndex: city.demandIndex,
          growthRate: city.growthRate,
        };
        const predictedLevel = report.data?.overall?.level;
        const actualRisk = city.demandIndex < 0.5 ? 'high' : city.demandIndex < 0.8 ? 'moderate' : 'low';
        forecastAccuracy =
          predictedLevel === actualRisk ? 90 : predictedLevel === 'moderate' || actualRisk === 'moderate' ? 65 : 40;
      }
    } else if (report.reportType === 'growth_opportunities') {
      forecastAccuracy = 60 + Math.random() * 20;
      actualOutcome = { evaluated: true };
    }

    if (forecastAccuracy !== null) {
      forecastAccuracy = Math.round(clamp(forecastAccuracy, 0, 100) * 10) / 10;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: report._id },
        update: {
          $set: {
            status: 'evaluated',
            forecastAccuracy,
            accuracyScore: forecastAccuracy,
            actualOutcome,
            evaluationTick: currentTick,
          },
        },
      },
    });
  }

  if (bulkOps.length > 0) {
    await MarketReport.bulkWrite(bulkOps);
  }

  return expired.length;
}

export async function generatePublicTrends(cityId) {
  const city = await City.findById(cityId);
  if (!city) throw new Error('City not found');

  const history = (city.demographicsHistory || []).slice(-12);

  function getDemandDirection(idx, hist) {
    if (hist.length < 3) return { direction: 'stable', magnitude: 0 };
    const recent = hist.slice(-6);
    const trend = (recent[recent.length - 1].demandIndex - recent[0].demandIndex) / recent.length;
    const magnitude = Math.abs(trend);
    if (trend > 0.03) return { direction: 'strong_up', magnitude };
    if (trend > 0.005) return { direction: 'up', magnitude };
    if (trend < -0.03) return { direction: 'strong_down', magnitude };
    if (trend < -0.005) return { direction: 'down', magnitude };
    return { direction: 'stable', magnitude };
  }

  function getSupplyStatus(idx) {
    if (idx < 0.7) return 'undersupply';
    if (idx > 1.3) return 'oversupply';
    return 'balanced';
  }

  function getGrowthDirection(hist) {
    if (hist.length < 3) return 'stable';
    const recent = hist.slice(-6);
    const trend = recent[recent.length - 1].growthRate - recent[0].growthRate;
    if (trend > 0.001) return 'accelerating';
    if (trend < -0.001) return 'decelerating';
    return 'stable';
  }

  const demandTrend = getDemandDirection(city.demandIndex, history);
  const supplyStatus = getSupplyStatus(city.supplyIndex);
  const growthDir = getGrowthDirection(history);

  let healthScore = 50;
  if (city.demandIndex > 1.2) healthScore += 15;
  else if (city.demandIndex < 0.7) healthScore -= 15;
  if (city.growthRate > 0.01) healthScore += 15;
  else if (city.growthRate < 0) healthScore -= 15;
  if (city.economicCondition === 'boom') healthScore += 10;
  else if (city.economicCondition === 'recession') healthScore -= 15;
  healthScore = clamp(healthScore, 0, 100);

  const healthLabel =
    healthScore >= 75 ? 'Strong' : healthScore >= 50 ? 'Healthy' : healthScore >= 25 ? 'Weak' : 'Critical';

  const activeEvents = (city.activeEvents || []).map((e) => ({
    name: e.name,
    type: e.type,
    remainingTicks: e.remainingTicks,
  }));

  return {
    city: { name: city.name, country: city.country },
    trend: {
      demandDirection: demandTrend.direction,
      supplyStatus,
      growthDirection: growthDir,
      economicCondition: city.economicCondition,
    },
    marketHealth: {
      score: healthScore,
      label: healthLabel,
    },
    activeEvents,
  };
}
