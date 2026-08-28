import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import Property from '../models/Property.js';
import GameState from '../models/GameState.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import {
  MAINTENANCE_TIERS,
  RENT_BOUNDS,
  MAX_MONTHLY_RENT,
  calculateMonthlyProfit,
  calculatePropertyRentIncome,
  calculateQualityScore,
  calculateRentPotential,
  simulateOccupancy,
} from '../config/propertyManagement.js';

const router = Router();

async function isAuthorizedForProperty(property, userId) {
  if (property.ownerId && property.ownerId.toString() === userId.toString()) {
    return true;
  }
  if (property.companyId) {
    const company = await RealEstateCompany.findById(property.companyId);
    if (company) {
      const member = company.members.find((m) => m.userId?.toString() === userId.toString());
      if (member && ['ceo', 'director'].includes(member.role)) {
        return true;
      }
    }
  }
  return false;
}

function computeRentValidation(property) {
  const unitCount = property.units?.length || 1;
  const marketRate = unitCount > 0 ? property.rent / unitCount : 0;
  const maxPerUnit = Math.floor(MAX_MONTHLY_RENT / unitCount);
  const currentMaxPerUnit = marketRate > 0 ? Math.round(marketRate * RENT_BOUNDS.maxMultiplier) : maxPerUnit;
  const grandfathered = Math.max(property.maxValidatedRentPerUnit || 0, property.rentPerUnit || 0);
  const effectiveMaxPerUnit = Math.max(currentMaxPerUnit, grandfathered);
  const currentRentPerUnit = property.rentPerUnit || 0;
  return {
    unitCount,
    marketRate,
    maxPerUnit,
    currentMaxPerUnit,
    grandfathered,
    effectiveMaxPerUnit,
    currentRentPerUnit,
  };
}

