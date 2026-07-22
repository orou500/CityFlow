import { Router } from 'express';
import User from '../models/User.js';
import Property from '../models/Property.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import Event from '../models/Event.js';
import Loan from '../models/Loan.js';
import Season from '../models/Season.js';
import ConstructionProject from '../models/ConstructionProject.js';
import { getGameState } from '../models/GameState.js';
import { requireAdmin } from '../middleware/admin.js';
import { executeTick } from '../engine/tick.js';
import { DEVELOPMENT_PROJECTS } from '../config/developmentProjects.js';
import { getCurrentSeason, endCurrentSeasonAndStartNew, createNewSeason } from '../engine/seasonReset.js';
import { setMaintenanceMode, getMaintenanceInfo } from '../models/GameState.js';
import Notification from '../models/Notification.js';
import { sendEmail, verifyConnection } from '../services/email.js';
import emailTemplates from '../services/emailTemplates.js';
import { sendDiscordNotification } from '../services/discordBot.js';

const router = Router();

router.use(requireAdmin);

router.get('/overview', async (req, res) => {
  try {
    const [
      users,
      cities,
      properties,
      transactions,
      events,
      loans,
      constructionProjects,
      gameState,
      balanceResult,
      propertyValueResult,
    ] = await Promise.all([
      User.countDocuments(),
      City.countDocuments(),
      Property.countDocuments(),
      Transaction.countDocuments(),
      Event.countDocuments({ active: true }),
      Loan.countDocuments({ active: true }),
      ConstructionProject.countDocuments({ status: 'under_construction' }),
      getGameState(),
      User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
      Property.aggregate([{ $group: { _id: null, total: { $sum: '$currentPrice' } } }]),
    ]);

    const totalBalance = balanceResult[0]?.total || 0;
    const totalPropertyValue = propertyValueResult[0]?.total || 0;

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
    const now = new Date();
    const hours = [0, 6, 12, 18];
    let nextTickAt = null;
    for (const h of hours) {
      const candidate = new Date(now);
      candidate.setHours(h, 0, 0, 0);
      if (candidate > now) {
        nextTickAt = candidate;
        break;
      }
    }
    if (!nextTickAt) {
      nextTickAt = new Date(now);
      nextTickAt.setDate(nextTickAt.getDate() + 1);
      nextTickAt.setHours(hours[0], 0, 0, 0);
    }
    res.json({
      tickNumber: gameState.tickNumber,
      lastTickAt: gameState.lastTickAt,
      nextTickAt,
      tickIntervalMinutes: 360,
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
    const [users, propCounts] = await Promise.all([
      User.find().select('-password +deletedAt').sort({ createdAt: -1 }),
      Property.aggregate([{ $group: { _id: '$ownerId', count: { $sum: 1 } } }]),
    ]);
    const propCountMap = new Map(propCounts.map((p) => [p._id?.toString(), p.count]));
    const usersWithStats = users.map((u) => ({
      ...u.toObject(),
      propertyCount: propCountMap.get(u._id.toString()) || 0,
    }));
    res.json(usersWithStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:id/restore', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.deletedAt) return res.status(400).json({ error: 'Account is not deleted' });
    user.deletedAt = null;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Account restored' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id/permanent', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await User.deleteOne({ _id: user._id });
    res.json({ success: true, message: 'Account permanently deleted' });
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

router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }
    user.role = role;
    await user.save();
    res.json({ _id: user._id, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/properties', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const skip = (page - 1) * limit;
    const [properties, total] = await Promise.all([
      Property.find()
        .populate('ownerId', 'username')
        .populate('cityId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Property.countDocuments(),
    ]);
    res.json({ properties, total, page, pages: Math.ceil(total / limit) });
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
      cityId,
      type,
      name,
      basePrice,
      currentPrice: basePrice,
      rent: Math.round(basePrice * 0.004),
      ownerId: ownerId || null,
      forSale: true,
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
    const allowed = [
      'demandIndex',
      'supplyIndex',
      'population',
      'growthRate',
      'avgPrice',
      'avgRent',
      'economicCondition',
    ];
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
      name,
      description,
      type,
      impact: impact || {},
      affectedCities: affectedCities || [],
      duration: duration || 3,
      remainingTicks: duration || 3,
      active: true,
    });
    for (const cityId of affectedCities || []) {
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
          city.activeEvents = city.activeEvents.filter((e) => e.eventId.toString() !== event._id.toString());
          await city.save();
        }
      } else if (event.active && !wasActive) {
        const cities = await City.find({ _id: { $in: event.affectedCities } });
        for (const city of cities) {
          if (!city.activeEvents.some((e) => e.eventId.toString() === event._id.toString())) {
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
      catData.projects.map((p) => ({
        id: p.id,
        name: p.name,
        category: cat,
        baseCost: p.baseCost,
        constructionPeriods: p.constructionPeriods,
        unitsGenerated: p.unitsGenerated,
      })),
    );
    res.json(zones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seasons', async (req, res) => {
  try {
    const seasons = await Season.find().sort({ number: -1 });
    res.json(seasons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seasons/current', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json(null);
    res.json(season);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seasons/preview', async (req, res) => {
  try {
    const [totalUsers, totalProperties, totalTransactions, totalLoans, totalConstruction] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Transaction.countDocuments(),
      Loan.countDocuments({ active: true }),
      ConstructionProject.countDocuments({ status: 'under_construction' }),
    ]);

    res.json({
      willReset: {
        users: totalUsers,
        properties: totalProperties,
        transactions: totalTransactions,
        activeLoans: totalLoans,
        activeConstruction: totalConstruction,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/seasons/create', async (req, res) => {
  try {
    const activeSeason = await getCurrentSeason();
    if (activeSeason) {
      return res.status(400).json({ error: 'An active season already exists' });
    }
    const season = await createNewSeason();
    res.json({ message: `Season ${season.number} created`, season });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/seasons/end', async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== true) {
      return res.status(400).json({ error: 'Set confirm: true to end the current season' });
    }

    const activeSeason = await getCurrentSeason();
    if (!activeSeason) {
      return res.status(404).json({ error: 'No active season found' });
    }

    const newSeason = await endCurrentSeasonAndStartNew();

    res.json({
      message: `Season ${activeSeason.number} ended. Season ${newSeason.number} started.`,
      endedSeason: activeSeason.number,
      newSeason: newSeason.number,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/maintenance', async (req, res) => {
  try {
    const info = await getMaintenanceInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maintenance/enable', async (req, res) => {
  try {
    const { message } = req.body;
    await setMaintenanceMode(true, message, req.user._id);
    console.log(`[ADMIN] Maintenance Mode Enabled by ${req.user.username}`);
    await Notification.create({
      userId: null,
      type: 'system',
      title: 'Maintenance Mode Enabled',
      message: message || 'Maintenance mode has been enabled by an administrator.',
      global: true,
    });
    sendDiscordNotification({
      type: 'systemAlerts',
      title: 'Maintenance Mode Enabled',
      description: message || 'Maintenance mode has been enabled by an administrator.',
    }).catch(() => {});
    res.json({ enabled: true, message: message || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maintenance/disable', async (req, res) => {
  try {
    await setMaintenanceMode(false, '', req.user._id);
    console.log(`[ADMIN] Maintenance Mode Disabled by ${req.user.username}`);
    await Notification.create({
      userId: null,
      type: 'system',
      title: 'Maintenance Completed',
      message: 'Maintenance completed. Gameplay is available again.',
      global: true,
    });
    sendDiscordNotification({
      type: 'systemAlerts',
      title: 'Maintenance Completed',
      description: 'Maintenance completed. Gameplay is available again.',
    }).catch(() => {});
    res.json({ enabled: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email/test', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Email address is required' });

    await verifyConnection();

    const template = emailTemplates.testEmail({ timestamp: new Date().toISOString() });
    const result = await sendEmail({ to, ...template });

    if (result.sent) {
      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/email/status', async (req, res) => {
  try {
    const { config } = await import('../config/index.js');
    const configured = !!(config.smtp.user && config.smtp.pass);
    let connected = false;

    if (configured) {
      try {
        await verifyConnection();
        connected = true;
      } catch {
        connected = false;
      }
    }

    res.json({
      configured,
      connected,
      host: config.smtp.host,
      port: config.smtp.port,
      from: config.emailFrom,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
