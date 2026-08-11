import { ECONOMIC_CONDITIONS } from './demographics.js';
import { getRatingBonuses } from './improvementProjects.js';
import { getInvestmentFactors } from '../engine/propertyValuation.js';

export const MAX_MONTHLY_RENT = 50000;

export const RENT_SYSTEM = {
  MAX_MONTHLY_RENT,
  // Rent potential is derived from the property's market value.
  POTENTIAL_YIELD_BASE: 0.012,
  TYPE_YIELD: { apartment: 1.0, house: 0.85, commercial: 1.2, land: 0 },
  QUALITY_POTENTIAL_MIN: 0.75,
  QUALITY_POTENTIAL_MAX: 1.1,
  // Monthly growth is proportional to the remaining gap to potential, so rent
  // accelerates while far below potential and flattens out as it approaches.
  GROWTH_BASE_RATE: 0.25,
  GROWTH_CATCHUP_RATE: 0.55,
  GROWTH_MAX_RATE: 1.2,
  GROWTH_MAX_DECLINE_RATE: -0.15,
  // Existing production properties get a gentler first-month increase so the
  // migration never hands out a sudden jump.
  LEGACY_FIRST_MONTH_CAP: 0.5,
  // Operating expenses are a small type-based overhead on top of maintenance.
  OPERATING_EXPENSE_RATE: { apartment: 0.02, house: 0.01, commercial: 0.05, land: 0 },
  RENT_HISTORY_MAX_ENTRIES: 36,
};

export const MAINTENANCE_TIERS = {
  none: {
    id: 'none',
    costPercentOfRent: 0,
    qualityDecayRate: 0.5,
    occupancyModifier: -0.05,
    label: 'No Maintenance',
  },
  basic: {
    id: 'basic',
    costPercentOfRent: 0.1,
    qualityDecayRate: 0.2,
    occupancyModifier: 0,
    label: 'Basic Maintenance',
  },
  standard: {
    id: 'standard',
    costPercentOfRent: 0.25,
    qualityDecayRate: 0.05,
    occupancyModifier: 0.05,
    label: 'Standard Maintenance',
  },
  premium: {
    id: 'premium',
    costPercentOfRent: 0.4,
    qualityDecayRate: 0,
    occupancyModifier: 0.1,
    label: 'Premium Maintenance',
  },
};

export const RENT_BOUNDS = {
  minMultiplier: 0.5,
  maxMultiplier: 2.0,
  defaultMultiplier: 1.0,
  rentChangeCooldownTicks: 1,
};

export const QUALITY_WEIGHTS = {
  condition: 0.3,
  occupancyHistory: 0.2,
  maintenanceLevel: 0.25,
  improvements: 0.15,
  age: 0.1,
};

export const QUALITY_INITIAL = 70;

export const OCCUPANCY_FACTORS = {
  qualityWeight: 0.35,
  rentCompetitivenessWeight: 0.3,
  demandWeight: 0.2,
  supplyWeight: 0.15,
  baseOccupancy: 0.6,
  minOccupancy: 0,
  maxOccupancy: 100,
  occupancyChangeRate: 0.1,
};

export const PROFIT_FORMULA = {
  maintenanceCostMultiplier: {
    none: 0,
    basic: 0.1,
    standard: 0.25,
    premium: 0.4,
  },
};

export const HISTORY_MAX_ENTRIES = 120;

export function calculateMonthlyProfit(rentIncome, maintenanceLevel, _propertyValue, property = null) {
  const tier = MAINTENANCE_TIERS[maintenanceLevel] || MAINTENANCE_TIERS.none;
  const maintenanceCost = Math.round(rentIncome * tier.costPercentOfRent);
  const operatingExpenses = property ? calculateOperatingExpenses(property, rentIncome) : 0;
  return {
    rentIncome,
    maintenanceCost,
    operatingExpenses,
    netProfit: rentIncome - maintenanceCost - operatingExpenses,
  };
}

/**
 * Global server-side cap — no property may ever exceed $50,000/month.
 * Apply this to every code path that writes a property's rent.
 */
export function clampMonthlyRent(rent) {
  return Math.max(0, Math.min(MAX_MONTHLY_RENT, Math.round(rent || 0)));
}

export function calculateMaintenanceCost(property, rentIncome) {
  const tier = MAINTENANCE_TIERS[property?.maintenanceLevel] || MAINTENANCE_TIERS.none;
  return Math.round(rentIncome * tier.costPercentOfRent);
}

export function calculateOperatingExpenses(property, rentIncome) {
  const rate = RENT_SYSTEM.OPERATING_EXPENSE_RATE[property?.type] || 0;
  return Math.round(rentIncome * rate);
}

