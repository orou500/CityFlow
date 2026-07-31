import Property from '../models/Property.js';
import {
  calculateBaseRisk,
  getHazardProbability,
  getRiskLevel,
  getGrowthMultiplier,
  MAX_RISK_EVENTS_HISTORY,
  RISK_SCORE_HISTORY_LENGTH,
} from '../config/propertyRisk.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { invalidateProperty, invalidateUser } from '../utils/cacheInvalidation.js';

const HAZARD_COOLDOWN_TICKS = 12;

export async function processPropertyRisks(tickNumber) {
  const properties = await Property.find({ type: { $ne: 'land' } }).populate('cityId');

  let updated = 0;

  for (const property of properties) {
    const city = property.cityId;
    if (!city) continue;

    const hazardActive = property.hazards && property.hazards.some((h) => h.active);
    if (hazardActive) {
      const changed = await processActiveHazards(property, tickNumber);
      if (changed) updated++;
      continue;
    }

    const lastHazardTick = getLastHazardTick(property);
    if (lastHazardTick && tickNumber - lastHazardTick < HAZARD_COOLDOWN_TICKS) continue;

    const oldScore = property.riskScore || 20;
    const newScore = calculateBaseRisk(property, city);
    let dirty = false;

    if (newScore !== oldScore) {
      property.riskScore = newScore;
      dirty = true;
    }

    applyVolatilityAdjustment(property);

    if (tickNumber % 4 === 0) {
      trackRiskHistory(property, tickNumber, city);

      const locationHazards = getHazardsForLocation(property.location);
      for (const hazardType of locationHazards) {
        const prob = getHazardProbability(hazardType, city);
        if (Math.random() < prob) {
          await triggerHazard(property, hazardType, city, tickNumber);
          updated++;
          dirty = true;
          break;
        }
      }
    }

    if (dirty) {
      await property.save();
    }
  }

  return updated;
}
async function processActiveHazards(property, _tickNumber) {
  let changed = false;
  for (const hazard of property.hazards) {
    if (!hazard.active) continue;

    hazard.remainingTicks = (hazard.remainingTicks || 3) - 1;

    if (hazard.conditionDamage) {
      const damagePerTick = Math.round(hazard.conditionDamage * 0.3);
      property.condition = Math.max(0, (property.condition || 100) - damagePerTick);
    }

    if (property.occupancy > 0) {
      property.occupancy = Math.max(0, property.occupancy - 5);
    }

    if (hazard.remainingTicks <= 0) {
      hazard.active = false;
      hazard.severity = Math.max(0, hazard.severity - 30);

      property.condition = Math.max(0, (property.condition || 100) - Math.round(hazard.conditionDamage || 0));
      property.riskScore = Math.min(100, (property.riskScore || 20) + 10);

      const ownerId = property.ownerId;
      if (ownerId) {
      await enqueueNotification({
        userId: ownerId,
        type: 'system',
        title: 'Hazard Event Ended',
        message: `The ${hazard.hazardType} affecting your property has subsided. Condition degraded by ${Math.round(hazard.conditionDamage || 0)}%.`,
        route: `/property/${property._id}`,
        entityType: 'property',
        entityId: property._id,
        relatedId: property._id,
        global: false,
      });
        invalidateUser(ownerId);
      }

      changed = true;
    }
  }

  return changed;
}

