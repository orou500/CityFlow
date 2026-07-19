import { Router } from 'express';
import Property from '../models/Property.js';
import City from '../models/City.js';
import User from '../models/User.js';
import ConstructionProject from '../models/ConstructionProject.js';
import Transaction from '../models/Transaction.js';
import { authenticate } from '../middleware/auth.js';
import { getGameState } from '../models/GameState.js';
import { awardXp } from '../utils/leveling.js';
import {
  DEVELOPMENT_PROJECTS,
  calculateProjectCost,
  calculateUnitRent,
  getAllProjects,
} from '../config/developmentProjects.js';
import {
  IMPROVEMENT_PROJECTS,
  calculateImprovementCost,
  getRatingBonuses,
  getAvailableImprovements,
} from '../config/improvementProjects.js';
import {
  UPGRADE_TYPES,
  getUpgradePreview,
  calculateUpgradeCost,
  calculateUpgradeEffects,
  countUpgradesByType,
} from '../config/upgradeProjects.js';

const router = Router();

router.use(authenticate);

router.get('/options', async (req, res) => {
  try {
    const categories = [];
    for (const [catKey, catValue] of Object.entries(DEVELOPMENT_PROJECTS)) {
      const projects = catValue.projects.map((p) => ({
        ...p,
        estimatedCost: p.baseCost,
      }));
      categories.push({
        id: catKey,
        label: catValue.label,
        description: catValue.description,
        projects,
      });
    }
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/options/city/:cityId', async (req, res) => {
  try {
    const city = await City.findById(req.params.cityId);
    if (!city) return res.status(404).json({ error: 'City not found' });

    const { location } = req.query;

    const categories = [];
    for (const [catKey, catValue] of Object.entries(DEVELOPMENT_PROJECTS)) {
      const projects = catValue.projects.map((p) => ({
        ...p,
        estimatedCost: calculateProjectCost(p, city, location),
        constructionPeriods: p.constructionPeriods,
      }));
      categories.push({
        id: catKey,
        label: catValue.label,
        description: catValue.description,
        projects,
      });
    }
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/estimate', async (req, res) => {
  try {
    const { landId, projectType } = req.body;
    const land = await Property.findById(landId).populate('cityId');
    if (!land) return res.status(404).json({ error: 'Land not found' });
    if (land.type !== 'land') return res.status(400).json({ error: 'Property is not land' });

    const allProjects = getAllProjects();
    const project = allProjects.find((p) => p.id === projectType);
    if (!project) return res.status(400).json({ error: 'Invalid project type' });

    if (land.size && land.size < project.minLandSize) {
      return res.status(400).json({
        error: `Land too small. Minimum size required: ${project.minLandSize} sq ft`,
        minLandSize: project.minLandSize,
        landSize: land.size,
      });
    }

    const totalCost = calculateProjectCost(project, land.cityId, land.location);

    const estimatedUnitRent = calculateUnitRent(project, land.cityId, land.location, 0);

    const estimatedIncome = Math.round(estimatedUnitRent * project.unitsGenerated * 0.85);

    const estimatedMaintenance = Math.round(totalCost * project.maintenancePercent);

    res.json({
      projectType: project.id,
      projectName: project.name,
      category: project.category,
      totalCost,
      constructionPeriods: project.constructionPeriods,
      unitsGenerated: project.unitsGenerated,
      estimatedUnitRent: estimatedUnitRent,
      estimatedIncome,
      estimatedMaintenance,
      estimatedNetIncome: estimatedIncome - estimatedMaintenance,
      landSize: land.size,
      location: land.location,
      city: land.cityId?.name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my-land', async (req, res) => {
  try {
    const land = await Property.find({
      ownerId: req.user._id,
      type: 'land',
      developmentLevel: 0,
    }).populate('cityId', 'name country demandIndex supplyIndex');
    res.json(land);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/start', async (req, res) => {
  try {
    const { landId, projectType } = req.body;

    const land = await Property.findById(landId).populate('cityId');
    if (!land) return res.status(404).json({ error: 'Land not found' });
    if (land.type !== 'land') return res.status(400).json({ error: 'Property is not land' });
    if (!land.ownerId || land.ownerId.toString() !== req.user._id.toString()) {
      return res.status(400).json({ error: 'You do not own this land' });
    }
    if (land.developmentLevel > 0) {
      return res.status(400).json({ error: 'This land already has a building' });
    }

    const existingProject = await ConstructionProject.findOne({
      landId: land._id,
      status: { $in: ['planning', 'under_construction'] },
    });
    if (existingProject) {
      return res.status(400).json({ error: 'A construction project already exists for this land' });
    }

    const allProjects = getAllProjects();
    const project = allProjects.find((p) => p.id === projectType);
    if (!project) return res.status(400).json({ error: 'Invalid project type' });

    if (land.size && land.size < project.minLandSize) {
      return res.status(400).json({
        error: `Land too small. Minimum size required: ${project.minLandSize} sq ft`,
      });
    }

    const totalCost = calculateProjectCost(project, land.cityId, land.location);
    const gameState = await getGameState();
    const currentPeriod = gameState.tickNumber;

    const user = await User.findById(req.user._id);
    if (user.balance < totalCost) {
      return res.status(400).json({
        error: `Insufficient funds. Required: $${totalCost.toLocaleString()}, Balance: $${user.balance.toLocaleString()}`,
        required: totalCost,
        balance: user.balance,
        shortfall: totalCost - user.balance,
      });
    }

    user.balance -= totalCost;
    await user.save();

    await Transaction.create({
      buyerId: user._id,
      propertyId: land._id,
      price: totalCost,
      type: 'construction',
    });

    const constructionProject = await ConstructionProject.create({
      ownerId: user._id,
      landId: land._id,
      cityId: land.cityId._id,
      projectType: project.id,
      projectName: project.name,
      category: project.category,
      totalCost,
      investedAmount: totalCost,
      progress: 0,
      constructionPeriods: project.constructionPeriods,
      startPeriod: currentPeriod,
      completionPeriod: currentPeriod + project.constructionPeriods,
      status: 'under_construction',
    });

    land.developmentLevel = 1;
    land.forSale = false;
    await land.save();

    await awardXp(user, 15, 'construction_start');
    user.lifetimeStats.totalConstructionStarted += 1;
    await user.save();

    res.status(201).json({
      project: constructionProject,
      balance: user.balance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects', async (req, res) => {
  try {
    const projects = await ConstructionProject.find({ ownerId: req.user._id })
      .populate('landId', 'name location size')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const project = await ConstructionProject.findById(req.params.id)
      .populate('landId', 'name location size cityId')
      .populate('cityId', 'name country demandIndex');
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my-buildings', async (req, res) => {
  try {
    const buildings = await Property.find({
      ownerId: req.user._id,
      type: { $ne: 'land' },
    }).populate('cityId', 'name country');
    res.json(buildings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/upgrades/:propertyId', async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You do not own this property' });
    }
    if (property.type === 'land') {
      return res.status(400).json({ error: 'Only developed properties can be upgraded' });
    }

    const currentValue = property.currentPrice;
    const currentRent = property.rent || 0;
    const upgradeCounts = countUpgradesByType(property.upgrades || []);

    const upgrades = Object.keys(UPGRADE_TYPES).map((type) => {
      const currentLevel = upgradeCounts[type] || 0;
      return getUpgradePreview(type, currentValue, currentRent, currentLevel);
    });

    const user = await User.findById(req.user._id);
    res.json({
      upgrades,
      propertyValue: currentValue,
      currentRent,
      balance: user.balance,
      upgradeLevel: property.upgradeLevel || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upgrade', async (req, res) => {
  try {
    const { propertyId, upgradeType } = req.body;

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You do not own this property' });
    }
    if (property.type === 'land') {
      return res.status(400).json({ error: 'Only developed properties can be upgraded' });
    }

    const upgradeDef = UPGRADE_TYPES[upgradeType];
    if (!upgradeDef) return res.status(400).json({ error: 'Invalid upgrade type' });

    const gameState = await getGameState();
    const currentPeriod = gameState.tickNumber;

    const upgradeCounts = countUpgradesByType(property.upgrades || []);
    const currentLevel = upgradeCounts[upgradeType] || 0;
    const cost = calculateUpgradeCost(upgradeType, property.currentPrice, currentLevel);
    const effects = calculateUpgradeEffects(upgradeType, currentLevel);

    const user = await User.findById(req.user._id);
    if (user.balance < cost) {
      return res.status(400).json({ error: `Insufficient funds. Required: $${cost.toLocaleString()}` });
    }

    user.balance -= cost;
    await user.save();

    if (effects.valueBoost) {
      property.currentPrice = Math.round(property.currentPrice * (1 + effects.valueBoost));
      property.basePrice = Math.round(property.basePrice * (1 + effects.valueBoost * 0.5));
    }

    if (effects.rentBoost) {
      const oldRent = property.rent || 0;
      property.rent = Math.round(oldRent * (1 + effects.rentBoost));
      if (property.units && property.units.length > 0) {
        for (const unit of property.units) {
          unit.rentPrice = Math.round(unit.rentPrice * (1 + effects.rentBoost));
        }
      }
    }

    if (effects.conditionBoost) {
      property.condition = Math.min(100, (property.condition || 100) + effects.conditionBoost);
    }

    if (effects.unitBoost && property.units) {
      const newUnitsCount = Math.max(1, Math.round(property.units.length * effects.unitBoost));
      for (let i = 0; i < newUnitsCount; i++) {
        const lastUnit = property.units[property.units.length - 1] || { unitNumber: 0 };
        const avgRent = property.units.reduce((s, u) => s + u.rentPrice, 0) / property.units.length;
        property.units.push({
          unitNumber: lastUnit.unitNumber + 1,
          type: property.units[0]?.type || 'apartment',
          rentPrice: Math.round(avgRent),
          occupied: false,
        });
      }
    }

    if (!property.upgrades) property.upgrades = [];
    property.upgrades.push({
      name: upgradeType,
      appliedAt: currentPeriod,
      effect: effects,
    });
    property.lastUpgrade = upgradeType;
    property.upgradeLevel = (property.upgradeLevel || 0) + 1;

    if (!property.investmentHistory) property.investmentHistory = [];
    property.investmentHistory.push({
      type: 'upgrade',
      amount: cost,
      tick: currentPeriod,
      description: `${upgradeDef.name} (Level ${currentLevel + 1})`,
    });

    await property.save();

    await Transaction.create({
      buyerId: user._id,
      propertyId: property._id,
      price: cost,
      type: 'upgrade',
    });

    await awardXp(user, 10, 'upgrade');
    user.lifetimeStats.totalUpgrades += 1;
    await user.save();

    res.json({ property, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/improvements/options', async (req, res) => {
  try {
    const improvements = Object.values(IMPROVEMENT_PROJECTS).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      constructionPeriods: p.constructionPeriods,
      baseCostPercent: p.baseCostPercent,
      valueBonus: p.valueBonus,
      rentBonus: p.rentBonus,
      conditionBonus: p.conditionBonus,
      demandBonus: p.demandBonus,
    }));
    res.json(improvements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/improvements/requirements/:propertyId', async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const user = await User.findById(req.user._id);
    const requirements = [];

    requirements.push({
      id: 'ownership',
      label: 'Property is owned by you',
      met: !!(property.ownerId && property.ownerId.toString() === req.user._id.toString()),
    });

    requirements.push({
      id: 'type',
      label: 'Property is not land',
      met: property.type !== 'land',
    });

    let hasStaleImprovement = false;
    let activeImprovementName = null;
    if (property.activeImprovement && property.activeImprovement.improvementId) {
      if (property.activeImprovement.completionPeriod) {
        const gameState = await getGameState();
        const currentPeriod = gameState.tickNumber;
        if (currentPeriod > property.activeImprovement.completionPeriod) {
          hasStaleImprovement = true;
        } else {
          activeImprovementName = property.activeImprovement.name;
        }
      } else {
        activeImprovementName = property.activeImprovement.name;
      }
    }

    requirements.push({
      id: 'no_active',
      label: 'No improvement already in progress',
      met: !activeImprovementName,
      detail: activeImprovementName ? `${activeImprovementName} in progress` : null,
    });

    if (!hasStaleImprovement && activeImprovementName) {
      requirements.push({
        id: 'balance',
        label: 'Sufficient funds',
        met: false,
        detail: 'Waiting for current improvement to complete',
      });
    } else {
      const lowestCost = Object.values(IMPROVEMENT_PROJECTS).reduce((min, p) => {
        const c = calculateImprovementCost(p, property.currentPrice);
        return c < min ? c : min;
      }, Infinity);
      requirements.push({
        id: 'balance',
        label: `Sufficient funds (cheapest: $${lowestCost.toLocaleString()})`,
        met: user ? user.balance >= lowestCost : false,
        detail: user && user.balance < lowestCost ? `Your balance: $${user.balance.toLocaleString()}` : null,
      });
    }

    const completedIds = (property.improvements || []).map((i) => i.improvementId);
    const available = getAvailableImprovements(property.improvements || []);

    requirements.push({
      id: 'improvements_available',
      label: 'Improvements available',
      met: available.length > 0,
      detail: available.length === 0 ? 'All improvements completed' : null,
    });

    res.json({
      requirements,
      canImprove: requirements.every((r) => r.met),
      propertyRating: property.propertyRating || 'standard',
      completedCount: completedIds.length,
      totalImprovements: Object.keys(IMPROVEMENT_PROJECTS).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/improvements/available/:propertyId', async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You do not own this property' });
    }
    if (property.type === 'land') {
      return res.status(400).json({ error: 'Only developed properties can be improved' });
    }

    if (
      property.activeImprovement &&
      property.activeImprovement.improvementId &&
      property.activeImprovement.completionPeriod
    ) {
      const gameState = await getGameState();
      const currentPeriod = gameState.tickNumber;
      if (currentPeriod > property.activeImprovement.completionPeriod) {
        property.activeImprovement = undefined;
        await property.save();
      }
    }

    const available = getAvailableImprovements(property.improvements || []);
    const cost = calculateImprovementCost(available[0] || IMPROVEMENT_PROJECTS.renovation, property.currentPrice);

    res.json({
      available,
      completedCount: (property.improvements || []).length,
      propertyRating: property.propertyRating || 'standard',
      nextImprovementCost: cost,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/improvements/status/:propertyId', async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const gameState = await getGameState();
    const currentPeriod = gameState.tickNumber;

    if (
      property.activeImprovement &&
      property.activeImprovement.improvementId &&
      property.activeImprovement.completionPeriod
    ) {
      if (currentPeriod > property.activeImprovement.completionPeriod) {
        property.activeImprovement = undefined;
        await property.save();
      }
    } else if (property.activeImprovement && !property.activeImprovement.improvementId) {
      property.activeImprovement = undefined;
      await property.save();
    }

    res.json({
      propertyRating: property.propertyRating || 'standard',
      improvements: property.improvements || [],
      activeImprovement: property.activeImprovement || null,
      ratingBonuses: getRatingBonuses(property.propertyRating || 'standard'),
      currentPrice: property.currentPrice || 0,
      currentPeriod,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/improvements/start', async (req, res) => {
  try {
    const { propertyId, improvementId } = req.body;

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You do not own this property' });
    }
    if (property.type === 'land') {
      return res.status(400).json({ error: 'Only developed properties can be improved' });
    }

    if (property.activeImprovement && property.activeImprovement.improvementId) {
      const gameState = await getGameState();
      const currentPeriod = gameState.tickNumber;
      if (property.activeImprovement.completionPeriod && currentPeriod > property.activeImprovement.completionPeriod) {
        property.activeImprovement = undefined;
        await property.save();
      } else {
        return res.status(400).json({ error: 'An improvement is already in progress' });
      }
    }

    const improvement = IMPROVEMENT_PROJECTS[improvementId];
    if (!improvement) return res.status(400).json({ error: 'Invalid improvement type' });

    const completedIds = (property.improvements || []).map((i) => i.improvementId);
    if (completedIds.includes(improvementId)) {
      return res.status(400).json({ error: 'This improvement has already been completed' });
    }

    const cost = calculateImprovementCost(improvement, property.currentPrice);
    const gameState = await getGameState();
    const currentPeriod = gameState.tickNumber;

    const user = await User.findById(req.user._id);
    if (user.balance < cost) {
      return res.status(400).json({
        error: `Insufficient funds. Required: $${cost.toLocaleString()}, Balance: $${user.balance.toLocaleString()}`,
        required: cost,
        balance: user.balance,
        shortfall: cost - user.balance,
      });
    }

    user.balance -= cost;
    await user.save();

    await Transaction.create({
      buyerId: user._id,
      propertyId: property._id,
      price: cost,
      type: 'improvement',
    });

    property.activeImprovement = {
      improvementId: improvement.id,
      name: improvement.name,
      startedAt: new Date(),
      startPeriod: currentPeriod,
      completionPeriod: currentPeriod + improvement.constructionPeriods,
      progress: 0,
    };

    if (!property.investmentHistory) property.investmentHistory = [];
    property.investmentHistory.push({
      type: 'improvement',
      amount: cost,
      tick: currentPeriod,
      description: improvement.name,
    });

    await property.save();

    await awardXp(user, 10, 'improvement_start');

    res.status(201).json({
      improvement: property.activeImprovement,
      balance: user.balance,
      completionPeriod: currentPeriod + improvement.constructionPeriods,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
