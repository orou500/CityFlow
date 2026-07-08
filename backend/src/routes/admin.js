import { Router } from 'express';
import User from '../models/User.js';
import Property from '../models/Property.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import Event from '../models/Event.js';
import Loan from '../models/Loan.js';
import ConstructionProject from '../models/ConstructionProject.js';
import { getGameState } from '../models/GameState.js';
import { requireAdmin } from '../middleware/admin.js';
import { executeTick } from '../engine/tick.js';
import { DEVELOPMENT_PROJECTS } from '../config/developmentProjects.js';

const router = Router();

router.use(requireAdmin);

router.get('/overview', async (req, res) => {
  try {
    const [users, cities, properties, transactions, events, loans, constructionProjects, gameState] = await Promise.all([
      User.countDocuments(),
      City.countDocuments(),
      Property.countDocuments(),
      Transaction.countDocuments(),
      Event.countDocuments({ active: true }),
      Loan.countDocuments({ active: true }),
      ConstructionProject.countDocuments({ status: 'under_construction' }),
      getGameState(),
    ]);

    const allUsers = await User.find();
    const totalBalance = allUsers.reduce((s, u) => s + u.balance, 0);
    const allProperties = await Property.find();
    const totalPropertyValue = allProperties.reduce((s, p) => s + p.currentPrice, 0);

    res.json({
      totalUsers: users,
      totalCities: cities,
      totalProperties: properties,
      totalTransactions: transactions,
      activeEvents: events,
      activeLoans: loans,
      activeConstructionProjects: constructionProjects,
      totalMoneyInCirculation: totalBalance + totalPropertyValue,
      tickNumber: gameState.tickNumber,
      lastTickAt: gameState.lastTickAt,
      lastTickDuration: gameState.lastTickDuration,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ticks', async (req, res) => {
  try {
    const gameState = await getGameState();
    const nextTickAt = gameState.lastTickAt
      ? new Date(gameState.lastTickAt.getTime() + parseInt(process.env.TICK_INTERVAL_MINUTES || '60') * 60000)
      : null;
    res.json({
      tickNumber: gameState.tickNumber,
      lastTickAt: gameState.lastTickAt,
      nextTickAt,
      tickIntervalMinutes: parseInt(process.env.TICK_INTERVAL_MINUTES || '60'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tick/run', async (req, res) => {
  try {
    const { count = 1 } = req.body;
    const maxTicks = Math.min(Math.max(1, count), 50);
    const results = [];
    for (let i = 0; i < maxTicks; i++) {
      const result = await executeTick();
      results.push(result);
    }
    res.json({ ticksExecuted: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    const usersWithStats = await Promise.all(users.map(async (u) => {
      const propCount = await Property.countDocuments({ ownerId: u._id });
      return { ...u.toObject(), propertyCount: propCount };
    }));
    res.json(usersWithStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/balance', async (req, res) => {
  try {
    const { balance } = req.body;
    if (balance == null || balance < 0) {
      return res.status(400).json({ error: 'Invalid balance' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { balance }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/ban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.banned = !user.banned;
    await user.save();
    res.json({ _id: user._id, username: user.username, banned: user.banned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/properties', async (req, res) => {
  try {
    const properties = await Property.find().populate('ownerId', 'username').populate('cityId', 'name').sort({ createdAt: -1 });
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/properties', async (req, res) => {
  try {
    const { cityId, type, name, basePrice, ownerId } = req.body;
    if (!cityId || !type || !name || !basePrice) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const property = await Property.create({
      cityId, type, name, basePrice, currentPrice: basePrice,
      rent: Math.round(basePrice * 0.004), ownerId: ownerId || null, forSale: true,
    });
    if (ownerId) {
      await User.findByIdAndUpdate(ownerId, { $push: { ownedProperties: property._id } });
    }
    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/properties/:id', async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (property.ownerId) {
      await User.findByIdAndUpdate(property.ownerId, { $pull: { ownedProperties: property._id } });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/properties/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['currentPrice', 'basePrice', 'rent', 'condition', 'forSale', 'ownerId', 'volatility'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const property = await Property.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/cities/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['demandIndex', 'supplyIndex', 'population', 'growthRate', 'avgPrice'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const city = await City.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!city) return res.status(404).json({ error: 'City not found' });
    res.json(city);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/events', async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/events', async (req, res) => {
  try {
    const { name, description, type, impact, affectedCities, duration } = req.body;
    const event = await Event.create({
      name, description, type, impact: impact || {},
      affectedCities: affectedCities || [],
      duration: duration || 3,
      remainingTicks: duration || 3,
      active: true,
    });
    for (const cityId of (affectedCities || [])) {
      await City.findByIdAndUpdate(cityId, {
        $push: { activeEvents: { eventId: event._id, remainingTicks: duration || 3 } },
      });
    }
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.body.active !== undefined) {
      const wasActive = event.active;
      event.active = req.body.active;
      if (!event.active && wasActive) {
        const cities = await City.find({ 'activeEvents.eventId': event._id });
        for (const city of cities) {
          city.activeEvents = city.activeEvents.filter(e => e.eventId.toString() !== event._id.toString());
          await city.save();
        }
      } else if (event.active && !wasActive) {
        const cities = await City.find({ _id: { $in: event.affectedCities } });
        for (const city of cities) {
          if (!city.activeEvents.some(e => e.eventId.toString() === event._id.toString())) {
            city.activeEvents.push({ eventId: event._id, remainingTicks: event.remainingTicks });
            await city.save();
          }
        }
      }
    }
    await event.save();
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/construction-projects', async (req, res) => {
  try {
    const projects = await ConstructionProject.find()
      .populate('ownerId', 'username')
      .populate('landId', 'name location')
      .populate('cityId', 'name country')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/construction-projects/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['progress', 'status', 'totalCost', 'delayTicks'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const project = await ConstructionProject.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!project) return res.status(404).json({ error: 'Construction project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/construction-projects/trigger-event', async (req, res) => {
  try {
    const { cityId, eventType } = req.body;
    const filter = cityId ? { cityId, status: 'under_construction' } : { status: 'under_construction' };
    const projects = await ConstructionProject.find(filter);

    const eventTemplates = {
      material_shortage: { delayTicks: 5, label: 'Material Shortage' },
      budget_increase: { costIncreasePercent: 10, label: 'Budget Increase' },
      labor_strike: { delayTicks: 8, label: 'Labor Strike' },
      weather_delay: { delayTicks: 3, label: 'Weather Delay' },
      permit_issue: { delayTicks: 6, label: 'Permit Issue' },
    };

    const event = eventTemplates[eventType];
    if (!event) return res.status(400).json({ error: 'Invalid event type' });

    const updated = [];
    for (const project of projects) {
      if (event.delayTicks) {
        project.delayTicks = (project.delayTicks || 0) + event.delayTicks;
        project.constructionPeriods += event.delayTicks;
      }
      if (event.costIncreasePercent) {
        const increase = Math.round(project.totalCost * (event.costIncreasePercent / 100));
        project.totalCost += increase;
      }
      await project.save();
      updated.push({ projectId: project._id, projectName: project.projectName });
    }

    res.json({
      eventApplied: event.label,
      affectedProjects: updated.length,
      projects: updated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/development-zones', async (req, res) => {
  try {
    const zones = Object.entries(DEVELOPMENT_PROJECTS).flatMap(([cat, catData]) =>
      catData.projects.map(p => ({
        id: p.id,
        name: p.name,
        category: cat,
        baseCost: p.baseCost,
        constructionPeriods: p.constructionPeriods,
        unitsGenerated: p.unitsGenerated,
      }))
    );
    res.json(zones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
