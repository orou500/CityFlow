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

export function calculateMonthlyProfit(rentIncome, maintenanceLevel, propertyValue) {
  const tier = MAINTENANCE_TIERS[maintenanceLevel] || MAINTENANCE_TIERS.none;
  const maintenanceCost = Math.round(rentIncome * tier.costPercentOfRent);
  return {
    rentIncome,
    maintenanceCost,
    operatingExpenses: 0,
    netProfit: rentIncome - maintenanceCost,
  };
}

export function calculateQualityScore(property) {
  const conditionScore = (property.condition || 50) * QUALITY_WEIGHTS.condition;

  const avgOccupancy =
    property.managementHistory && property.managementHistory.length > 0
      ? property.managementHistory.slice(-6).reduce((sum, h) => sum + (h.occupancy || 0), 0) /
        Math.min(property.managementHistory.length, 6)
      : property.occupancy || 50;
  const occupancyScore = avgOccupancy * QUALITY_WEIGHTS.occupancyHistory;

  const tier = MAINTENANCE_TIERS[property.maintenanceLevel] || MAINTENANCE_TIERS.none;
  const maintenanceScores = { none: 0, basic: 40, standard: 70, premium: 100 };
  const maintenanceScore =
    (maintenanceScores[property.maintenanceLevel] || 0) * QUALITY_WEIGHTS.maintenanceLevel;

  const improvementCount = property.improvements?.length || 0;
  const improvementScore = Math.min(100, improvementCount * 15) * QUALITY_WEIGHTS.improvements;

  const ageMonths = property.priceHistory?.length || 0;
  const agePenalty = Math.min(30, ageMonths * 0.25);
  const ageScore = Math.max(0, 100 - agePenalty) * QUALITY_WEIGHTS.age;

  return Math.round(conditionScore + occupancyScore + maintenanceScore + improvementScore + ageScore);
}

export function simulateOccupancy(property, cityDemandIndex, citySupplyIndex) {
  const quality = property.qualityScore || 50;
  const normalizedQuality = quality / 100;

  const marketRate = property.rent > 0 ? property.rent / Math.max(1, property.units?.length || 1) : 0;
  const playerRent = property.rentPerUnit || marketRate;
  const rentCompetitiveness = marketRate > 0 ? Math.min(2, marketRate / Math.max(1, playerRent)) : 1;

  const demand = (cityDemandIndex || 50) / 100;
  const supply = (citySupplyIndex || 50) / 100;
  const supplyPressure = 1 - supply * 0.5;

  const tier = MAINTENANCE_TIERS[property.maintenanceLevel] || MAINTENANCE_TIERS.none;

  const targetOccupancy =
    OCCUPANCY_FACTORS.baseOccupancy +
    normalizedQuality * OCCUPANCY_FACTORS.qualityWeight +
    (rentCompetitiveness - 1) * OCCUPANCY_FACTORS.rentCompetitivenessWeight +
    demand * OCCUPANCY_FACTORS.demandWeight +
    supplyPressure * OCCUPANCY_FACTORS.supplyWeight +
    tier.occupancyModifier;

  const clampedTarget = Math.max(
    OCCUPANCY_FACTORS.minOccupancy,
    Math.min(OCCUPANCY_FACTORS.maxOccupancy, targetOccupancy * 100),
  );

  const currentOccupancy = property.occupancy || 50;
  const change = (clampedTarget - currentOccupancy) * OCCUPANCY_FACTORS.occupancyChangeRate;

  return Math.round(Math.max(0, Math.min(100, currentOccupancy + change)));
}