export async function triggerHazard(property, hazardType, city, tickNumber) {
  const severityConfig = {
    hurricane: { min: 20, max: 60 },
    flood: { min: 15, max: 50 },
    earthquake: { min: 30, max: 70 },
    wildfire: { min: 20, max: 55 },
    storm: { min: 10, max: 35 },
  };

  const range = severityConfig[hazardType] || { min: 15, max: 40 };
  const severity = range.min + Math.random() * (range.max - range.min);
  const conditionDamage = Math.round(severity * (0.3 + Math.random() * 0.4));
  const valueDrop = Math.round((property.currentPrice || 0) * (severity / 100) * 0.3);

  if (!property.hazards) property.hazards = [];
  property.hazards.push({
    hazardType,
    severity: Math.round(severity),
    active: true,
    startedAt: tickNumber,
    remainingTicks: 2 + Math.floor(Math.random() * 3),
    conditionDamage,
  });

  property.riskScore = Math.min(100, (property.riskScore || 20) + Math.round(severity * 0.4));
  property.condition = Math.max(0, (property.condition || 100) - Math.round(conditionDamage * 0.3));
  property.currentPrice = Math.max(Math.round(property.basePrice * 0.3), (property.currentPrice || 0) - valueDrop);
  property.occupancy = Math.max(0, (property.occupancy || 0) - 10);

  if (!property.riskEvents) property.riskEvents = [];
  property.riskEvents.push({
    eventType: hazardType,
    hazardType,
    severity: Math.round(severity),
    tick: tickNumber,
    description: `${hazardType} caused ${Math.round(conditionDamage)}% condition damage and $${valueDrop.toLocaleString()} in value loss.`,
    effect: {
      conditionDelta: -Math.round(conditionDamage),
      rentDelta: 0,
      valueDelta: -valueDrop,
      costDelta: 0,
    },
  });
  if (property.riskEvents.length > MAX_RISK_EVENTS_HISTORY) {
    property.riskEvents = property.riskEvents.slice(-MAX_RISK_EVENTS_HISTORY);
  }

  if (property.priceHistory) {
    property.priceHistory.push({ tick: tickNumber, price: property.currentPrice });
  }

  const ownerId = property.ownerId;
  if (ownerId) {
    await enqueueNotification({
      userId: ownerId,
      type: 'system',
      title: `${hazardType.charAt(0).toUpperCase() + hazardType.slice(1)} Warning`,
      message: `Your property "${property.name}" is experiencing ${hazardType} activity. Condition: -${Math.round(conditionDamage)}%, Value: -$${valueDrop.toLocaleString()}.`,
      route: `/property/${property._id}`,
      entityType: 'property',
      entityId: property._id,
      relatedId: property._id,
      global: false,
    });
    invalidateUser(ownerId);
  }

  invalidateProperty(property._id);
}

function getHazardsForLocation(location) {
  const locationHazardMap = {
    Waterfront: ['hurricane', 'flood', 'storm'],
    Downtown: ['earthquake'],
    Suburban: ['storm'],
    Industrial: ['flood', 'storm'],
    Residential: ['storm'],
    'City Center': ['earthquake'],
    'Business District': ['earthquake'],
    Hills: ['wildfire', 'storm'],
    Coastal: ['hurricane', 'flood', 'storm'],
    Rural: ['wildfire', 'storm'],
    Mountains: ['wildfire', 'storm', 'earthquake'],
    Lakeside: ['flood', 'storm'],
  };
  return locationHazardMap[location] || ['storm'];
}

function trackRiskHistory(property, tickNumber, city) {
  if (!property.riskHistory) property.riskHistory = [];
  property.riskHistory.push({
    tick: tickNumber,
    riskScore: property.riskScore,
    cityDemand: city.demandIndex,
    cityEconomic: city.economicCondition,
  });
  if (property.riskHistory.length > RISK_SCORE_HISTORY_LENGTH) {
    property.riskHistory = property.riskHistory.slice(-RISK_SCORE_HISTORY_LENGTH);
  }
}

function getLastHazardTick(property) {
  if (!property.hazards || property.hazards.length === 0) return null;
  const startedTicks = property.hazards.filter((h) => h.startedAt != null).map((h) => h.startedAt);
  return startedTicks.length > 0 ? Math.max(...startedTicks) : null;
}

function applyVolatilityAdjustment(property) {
  const riskLevel = getRiskLevel(property.riskScore || 20);
  const baseVolatility = 0.1;
  const riskVolatilityMap = {
    very_low: 0.05,
    low: 0.08,
    moderate: 0.12,
    high: 0.18,
    very_high: 0.25,
  };
  const targetVolatility = riskVolatilityMap[riskLevel.id] || baseVolatility;
  const currentVolatility = property.volatility || baseVolatility;
  property.volatility = currentVolatility + (targetVolatility - currentVolatility) * 0.1;
}

