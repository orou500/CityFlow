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
      developmentLevel: { $gte: 1 },
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
    if (property.developmentLevel < 1) {
      return res.status(400).json({ error: 'Only developed properties can be upgraded' });
    }

    const UPGRADES = {
      renovation: { costPercent: 0.1, valueBoost: 0.05, rentBoost: 0.2, conditionBoost: 10 },
      security: { costPercent: 0.05, valueBoost: 0.03, rentBoost: 0.05, riskReduction: true },
      luxury: { costPercent: 0.2, valueBoost: 0.1, rentBoost: 0.35, conditionBoost: 5 },
      expansion: { costPercent: 0.3, valueBoost: 0.15, rentBoost: 0.25, unitBoost: 0.1 },
    };

    const currentRent = property.rent || 0;
    const currentValue = property.currentPrice;

    const upgrades = Object.entries(UPGRADES).map(([type, def]) => {
      const cost = Math.round(currentValue * def.costPercent);
      const projectedValue = Math.round(currentValue * (1 + (def.valueBoost || 0)));
      const projectedRent = Math.round(currentRent * (1 + (def.rentBoost || 0)));
      const rentIncrease = projectedRent - currentRent;

      return {
        type,
        cost,
        valueBoost: def.valueBoost || 0,
        rentBoost: def.rentBoost || 0,
        conditionBoost: def.conditionBoost || 0,
        unitBoost: def.unitBoost || 0,
        riskReduction: !!def.riskReduction,
        projectedValue,
        projectedRent,
        rentIncrease,
      };
    });

    const user = await User.findById(req.user._id);
    res.json({ upgrades, propertyValue: currentValue, currentRent, balance: user.balance });
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
    if (property.developmentLevel < 1) {
      return res.status(400).json({ error: 'Only developed properties can be upgraded' });
    }

    const gameState = await getGameState();
    const currentPeriod = gameState.tickNumber;

    const UPGRADES = {
      renovation: { costPercent: 0.1, valueBoost: 0.05, rentBoost: 0.2, conditionBoost: 10 },
      security: { costPercent: 0.05, valueBoost: 0.03, rentBoost: 0.05, riskReduction: true },
      luxury: { costPercent: 0.2, valueBoost: 0.1, rentBoost: 0.35, conditionBoost: 5 },
      expansion: { costPercent: 0.3, valueBoost: 0.15, rentBoost: 0.25, unitBoost: 0.1 },
    };

    const upgrade = UPGRADES[upgradeType];
    if (!upgrade) return res.status(400).json({ error: 'Invalid upgrade type' });

    const cost = Math.round(property.currentPrice * upgrade.costPercent);
    const user = await User.findById(req.user._id);
    if (user.balance < cost) {
      return res.status(400).json({ error: `Insufficient funds. Required: $${cost.toLocaleString()}` });
    }

    user.balance -= cost;
    await user.save();

    if (upgrade.valueBoost) {
      property.currentPrice = Math.round(property.currentPrice * (1 + upgrade.valueBoost));
    }

    if (upgrade.rentBoost) {
      const oldRent = property.rent || 0;
      property.rent = Math.round(oldRent * (1 + upgrade.rentBoost));
      if (property.units && property.units.length > 0) {
        for (const unit of property.units) {
          unit.rentPrice = Math.round(unit.rentPrice * (1 + upgrade.rentBoost));
        }
      }
    }

    if (upgrade.conditionBoost) {
      property.condition = Math.min(100, (property.condition || 100) + upgrade.conditionBoost);
    }

    if (upgrade.unitBoost && property.units) {
      const newUnitsCount = Math.round(property.units.length * upgrade.unitBoost);
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
      effect: upgrade,
    });
    property.lastUpgrade = upgradeType;
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

export default router;
