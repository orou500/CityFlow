import Property from '../models/Property.js';
import City from '../models/City.js';
import { getTickNumber } from '../models/GameState.js';
import { getRatingBonuses } from '../config/improvementProjects.js';
import { ECONOMIC_CONDITIONS } from '../config/demographics.js';

const UPGRADE_DEPRECIATION_RATE = 0.01;
const IMPROVEMENT_DEPRECIATION_RATE = 0.005;
const GRADE_VALUE_PER_LEVEL = 0.02;
const QUALITY_FLOOR = 0.7;
const QUALITY_CEILING = 1.15;

const INVESTMENT_CAPS = {
  land: 2.0,
  house: 3.0,
  apartment: 4.0,
  commercial: 5.0,
};

function calculateDepreciation(ticksElapsed, rate) {
  return Math.max(0.3, 1 - rate * (ticksElapsed / 100));
}

function calculateUpgradeValue(property, currentTick) {
  const upgrades = property.upgrades || [];
  if (upgrades.length === 0) return 0;

  let totalValue = 0;
  for (const upgrade of upgrades) {
    const ticksSince = currentTick - (upgrade.appliedAt || 0);
    const depreciation = calculateDepreciation(Math.max(0, ticksSince), UPGRADE_DEPRECIATION_RATE);
    const baseEffect = upgrade.effect?.valueBoost || 0;
    const costBasedValue = property.basePrice * baseEffect;
    totalValue += costBasedValue * depreciation;
  }

  return totalValue;
}

function calculateImprovementValue(property, currentTick) {
  const improvements = property.improvements || [];
  if (improvements.length === 0) return 0;

  let totalValue = 0;
  for (const improvement of improvements) {
    const ticksSince = currentTick - (improvement.completedAtTick || 0);
    const depreciation = calculateDepreciation(Math.max(0, ticksSince), IMPROVEMENT_DEPRECIATION_RATE);
    const valueBonus = improvement.valueBonus || 0;
    const costBasedValue = property.basePrice * valueBonus;
    totalValue += costBasedValue * depreciation;
  }

  return totalValue;
}

function calculateGradeValue(property) {
  const grade = property.grade || 1;
  return property.basePrice * GRADE_VALUE_PER_LEVEL * (grade - 1);
}

function calculateQualityMultiplier(qualityScore) {
  const quality = qualityScore || 70;
  if (quality <= 50) {
    return QUALITY_FLOOR + ((0.9 - QUALITY_FLOOR) * quality) / 50;
  }
  return 0.9 + ((QUALITY_CEILING - 0.9) * (quality - 50)) / 50;
}

function getInvestmentCap(propertyType) {
  return INVESTMENT_CAPS[propertyType] || INVESTMENT_CAPS.house;
}

function calculateCityFundamentalsMultiplier(city) {
  if (!city) return 1.0;
  const demand = city.demandIndex || 1.0;
  const supply = city.supplyIndex || 1.0;
  const growth = city.growthRate || 0;
  const econ = ECONOMIC_CONDITIONS[city.economicCondition] || ECONOMIC_CONDITIONS.stable;

  const demandMod = 1 + (demand - 1.0) * 0.3;
  const supplyMod = 1 / (1 + (supply - 1.0) * 0.15);
  const growthMod = 1 + growth * 0.8;
  const econMod = 0.7 + (econ.priceModifier || 1.0) * 0.3;

  return Math.max(0.5, Math.min(2.5, demandMod * supplyMod * growthMod * econMod));
}

