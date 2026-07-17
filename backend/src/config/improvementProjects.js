const IMPROVEMENT_PROJECTS = {
  renovation: {
    id: 'renovation',
    name: 'Renovation',
    category: 'improvement',
    baseCostPercent: 0.08,
    constructionPeriods: 3,
    description: 'Modernize and refresh the property interior and exterior',
    valueBonus: 0.015,
    rentBonus: 0.02,
    conditionBonus: 3,
    demandBonus: 0,
  },
  interior_upgrade: {
    id: 'interior_upgrade',
    name: 'Interior Upgrade',
    category: 'improvement',
    baseCostPercent: 0.06,
    constructionPeriods: 2,
    description: 'Upgrade flooring, fixtures, and interior finishes',
    valueBonus: 0.008,
    rentBonus: 0.015,
    conditionBonus: 2,
    demandBonus: 0,
  },
  parking_expansion: {
    id: 'parking_expansion',
    name: 'Parking Expansion',
    category: 'improvement',
    baseCostPercent: 0.1,
    constructionPeriods: 4,
    description: 'Add or expand parking facilities',
    valueBonus: 0.015,
    rentBonus: 0.015,
    conditionBonus: 0,
    demandBonus: 0.01,
  },
  landscaping: {
    id: 'landscaping',
    name: 'Landscaping',
    category: 'improvement',
    baseCostPercent: 0.04,
    constructionPeriods: 2,
    description: 'Enhance outdoor areas with professional landscaping',
    valueBonus: 0.008,
    rentBonus: 0.008,
    conditionBonus: 1,
    demandBonus: 0.005,
  },
  energy_efficiency: {
    id: 'energy_efficiency',
    name: 'Energy Efficiency',
    category: 'improvement',
    baseCostPercent: 0.06,
    constructionPeriods: 3,
    description: 'Install energy-efficient systems and insulation',
    valueBonus: 0.008,
    rentBonus: 0.008,
    conditionBonus: 0,
    demandBonus: 0.01,
  },
  security_upgrade: {
    id: 'security_upgrade',
    name: 'Security Upgrade',
    category: 'improvement',
    baseCostPercent: 0.05,
    constructionPeriods: 2,
    description: 'Install modern security systems and cameras',
    valueBonus: 0.005,
    rentBonus: 0.005,
    conditionBonus: 0,
    demandBonus: 0.005,
  },
  luxury_finishes: {
    id: 'luxury_finishes',
    name: 'Luxury Finishes',
    category: 'improvement',
    baseCostPercent: 0.12,
    constructionPeriods: 4,
    description: 'Premium materials, designer fixtures, and high-end finishes',
    valueBonus: 0.03,
    rentBonus: 0.035,
    conditionBonus: 5,
    demandBonus: 0.015,
  },
};

const PROPERTY_RATINGS = {
  standard: { minImprovements: 0, valueBonus: 0, rentBonus: 0, demandBonus: 0 },
  improved: { minImprovements: 1, valueBonus: 0.02, rentBonus: 0.01, demandBonus: 0.005 },
  premium: { minImprovements: 3, valueBonus: 0.04, rentBonus: 0.02, demandBonus: 0.01 },
  luxury: { minImprovements: 5, valueBonus: 0.07, rentBonus: 0.03, demandBonus: 0.02 },
  elite: { minImprovements: 7, valueBonus: 0.1, rentBonus: 0.05, demandBonus: 0.03 },
};

const RATING_ORDER = ['standard', 'improved', 'premium', 'luxury', 'elite'];

function calculateImprovementCost(improvement, propertyValue) {
  return Math.round(propertyValue * improvement.baseCostPercent);
}

function calculatePropertyRating(completedImprovements) {
  const count = completedImprovements.length;
  let rating = 'standard';

  for (const tier of RATING_ORDER) {
    if (count >= PROPERTY_RATINGS[tier].minImprovements) {
      rating = tier;
    }
  }

  return rating;
}

function getRatingBonuses(rating) {
  return PROPERTY_RATINGS[rating] || PROPERTY_RATINGS.standard;
}

function getAvailableImprovements(completedImprovements) {
  const completedIds = completedImprovements.map((i) => i.improvementId);
  return Object.values(IMPROVEMENT_PROJECTS).filter((p) => !completedIds.includes(p.id));
}

export {
  IMPROVEMENT_PROJECTS,
  PROPERTY_RATINGS,
  RATING_ORDER,
  calculateImprovementCost,
  calculatePropertyRating,
  getRatingBonuses,
  getAvailableImprovements,
};
