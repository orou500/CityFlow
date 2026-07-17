const UPGRADE_TYPES = {
  renovation: {
    id: 'renovation',
    name: 'Renovation',
    baseCostPercent: 0.08,
    baseValueBoost: 0.02,
    baseRentBoost: 0.05,
    conditionBoost: 5,
    riskReduction: false,
    unitBoost: 0,
  },
  security: {
    id: 'security',
    name: 'Security Upgrade',
    baseCostPercent: 0.04,
    baseValueBoost: 0.01,
    baseRentBoost: 0.02,
    conditionBoost: 0,
    riskReduction: true,
    unitBoost: 0,
  },
  luxury: {
    id: 'luxury',
    name: 'Luxury Finishes',
    baseCostPercent: 0.15,
    baseValueBoost: 0.04,
    baseRentBoost: 0.08,
    conditionBoost: 3,
    riskReduction: false,
    unitBoost: 0,
  },
  expansion: {
    id: 'expansion',
    name: 'Expansion',
    baseCostPercent: 0.2,
    baseValueBoost: 0.05,
    baseRentBoost: 0.05,
    conditionBoost: 0,
    riskReduction: false,
    unitBoost: 0.05,
  },
};

const COST_SCALE_BY_LEVEL = [1.0, 1.8, 3.0, 5.0, 8.0];

const DIMINISHING_RETURNS_BY_LEVEL = [1.0, 0.7, 0.5, 0.35, 0.25];

function getCostMultiplier(level) {
  if (level < COST_SCALE_BY_LEVEL.length) {
    return COST_SCALE_BY_LEVEL[level];
  }
  return COST_SCALE_BY_LEVEL[COST_SCALE_BY_LEVEL.length - 1] + (level - COST_SCALE_BY_LEVEL.length + 1) * 2.0;
}

function getEffectMultiplier(level) {
  if (level < DIMINISHING_RETURNS_BY_LEVEL.length) {
    return DIMINISHING_RETURNS_BY_LEVEL[level];
  }
  return DIMINISHING_RETURNS_BY_LEVEL[DIMINISHING_RETURNS_BY_LEVEL.length - 1];
}

function calculateUpgradeCost(upgradeType, propertyValue, upgradeLevel) {
  const upgrade = UPGRADE_TYPES[upgradeType];
  if (!upgrade) return 0;
  const costMult = getCostMultiplier(upgradeLevel);
  return Math.round(propertyValue * upgrade.baseCostPercent * costMult);
}

function calculateUpgradeEffects(upgradeType, upgradeLevel) {
  const upgrade = UPGRADE_TYPES[upgradeType];
  if (!upgrade) return null;
  const effectMult = getEffectMultiplier(upgradeLevel);
  return {
    valueBoost: upgrade.baseValueBoost * effectMult,
    rentBoost: upgrade.baseRentBoost * effectMult,
    conditionBoost: upgrade.conditionBoost,
    riskReduction: upgrade.riskReduction,
    unitBoost: upgrade.unitBoost * effectMult,
  };
}

function getUpgradePreview(upgradeType, propertyValue, currentRent, upgradeLevel) {
  const upgrade = UPGRADE_TYPES[upgradeType];
  if (!upgrade) return null;
  const cost = calculateUpgradeCost(upgradeType, propertyValue, upgradeLevel);
  const effects = calculateUpgradeEffects(upgradeType, upgradeLevel);
  const projectedValue = Math.round(propertyValue * (1 + effects.valueBoost));
  const projectedRent = Math.round(currentRent * (1 + effects.rentBoost));
  return {
    type: upgradeType,
    name: upgrade.name,
    cost,
    level: upgradeLevel + 1,
    valueBoost: effects.valueBoost,
    rentBoost: effects.rentBoost,
    conditionBoost: effects.conditionBoost,
    unitBoost: effects.unitBoost,
    riskReduction: effects.riskReduction,
    projectedValue,
    projectedRent,
    rentIncrease: projectedRent - currentRent,
  };
}

function countUpgradesByType(upgrades) {
  const counts = {};
  for (const u of upgrades || []) {
    counts[u.name] = (counts[u.name] || 0) + 1;
  }
  return counts;
}

export {
  UPGRADE_TYPES,
  COST_SCALE_BY_LEVEL,
  DIMINISHING_RETURNS_BY_LEVEL,
  getCostMultiplier,
  getEffectMultiplier,
  calculateUpgradeCost,
  calculateUpgradeEffects,
  getUpgradePreview,
  countUpgradesByType,
};
