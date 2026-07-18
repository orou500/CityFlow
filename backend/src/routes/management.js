import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import Property from '../models/Property.js';
import GameState from '../models/GameState.js';
import {
  MAINTENANCE_TIERS,
  RENT_BOUNDS,
  calculateMonthlyProfit,
  calculateQualityScore,
  simulateOccupancy,
} from '../config/propertyManagement.js';

const router = Router();

router.get('/:propertyId', authenticate, async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId).populate(
      'cityId',
      'name demandIndex supplyIndex growthRate',
    );

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (!property.ownerId || property.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const unitCount = property.units?.length || 1;
    const perUnitRent = property.rentPerUnit || (unitCount > 0 ? Math.round(property.rent / unitCount) : 0);
    const actualRentIncome = property.rent || 0;
    const tier = MAINTENANCE_TIERS[property.maintenanceLevel] || MAINTENANCE_TIERS.none;
    const maintenanceCost = Math.round(actualRentIncome * tier.costPercentOfRent);
    const profit = calculateMonthlyProfit(actualRentIncome, property.maintenanceLevel, property.currentPrice);

    const currentOccupancy = property.occupancy || simulateOccupancy(
      property,
      property.cityId?.demandIndex,
      property.cityId?.supplyIndex,
    );

    const gameState = await GameState.findOne({ key: 'global' });
    const currentTick = gameState?.tickNumber || 0;

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
      rentIncome: actualRentIncome,
      potentialRentIncome: unitCount * perUnitRent,
      maintenanceCost,
      netProfit: profit.netProfit,
      currentPrice: property.currentPrice,
      condition: property.condition,
      currentTick,
      lastRentAdjustTick: property.lastRentAdjustTick || 0,
      rentChangeAvailable: currentTick - (property.lastRentAdjustTick || 0) >= RENT_BOUNDS.rentChangeCooldownTicks,
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
    res.status(500).json({ error: err.message });
  }
});

router.get('/:propertyId/history', authenticate, async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (!property.ownerId || property.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const history = property.managementHistory || [];
    const limit = Math.min(history.length, parseInt(req.query.limit) || 30);
    res.json(history.slice(-limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    if (!property.ownerId || property.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const gameState = await GameState.findOne({ key: 'global' });
    const currentTick = gameState?.tickNumber || 0;

    if (currentTick - (property.lastRentAdjustTick || 0) < RENT_BOUNDS.rentChangeCooldownTicks) {
      return res.status(400).json({ error: 'Rent change cooldown active. Try again next month.' });
    }

    const unitCount = property.units?.length || 1;
    const marketRate = unitCount > 0 ? property.rent / unitCount : 0;

    if (marketRate > 0) {
      const multiplier = rentPerUnit / marketRate;
      if (multiplier < RENT_BOUNDS.minMultiplier || multiplier > RENT_BOUNDS.maxMultiplier) {
        return res.status(400).json({
          error: `Rent must be between ${Math.round(marketRate * RENT_BOUNDS.minMultiplier)} and ${Math.round(marketRate * RENT_BOUNDS.maxMultiplier)} per unit`,
        });
      }
    }

    property.rentPerUnit = Math.round(rentPerUnit);
    property.lastRentAdjustTick = currentTick;
    await property.save();

    res.json({
      rentPerUnit: property.rentPerUnit,
      lastRentAdjustTick: property.lastRentAdjustTick,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    if (!property.ownerId || property.ownerId.toString() !== req.user.id) {
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
