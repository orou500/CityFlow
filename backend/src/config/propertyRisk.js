export const HAZARD_TYPES = {
  HURRICANE: { id: 'hurricane', label: 'Hurricane', labelKey: 'propertyRisk.hazard.hurricane', severityRange: [0.3, 0.8] },
  FLOOD: { id: 'flood', label: 'Flood', labelKey: 'propertyRisk.hazard.flood', severityRange: [0.2, 0.7] },
  EARTHQUAKE: { id: 'earthquake', label: 'Earthquake', labelKey: 'propertyRisk.hazard.earthquake', severityRange: [0.4, 0.9] },
  WILDFIRE: { id: 'wildfire', label: 'Wildfire', labelKey: 'propertyRisk.hazard.wildfire', severityRange: [0.3, 0.8] },
  STORM: { id: 'storm', label: 'Storm Damage', labelKey: 'propertyRisk.hazard.storm', severityRange: [0.1, 0.5] },
};

export const RISK_EVENT_TYPES = {
  POSITIVE: {
    TOURISM_BOOM: { id: 'tourism_boom', labelKey: 'propertyRisk.event.tourismBoom', effect: 'demand_increase' },
    CORPORATE_INVESTMENT: {
      id: 'corporate_investment',
      labelKey: 'propertyRisk.event.corporateInvestment',
      effect: 'value_increase',
    },
    INFRASTRUCTURE: {
      id: 'infrastructure_expansion',
      labelKey: 'propertyRisk.event.infrastructureExpansion',
      effect: 'growth_boost',
    },
  },
  NEGATIVE: {
    FLOOD_DAMAGE: { id: 'flood_damage', labelKey: 'propertyRisk.event.floodDamage', effect: 'condition_decrease' },
    EMPLOYER_CLOSURE: { id: 'employer_closure', labelKey: 'propertyRisk.event.employerClosure', effect: 'demand_decrease' },
    TOURISM_COLLAPSE: { id: 'tourism_collapse', labelKey: 'propertyRisk.event.tourismCollapse', effect: 'rent_decrease' },
    INSURANCE_HIKE: { id: 'insurance_hike', labelKey: 'propertyRisk.event.insuranceHike', effect: 'cost_increase' },
  },
};

export const RISK_LEVELS = [
  {
    id: 'very_low',
    labelKey: 'propertyRisk.level.veryLow',
    minScore: 0,
    maxScore: 20,
    color: '#22c55e',
    growthMultiplier: 0.5,
  },
  { id: 'low', labelKey: 'propertyRisk.level.low', minScore: 21, maxScore: 40, color: '#84cc16', growthMultiplier: 0.8 },
  {
    id: 'moderate',
    labelKey: 'propertyRisk.level.moderate',
    minScore: 41,
    maxScore: 60,
    color: '#eab308',
    growthMultiplier: 1.0,
  },
  { id: 'high', labelKey: 'propertyRisk.level.high', minScore: 61, maxScore: 80, color: '#f97316', growthMultiplier: 1.5 },
  {
    id: 'very_high',
    labelKey: 'propertyRisk.level.veryHigh',
    minScore: 81,
    maxScore: 100,
    color: '#ef4444',
    growthMultiplier: 2.5,
  },
];

export const LOCATION_RISK = {
  Waterfront: { baseRisk: 55, hazards: ['hurricane', 'flood', 'storm'] },
  Downtown: { baseRisk: 25, hazards: ['earthquake'] },
  Suburban: { baseRisk: 20, hazards: ['storm'] },
  Industrial: { baseRisk: 35, hazards: ['flood', 'storm'] },
  Residential: { baseRisk: 15, hazards: ['storm'] },
  'City Center': { baseRisk: 30, hazards: ['earthquake'] },
  'Business District': { baseRisk: 20, hazards: ['earthquake'] },
  Hills: { baseRisk: 25, hazards: ['wildfire', 'storm'] },
  Coastal: { baseRisk: 60, hazards: ['hurricane', 'flood', 'storm'] },
  Rural: { baseRisk: 20, hazards: ['wildfire', 'storm'] },
  Mountains: { baseRisk: 30, hazards: ['wildfire', 'storm', 'earthquake'] },
  Lakeside: { baseRisk: 40, hazards: ['flood', 'storm'] },
};

export function getRiskLevel(score) {
  return RISK_LEVELS.find((l) => score >= l.minScore && score <= l.maxScore) || RISK_LEVELS[2];
}

export function getGrowthMultiplier(riskScore) {
  const level = getRiskLevel(riskScore);
  return level.growthMultiplier;
}

export function calculateBaseRisk(property, city) {
  let risk = 20;

  const locationInfo = LOCATION_RISK[property.location];
  if (locationInfo) risk = locationInfo.baseRisk;

  if (city.economicCondition === 'recession') risk += 15;
  else if (city.economicCondition === 'slowdown') risk += 8;
  else if (city.economicCondition === 'boom') risk -= 5;

  if (city.demandIndex < 0.8) risk += 10;
  else if (city.demandIndex < 0.5) risk += 20;

  if (city.supplyIndex > 1.5) risk += 10;

  if (city.growthRate < 0) risk += 15;
  else if (city.growthRate > 0.02) risk -= 5;

  if (property.type === 'commercial') risk += 10;
  else if (property.type === 'land') risk += 15;
  else if (property.type === 'apartment') risk -= 5;

  const conditionPenalty = Math.max(0, (100 - (property.condition || 100)) * 0.2);
  risk += conditionPenalty;

  if (property.maintenanceLevel === 'none') risk += 10;
  else if (property.maintenanceLevel === 'premium') risk -= 5;

  return Math.max(0, Math.min(100, Math.round(risk)));
}

export function getHazardProbability(hazardType, city) {
  const base = {
    hurricane: 0.03,
    flood: 0.04,
    earthquake: 0.02,
    wildfire: 0.03,
    storm: 0.05,
  };

  let prob = base[hazardType] || 0.03;
  if (city.economicCondition === 'recession') prob *= 1.5;
  if (city.demandIndex < 0.5) prob *= 1.3;

  return Math.min(prob, 0.15);
}

export const INSURANCE_COST_MULTIPLIER = 0.02;
export const MAX_RISK_EVENTS_HISTORY = 20;
export const RISK_SCORE_HISTORY_LENGTH = 30;