router.get('/:propertyId', authenticate, async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId).populate(
      'cityId',
      'name demandIndex supplyIndex growthRate economicCondition',
    );

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (!(await isAuthorizedForProperty(property, req.user._id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const rentValidation = computeRentValidation(property);
    const unitCount = rentValidation.unitCount;
    const perUnitRent = property.rentPerUnit || (unitCount > 0 ? Math.round(property.rent / unitCount) : 0);
    // Show the occupancy-adjusted income â€” this is what actually accrues to
    // the rent pool (same formula the engine uses every tick).
    const actualRentIncome = calculatePropertyRentIncome(property);
    const tier = MAINTENANCE_TIERS[property.maintenanceLevel] || MAINTENANCE_TIERS.none;
    const maintenanceCost = Math.round(actualRentIncome * tier.costPercentOfRent);
    const profit = calculateMonthlyProfit(actualRentIncome, property.maintenanceLevel, property.currentPrice, property);

    const currentOccupancy =
      property.occupancy || simulateOccupancy(property, property.cityId?.demandIndex, property.cityId?.supplyIndex);

    const gameState = await GameState.findOne({ key: 'global' });
    const currentTick = gameState?.tickNumber || 0;

    const baselineRent = property.rent || 0;
    const previousMonthRent = property.previousMonthRent || baselineRent;
    const monthlyIncrease = baselineRent - previousMonthRent;
    const monthlyIncreasePct = previousMonthRent > 0 ? (monthlyIncrease / previousMonthRent) * 100 : 0;

    res.json({
      propertyId: property._id,
      name: property.name,
      type: property.type,
      qualityScore: property.qualityScore || calculateQualityScore(property),
      maintenanceLevel: property.maintenanceLevel || 'none',
      occupancy: currentOccupancy,
      unitCount,
      perUnitRent,
      rentPerUnit: property.rentPerUnit || 0,
      rent: baselineRent,
      rentIncome: actualRentIncome,
      potentialRentIncome: unitCount * perUnitRent,
      maintenanceCost,
      operatingExpenses: profit.operatingExpenses,
      netProfit: profit.netProfit,
      netIncome: profit.netProfit,
      rentPotential: calculateRentPotential(property, property.cityId),
      maxMonthlyRent: MAX_MONTHLY_RENT,
      previousMonthRent,
      monthlyIncrease,
      monthlyIncreasePct: Math.round(monthlyIncreasePct * 100) / 100,
      currentPrice: property.currentPrice,
      condition: property.condition,
      currentTick,
      lastRentAdjustTick: property.lastRentAdjustTick || 0,
      lastRentGrowthTick: property.lastRentGrowthTick || 0,
      rentChangeAvailable: currentTick - (property.lastRentAdjustTick || 0) >= RENT_BOUNDS.rentChangeCooldownTicks,
      marketRate: Math.round(rentValidation.marketRate * 100) / 100,
      currentMaxPerUnit: rentValidation.currentMaxPerUnit,
      maxValidatedRentPerUnit: property.maxValidatedRentPerUnit || 0,
      effectiveMaxPerUnit: rentValidation.effectiveMaxPerUnit,
      nextAvailableIncrease: Math.max(
        0,
        Math.min(rentValidation.effectiveMaxPerUnit, rentValidation.maxPerUnit) - rentValidation.currentRentPerUnit,
      ),
      canIncreaseRent:
        rentValidation.currentRentPerUnit > 0 &&
        Math.max(
          0,
          Math.min(rentValidation.effectiveMaxPerUnit, rentValidation.maxPerUnit) - rentValidation.currentRentPerUnit,
        ) > 0,
      city: property.cityId
        ? {
            name: property.cityId.name,
            demandIndex: property.cityId.demandIndex,
            supplyIndex: property.cityId.supplyIndex,
          }
        : null,
      maintenanceTiers: Object.values(MAINTENANCE_TIERS).map((t) => ({
        id: t.id,
        label: t.label,
        costPercentOfRent: t.costPercentOfRent,
        monthlyCost: Math.round(actualRentIncome * t.costPercentOfRent),
        qualityDecayRate: t.qualityDecayRate,
        occupancyModifier: t.occupancyModifier,
      })),
    });
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/:propertyId/history', authenticate, async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (!(await isAuthorizedForProperty(property, req.user._id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const history = property.managementHistory || [];
    const limit = Math.min(history.length, parseInt(req.query.limit) || 30);
    res.json(history.slice(-limit));
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/:propertyId/rent', authenticate, async (req, res) => {
  try {
    const rentPerUnit = Number(req.body.rentPerUnit);

    if (!rentPerUnit || rentPerUnit <= 0 || !Number.isFinite(rentPerUnit)) {
      return res.status(400).json({ error: 'Invalid rent amount' });
    }

    const property = await Property.findById(req.params.propertyId);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (!(await isAuthorizedForProperty(property, req.user._id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const gameState = await GameState.findOne({ key: 'global' });
    const currentTick = gameState?.tickNumber || 0;

    if (currentTick - (property.lastRentAdjustTick || 0) < RENT_BOUNDS.rentChangeCooldownTicks) {
      return res.status(400).json({ error: 'Rent change cooldown active. Try again next month.' });
    }

    const { marketRate, maxPerUnit, effectiveMaxPerUnit } = computeRentValidation(property);

    if (rentPerUnit > maxPerUnit) {
      return res.status(400).json({
        error: `Rent per unit cannot exceed $${maxPerUnit.toLocaleString()} (maximum $${MAX_MONTHLY_RENT.toLocaleString()}/month)`,
      });
    }

    const minPerUnit = marketRate > 0 ? Math.round(marketRate * RENT_BOUNDS.minMultiplier) : 0;
    if (rentPerUnit < minPerUnit || rentPerUnit > effectiveMaxPerUnit) {
      return res.status(400).json({
        error: `Rent must be between ${minPerUnit} and ${effectiveMaxPerUnit} per unit`,
      });
    }

    property.rentPerUnit = Math.round(rentPerUnit);
    property.maxValidatedRentPerUnit = property.rentPerUnit;
    // Keep unit rents in sync so the rent engine accrues the adjusted amount
    if (property.units && property.units.length > 0) {
      for (const unit of property.units) {
        unit.rentPrice = Math.round(rentPerUnit);
      }
    }
    property.lastRentAdjustTick = currentTick;
    await property.save();

    res.json({
      rentPerUnit: property.rentPerUnit,
      lastRentAdjustTick: property.lastRentAdjustTick,
      maxValidatedRentPerUnit: property.maxValidatedRentPerUnit,
    });
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/:propertyId/maintenance', authenticate, async (req, res) => {
  try {
    const { level } = req.body;

    if (!level || !MAINTENANCE_TIERS[level]) {
      return res.status(400).json({ error: 'Invalid maintenance level' });
    }

    const property = await Property.findById(req.params.propertyId);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (!(await isAuthorizedForProperty(property, req.user._id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    property.maintenanceLevel = level;
    await property.save();

    const tier = MAINTENANCE_TIERS[level];
    const actualRentIncome = property.rent || 0;
    const monthlyCost = Math.round(actualRentIncome * tier.costPercentOfRent);

    res.json({
      maintenanceLevel: property.maintenanceLevel,
      monthlyCost,
      qualityDecayRate: tier.qualityDecayRate,
      occupancyModifier: tier.occupancyModifier,
    });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