function getRiskFactorBreakdown(property, city) {
  const factors = [];

  const locationInfo = {
    Waterfront: 55,
    Coastal: 60,
    Lakeside: 40,
    Industrial: 35,
    Hills: 25,
    Mountains: 30,
    Downtown: 25,
    'City Center': 30,
    'Business District': 20,
    Suburban: 20,
    Rural: 20,
    Residential: 15,
  };
  const locationScore = locationInfo[property.location] || 20;
  if (locationScore >= 50) {
    factors.push({
      factor: 'location',
      severity: 'high',
      label: `High-risk location (${property.location})`,
      icon: '\u{1F3D4}',
    });
  } else if (locationScore >= 30) {
    factors.push({
      factor: 'location',
      severity: 'moderate',
      label: `Moderate-risk location (${property.location})`,
      icon: '\u{1F3D4}',
    });
  }

  if (city.economicCondition === 'recession') {
    factors.push({ factor: 'economy', severity: 'high', label: 'City in recession', icon: '\u{1F4C9}' });
  } else if (city.economicCondition === 'slowdown') {
    factors.push({ factor: 'economy', severity: 'moderate', label: 'Economic slowdown', icon: '\u{1F4C8}' });
  } else if (city.economicCondition === 'boom') {
    factors.push({ factor: 'economy', severity: 'low', label: 'Economic boom', icon: '\u{1F4C8}' });
  }

  if (city.demandIndex < 0.6) {
    factors.push({ factor: 'demand', severity: 'high', label: 'Very low demand', icon: '\u{1F6AB}' });
  } else if (city.demandIndex < 0.8) {
    factors.push({ factor: 'demand', severity: 'moderate', label: 'Below-average demand', icon: '\u{1F6AB}' });
  }

  if ((property.condition || 100) < 50) {
    factors.push({ factor: 'condition', severity: 'high', label: 'Poor condition', icon: '\u{1F6A7}' });
  } else if ((property.condition || 100) < 75) {
    factors.push({ factor: 'condition', severity: 'moderate', label: 'Below-average condition', icon: '\u{1F6A7}' });
  }

  if (property.type === 'commercial') {
    factors.push({
      factor: 'type',
      severity: 'moderate',
      label: 'Commercial property (economic sensitivity)',
      icon: '\u{1F3E2}',
    });
  } else if (property.type === 'land') {
    factors.push({ factor: 'type', severity: 'moderate', label: 'Undeveloped land (speculative)', icon: '\u{1F3D4}' });
  }

  if (property.maintenanceLevel === 'none' && property.type !== 'land') {
    factors.push({ factor: 'maintenance', severity: 'moderate', label: 'No maintenance plan', icon: '\u{1F527}' });
  }

  return factors.slice(0, 5);
}

function getRiskReductionTips(property, city) {
  const tips = [];
  if ((property.condition || 100) < 75) {
    tips.push({ action: 'Improve property condition through maintenance', icon: '\u{1F527}' });
  }
  if (property.maintenanceLevel === 'none' && property.type !== 'land') {
    tips.push({ action: 'Set a maintenance plan to prevent condition decay', icon: '\u{1F4B0}' });
  }
  if (property.type === 'commercial') {
    tips.push({ action: 'Diversify into residential properties for stability', icon: '\u{1F3E0}' });
  }
  if (city.economicCondition === 'recession' || city.demandIndex < 0.6) {
    tips.push({ action: 'Consider properties in stronger economic regions', icon: '\u{1F30D}' });
  }
  if (property.upgradeLevel === 0 && property.type !== 'land') {
    tips.push({ action: 'Upgrade property to increase value and reduce risk', icon: '\u{1F3D7}' });
  }
  return tips;
}

export function getPropertyRiskProfile(property, city) {
  const riskScore = property.riskScore || calculateBaseRisk(property, city);
  const level = getRiskLevel(riskScore);
  const growthMultiplier = getGrowthMultiplier(riskScore);

  const activeHazards = (property.hazards || [])
    .filter((h) => h.active)
    .map((h) => ({
      type: h.hazardType,
      severity: h.severity,
      remainingTicks: h.remainingTicks,
      conditionDamage: h.conditionDamage,
    }));

  const locationHazards = getHazardsForLocation(property.location);

  return {
    riskScore,
    riskLabel: level.labelKey,
    riskColor: level.color,
    growthMultiplier,
    activeHazards,
    potentialHazards: locationHazards,
    riskHistory: (property.riskHistory || []).slice(-10),
    recentEvents: (property.riskEvents || []).slice(-5),
    riskLevel: level.id,
    factors: getRiskFactorBreakdown(property, city),
    reductionTips: getRiskReductionTips(property, city),
  };
}