export function calculateIntrinsicValue(property, currentTick, city) {
  if (property.type === 'land' && property.developmentLevel === 0) {
    return property.basePrice;
  }

  const baseValue = property.basePrice || property.currentPrice || 0;
  const upgradeValue = calculateUpgradeValue(property, currentTick);
  const improvementValue = calculateImprovementValue(property, currentTick);
  const gradeValue = calculateGradeValue(property);
  const qualityMultiplier = calculateQualityMultiplier(property.qualityScore);

  const rawIntrinsic = (baseValue + upgradeValue + improvementValue + gradeValue) * qualityMultiplier;

  const investmentHistory = property.investmentHistory || [];
  const totalInvested = investmentHistory.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const maxCap = getInvestmentCap(property.type);
  const investmentCap = baseValue * maxCap;
  const cappedInvestment = Math.min(totalInvested, investmentCap);
  const investmentRatio = totalInvested > 0 ? cappedInvestment / investmentCap : 0;

  const investmentValue = rawIntrinsic * investmentRatio * 0.15;

  const cityData = city || (property.cityId && typeof property.cityId === 'object' ? property.cityId : null);
  const cityMultiplier = calculateCityFundamentalsMultiplier(cityData);

  const intrinsicValue = Math.round((rawIntrinsic + investmentValue) * cityMultiplier);

  return Math.max(1, intrinsicValue);
}

export function getInvestmentFactors(property) {
  const investmentHistory = property.investmentHistory || [];
  const totalInvested = investmentHistory.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  if (totalInvested <= 0) {
    return {
      rentMultiplier: 1.0,
      occupancyBonus: 0,
      desirabilityBonus: 0,
      downturnResilience: 0,
      investmentRatio: 0,
    };
  }

  const basePrice = property.basePrice || 1;
  const maxCap = getInvestmentCap(property.type);
  const investmentRatio = Math.min(totalInvested / (basePrice * maxCap), 1.0);

  const rentMultiplier = 1 + investmentRatio * 0.25;
  const occupancyBonus = investmentRatio * 12;
  const desirabilityBonus = investmentRatio * 0.1;
  const downturnResilience = investmentRatio * 0.4;

  return {
    rentMultiplier: Math.round(rentMultiplier * 100) / 100,
    occupancyBonus: Math.round(occupancyBonus * 10) / 10,
    desirabilityBonus: Math.round(desirabilityBonus * 100) / 100,
    downturnResilience: Math.round(downturnResilience * 100) / 100,
    investmentRatio: Math.round(investmentRatio * 1000) / 1000,
  };
}

export async function updateIntrinsicValues() {
  const tickNumber = await getTickNumber();
  const [properties, cities] = await Promise.all([
    Property.find({ type: { $ne: 'land' }, developmentLevel: { $gt: 0 } })
      .populate('cityId', 'demandIndex supplyIndex growthRate economicCondition')
      .lean(),
    City.find().lean(),
  ]);

  const cityMap = new Map(cities.map((c) => [c._id.toString(), c]));
  const bulkOps = [];

  for (const property of properties) {
    const city =
      property.cityId && typeof property.cityId === 'object'
        ? property.cityId
        : cityMap.get(property.cityId?.toString());
    const intrinsicValue = calculateIntrinsicValue(property, tickNumber, city);

    bulkOps.push({
      updateOne: {
        filter: { _id: property._id },
        update: { $set: { intrinsicValue } },
      },
    });
  }

  if (bulkOps.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      await Property.bulkWrite(bulkOps.slice(i, i + BATCH_SIZE));
    }
  }

  return bulkOps.length;
}

export function getIntrinsicValueBreakdown(property, currentTick) {
  const baseValue = property.basePrice || property.currentPrice || 0;
  const upgradeValue = calculateUpgradeValue(property, currentTick);
  const improvementValue = calculateImprovementValue(property, currentTick);
  const gradeValue = calculateGradeValue(property);
  const qualityMultiplier = calculateQualityMultiplier(property.qualityScore);
  const investmentFactors = getInvestmentFactors(property);

  const ratingBonuses = getRatingBonuses(property.propertyRating || 'standard');
  const ratingMultiplier = 1 + (ratingBonuses.valueBonus || 0);
  const maxCap = getInvestmentCap(property.type);

  return {
    baseValue,
    upgradeValue: Math.round(upgradeValue),
    improvementValue: Math.round(improvementValue),
    gradeValue: Math.round(gradeValue),
    qualityMultiplier: Math.round(qualityMultiplier * 100) / 100,
    ratingMultiplier,
    investmentMultiplier: 1 + investmentFactors.investmentRatio * 0.15,
    investmentCap: maxCap,
    intrinsicValue: property.intrinsicValue || 0,
  };
}