/**
 * Single source of truth for what the owner actually nets per month:
 * occupancy-adjusted income minus maintenance minus operating expenses.
 * The rent pool accrues exactly this, so collection matches the UI.
 */
export function calculateNetRentIncome(property) {
  const rentIncome = calculatePropertyRentIncome(property);
  return Math.max(
    0,
    rentIncome - calculateMaintenanceCost(property, rentIncome) - calculateOperatingExpenses(property, rentIncome),
  );
}

/**
 * Value-based monthly rent potential, capped at MAX_MONTHLY_RENT.
 *
 * Market value -> base yield -> property type -> quality -> condition ->
 * city demand/supply/economy -> rating -> invested capital.
 */
export function calculateRentPotential(property, city) {
  if (property?.type === 'land' && !(property.developmentLevel > 0)) return 0;

  const value = Math.max(0, property.currentPrice || property.basePrice || 0);
  if (value <= 0) return 0;

  const typeFactor = RENT_SYSTEM.TYPE_YIELD[property.type] ?? 1;
  if (typeFactor <= 0) return 0;

  const quality = Math.max(0, Math.min(100, property.qualityScore ?? 70));
  const qualityFactor =
    RENT_SYSTEM.QUALITY_POTENTIAL_MIN +
    (quality / 100) * (RENT_SYSTEM.QUALITY_POTENTIAL_MAX - RENT_SYSTEM.QUALITY_POTENTIAL_MIN);

  const condition = Math.max(0, Math.min(100, property.condition ?? 100));
  const conditionFactor = 0.75 + (condition / 100) * 0.25;

  let demandFactor = 1;
  let supplyFactor = 1;
  let econFactor = 1;
  if (city && typeof city === 'object') {
    const demand = city.demandIndex ?? 1;
    const supply = city.supplyIndex ?? 1;
    demandFactor = 0.7 + demand * 0.3;
    supplyFactor = 1 / (1 + (supply - 1) * 0.15);
    econFactor = ECONOMIC_CONDITIONS[city.economicCondition]?.rentModifier ?? 1;
  }

  const ratingFactor = 1 + (getRatingBonuses(property.propertyRating || 'standard').rentBonus || 0);
  const investmentFactor = getInvestmentFactors(property).rentMultiplier || 1;

  const potential =
    value *
    RENT_SYSTEM.POTENTIAL_YIELD_BASE *
    typeFactor *
    qualityFactor *
    conditionFactor *
    demandFactor *
    supplyFactor *
    econFactor *
    ratingFactor *
    investmentFactor;

  return clampMonthlyRent(potential);
}

/**
 * Applies one month of rent growth toward the property's rent potential.
 * Growth is sharp while far below potential and flattens as it approaches.
 * Legacy properties (no rent history yet) get a capped first-month increase.
 */
export function calculateMonthlyRentGrowth(property, city) {
  const currentRent = Math.max(0, property.rent || 0);
  const rentPotential = calculateRentPotential(property, city);
  const previousMonthRent = currentRent;

  if (rentPotential <= 0) {
    return {
      currentRent,
      rentPotential,
      previousMonthRent,
      newRent: currentRent,
      growthRate: 0,
      increase: 0,
      increasePct: 0,
      isLegacyFirstMonth: false,
    };
  }

  let effectiveCurrent = currentRent;
  if (currentRent <= 0) effectiveCurrent = Math.max(100, Math.round(rentPotential * 0.1));

  const gap = 1 - effectiveCurrent / rentPotential;
  let rate = RENT_SYSTEM.GROWTH_BASE_RATE + RENT_SYSTEM.GROWTH_CATCHUP_RATE * gap;
  rate = Math.max(RENT_SYSTEM.GROWTH_MAX_DECLINE_RATE, Math.min(RENT_SYSTEM.GROWTH_MAX_RATE, rate));

  const isLegacyFirstMonth = (property.rentHistory == null || property.rentHistory.length === 0) && currentRent > 0;
  if (isLegacyFirstMonth && rate > 0) {
    rate = Math.min(rate, RENT_SYSTEM.LEGACY_FIRST_MONTH_CAP);
  }

  let newRent = Math.round(effectiveCurrent * (1 + rate));
  if (rate >= 0) {
    newRent = Math.min(newRent, rentPotential);
  } else {
    newRent = Math.max(newRent, rentPotential);
  }
  newRent = clampMonthlyRent(newRent);

  const increase = newRent - previousMonthRent;
  const increasePct = previousMonthRent > 0 ? (increase / previousMonthRent) * 100 : 0;

  return {
    currentRent,
    rentPotential,
    previousMonthRent,
    newRent,
    growthRate: Math.round(rate * 1000) / 1000,
    increase,
    increasePct: Math.round(increasePct * 100) / 100,
    isLegacyFirstMonth,
  };
}

