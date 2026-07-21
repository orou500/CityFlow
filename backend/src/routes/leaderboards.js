import { Router } from 'express';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';
import CompetitiveEvent from '../models/CompetitiveEvent.js';
import User from '../models/User.js';
import Season from '../models/Season.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/rankings/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { season, limit = 50, offset = 0 } = req.query;

    const validCategories = ['netWorth', 'properties', 'passiveIncome', 'dealVolume', 'cityInfluence'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    let seasonNumber;
    if (season) {
      seasonNumber = parseInt(season, 10);
    } else {
      const activeSeason = await Season.findOne({ status: 'active' });
      seasonNumber = activeSeason ? activeSeason.number : 1;
    }

    const snapshot = await LeaderboardSnapshot.findOne({
      category,
      seasonNumber,
    }).sort({ tickNumber: -1 });

    if (!snapshot) {
      return res.json({ rankings: [], total: 0, category, seasonNumber });
    }

    const rankings = snapshot.rankings.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      rankings,
      total: snapshot.rankings.length,
      category,
      seasonNumber,
      tickNumber: snapshot.tickNumber,
      computedAt: snapshot.computedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my-rank', authenticate, async (req, res) => {
  try {
    const { category } = req.query;
    const userId = req.user.id;

    const validCategories = ['netWorth', 'properties', 'passiveIncome', 'dealVolume', 'cityInfluence'];
    const categories = category && validCategories.includes(category) ? [category] : validCategories;

    const activeSeason = await Season.findOne({ status: 'active' });
    const seasonNumber = activeSeason ? activeSeason.number : 1;

    const result = {};
    for (const cat of categories) {
      const snapshot = await LeaderboardSnapshot.findOne({
        category: cat,
        seasonNumber,
      }).sort({ tickNumber: -1 });

      if (!snapshot) {
        result[cat] = { rank: null, value: 0, previousRank: null, rankChange: 0, total: 0 };
        continue;
      }

      const entry = snapshot.rankings.find((r) => r.userId.toString() === userId);
      result[cat] = {
        rank: entry ? entry.rank : snapshot.rankings.length + 1,
        value: entry ? entry.value : 0,
        previousRank: entry ? entry.previousRank : null,
        rankChange: entry ? entry.rankChange : 0,
        total: snapshot.rankings.length,
      };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { season, limit = 20 } = req.query;

    const validCategories = ['netWorth', 'properties', 'passiveIncome', 'dealVolume', 'cityInfluence'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    let seasonNumber;
    if (season) {
      seasonNumber = parseInt(season, 10);
    } else {
      const activeSeason = await Season.findOne({ status: 'active' });
      seasonNumber = activeSeason ? activeSeason.number : 1;
    }

    const snapshots = await LeaderboardSnapshot.find({
      category,
      seasonNumber,
    })
      .sort({ tickNumber: -1 })
      .limit(Number(limit));

    res.json({
      history: snapshots.map((s) => ({
        tickNumber: s.tickNumber,
        computedAt: s.computedAt,
        topPlayer: s.rankings[0] || null,
        totalPlayers: s.rankings.length,
      })),
      category,
      seasonNumber,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/player/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      'username displayName avatar level xp balance ownedProperties achievements bio',
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const activeSeason = await Season.findOne({ status: 'active' });
    const seasonNumber = activeSeason ? activeSeason.number : 1;

    const ranks = {};
    for (const cat of ['netWorth', 'properties', 'passiveIncome', 'dealVolume', 'cityInfluence']) {
      const snapshot = await LeaderboardSnapshot.findOne({
        category: cat,
        seasonNumber,
      }).sort({ tickNumber: -1 });

      if (!snapshot) {
        ranks[cat] = { rank: null, value: 0 };
        continue;
      }

      const entry = snapshot.rankings.find((r) => r.userId.toString() === userId);
      ranks[cat] = {
        rank: entry ? entry.rank : null,
        value: entry ? entry.value : 0,
      };
    }

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        level: user.level,
        xp: user.xp,
        bio: user.bio,
        achievements: user.achievements,
        propertyCount: user.ownedProperties?.length || 0,
      },
      ranks,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/events', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && ['upcoming', 'active', 'completed'].includes(status)) {
      filter.status = status;
    }

    const events = await CompetitiveEvent.find(filter).sort({ startDate: -1 }).limit(50);

    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/events/:id', async (req, res) => {
  try {
    const event = await CompetitiveEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/events', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description, type, metric, startDate, endDate, minLevel, maxParticipants, rewards } = req.body;

    const activeSeason = await Season.findOne({ status: 'active' });

    const event = await CompetitiveEvent.create({
      name,
      description,
      type,
      metric,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      startTick: 0,
      endTick: 0,
      minLevel: minLevel || 1,
      maxParticipants: maxParticipants || 0,
      rewards: rewards || {},
      status: 'upcoming',
      createdFromSeason: activeSeason ? activeSeason.number : 1,
    });

    res.status(201).json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const activeSeason = await Season.findOne({ status: 'active' });
    const seasonNumber = activeSeason ? activeSeason.number : 1;

    const summary = {};
    for (const cat of ['netWorth', 'properties', 'passiveIncome', 'dealVolume', 'cityInfluence']) {
      const snapshot = await LeaderboardSnapshot.findOne({
        category: cat,
        seasonNumber,
      }).sort({ tickNumber: -1 });

      if (!snapshot || snapshot.rankings.length === 0) {
        summary[cat] = { topPlayer: null, totalPlayers: 0 };
        continue;
      }

      summary[cat] = {
        topPlayer: snapshot.rankings[0] || null,
        totalPlayers: snapshot.rankings.length,
        tickNumber: snapshot.tickNumber,
        computedAt: snapshot.computedAt,
      };
    }

    const activeEvents = await CompetitiveEvent.find({ status: 'active' }).sort({ startDate: -1 }).limit(5);

    res.json({ summary, activeEvents, seasonNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