/**
 * Single source of truth for a property's effective (occupancy-adjusted)
 * rent income per tick.
 *
 * - Explicit per-unit rent (property.rentPerUnit, set by the player via the
 *   management panel) takes precedence.
 * - For buildings with units, the gross rent is the sum of unit rents.
 * - Otherwise the property's gross rent field is used.
 *
 * The result is occupancy-adjusted so displayed income, accrued rent and
 * maintenance all use the same number.
 */
export function calculatePropertyRentIncome(property) {
  // A house is a single-family dwelling — it is either occupied or not, so it
  // always earns its full rent (occupancy does not apply).
  if (property.type === 'house') {
    return Math.max(0, Math.round(property.rentPerUnit || property.rent || 0));
  }
  const unitCount = property.units?.length || 1;
  let grossRent = property.rent || 0;
  if (property.rentPerUnit) {
    grossRent = property.rentPerUnit * unitCount;
  } else if (property.units?.length > 0) {
    grossRent = property.units.reduce((sum, u) => sum + (u.rentPrice || 0), 0);
  }
  const occupancy = Math.max(0, Math.min(100, property.occupancy || 0));
  return Math.round((grossRent * occupancy) / 100);
}

export function calculateQualityScore(property) {
  const conditionScore = (property.condition || 50) * QUALITY_WEIGHTS.condition;

  const avgOccupancy =
    property.managementHistory && property.managementHistory.length > 0
      ? property.managementHistory.slice(-6).reduce((sum, h) => sum + (h.occupancy || 0), 0) /
        Math.min(property.managementHistory.length, 6)
      : property.occupancy || 50;
  const occupancyScore = avgOccupancy * QUALITY_WEIGHTS.occupancyHistory;

  const maintenanceScores = { none: 0, basic: 40, standard: 70, premium: 100 };
  const maintenanceScore = (maintenanceScores[property.maintenanceLevel] || 0) * QUALITY_WEIGHTS.maintenanceLevel;

  const improvementCount = property.improvements?.length || 0;
  const improvementScore = Math.min(100, improvementCount * 15) * QUALITY_WEIGHTS.improvements;

  const ageMonths = property.priceHistory?.length || 0;
  const agePenalty = Math.min(30, ageMonths * 0.25);
  const ageScore = Math.max(0, 100 - agePenalty) * QUALITY_WEIGHTS.age;

  return Math.round(conditionScore + occupancyScore + maintenanceScore + improvementScore + ageScore);
}

export function simulateOccupancy(property, cityDemandIndex, citySupplyIndex) {
  // Houses are single-family homes and always occupied
  if (property.type === 'house') return 100;

  const quality = property.qualityScore || 50;
  const normalizedQuality = quality / 100;

  const marketRate = property.rent > 0 ? property.rent / Math.max(1, property.units?.length || 1) : 0;
  const playerRent = property.rentPerUnit || marketRate;
  const rentCompetitiveness = marketRate > 0 ? Math.min(2, marketRate / Math.max(1, playerRent)) : 1;

  const demand = (cityDemandIndex || 50) / 100;
  const supply = (citySupplyIndex || 50) / 100;
  const supplyPressure = 1 - supply * 0.5;

  const tier = MAINTENANCE_TIERS[property.maintenanceLevel] || MAINTENANCE_TIERS.none;

  const investmentOccupancyBonus = property._investmentOccupancyBonus || 0;

  const targetOccupancy =
    OCCUPANCY_FACTORS.baseOccupancy +
    normalizedQuality * OCCUPANCY_FACTORS.qualityWeight +
    (rentCompetitiveness - 1) * OCCUPANCY_FACTORS.rentCompetitivenessWeight +
    demand * OCCUPANCY_FACTORS.demandWeight +
    supplyPressure * OCCUPANCY_FACTORS.supplyWeight +
    tier.occupancyModifier +
    investmentOccupancyBonus / 100;

  const clampedTarget = Math.max(
    OCCUPANCY_FACTORS.minOccupancy,
    Math.min(OCCUPANCY_FACTORS.maxOccupancy, targetOccupancy * 100),
  );

  const currentOccupancy = property.occupancy || 50;
  const change = (clampedTarget - currentOccupancy) * OCCUPANCY_FACTORS.occupancyChangeRate;

  return Math.round(Math.max(0, Math.min(100, currentOccupancy + change)));
}
