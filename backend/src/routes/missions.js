import express from 'express';
import MissionProgress from '../models/MissionProgress.js';
import {
  MISSION_DEFINITIONS,
  MISSION_CATEGORIES,
  MISSION_TYPES,
  getMissionById,
  getChainMissions,
  getVisibleMissions,
} from '../config/missions.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  initializeMissionsForUser,
  claimMissionReward,
  getMissionDashboard,
  processMissionReset,
} from '../engine/missionProcessing.js';
import { cacheGet, cacheSet, cacheDel } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';

const router = express.Router();

const claimRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Too many claims. Please try again later.',
});

router.get('/definitions', authenticate, async (req, res) => {
  try {
    const { category, type } = req.query;
    let missions = getVisibleMissions();
    if (category) missions = missions.filter((m) => m.category === category);
    if (type) missions = missions.filter((m) => m.type === type);
    res.json({ success: true, missions, categories: MISSION_CATEGORIES, types: MISSION_TYPES });
  } catch (err) {
    console.error('[MISSIONS] Error fetching definitions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch mission definitions' });
  }
});

router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const cached = await cacheGet(cacheKeys.missionDashboard(userId.toString()));
    if (cached) return res.json({ success: true, ...cached });

    await initializeMissionsForUser(userId);
    const dashboard = await getMissionDashboard(userId);

    await cacheSet(cacheKeys.missionDashboard(userId.toString()), dashboard, 30);
    res.json({ success: true, ...dashboard });
  } catch (err) {
    console.error('[MISSIONS] Error fetching dashboard:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch mission dashboard' });
  }
});

router.get('/active', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const { category, difficulty } = req.query;

    const filter = { userId, status: 'active' };
    let progresses = await MissionProgress.find(filter).lean();

    progresses = progresses
      .map((mp) => {
        const def = getMissionById(mp.missionId);
        return { ...mp, definition: def };
      })
      .filter((m) => m.definition);

    if (category) progresses = progresses.filter((m) => m.definition.category === category);
    if (difficulty) progresses = progresses.filter((m) => m.definition.difficulty === difficulty);

    res.json({ success: true, missions: progresses });
  } catch (err) {
    console.error('[MISSIONS] Error fetching active missions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch active missions' });
  }
});

router.get('/completed', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const progresses = await MissionProgress.find({
      userId,
      status: 'completed',
    })
      .sort({ completedAt: -1 })
      .lean();

    const enriched = progresses
      .map((mp) => {
        const def = getMissionById(mp.missionId);
        return { ...mp, definition: def };
      })
      .filter((m) => m.definition);

    res.json({ success: true, missions: enriched });
  } catch (err) {
    console.error('[MISSIONS] Error fetching completed missions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch completed missions' });
  }
});

router.get('/claimed', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const progresses = await MissionProgress.find({
      userId,
      status: 'claimed',
    })
      .sort({ claimedAt: -1 })
      .lean();

    const enriched = progresses
      .map((mp) => {
        const def = getMissionById(mp.missionId);
        return { ...mp, definition: def };
      })
      .filter((m) => m.definition);

    res.json({ success: true, missions: enriched });
  } catch (err) {
    console.error('[MISSIONS] Error fetching claimed missions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch claimed missions' });
  }
});

router.get('/chain/:chainId', authenticate, async (req, res) => {
  try {
    const { chainId } = req.params;
    const chainDefs = getChainMissions(chainId);
    if (chainDefs.length === 0) {
      return res.status(404).json({ success: false, error: 'Mission chain not found' });
    }

    const userId = req.user._id;
    const chainIds = chainDefs.map((d) => d.id);
    const progresses = await MissionProgress.find({
      userId,
      missionId: { $in: chainIds },
    }).lean();

    const progressMap = new Map(progresses.map((p) => [p.missionId, p]));

    const chain = chainDefs.map((def) => ({
      definition: def,
      progress: progressMap.get(def.id) || null,
      status: progressMap.get(def.id)?.status || 'locked',
    }));

    res.json({ success: true, chain, chainId });
  } catch (err) {
    console.error('[MISSIONS] Error fetching chain:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch mission chain' });
  }
});

router.get('/chains', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;

    const chainMap = new Map();
    for (const def of MISSION_DEFINITIONS) {
      if (!def.chainId || def.hidden) continue;
      if (!chainMap.has(def.chainId)) {
        chainMap.set(def.chainId, []);
      }
      chainMap.get(def.chainId).push(def);
    }

    const allChainMissionIds = MISSION_DEFINITIONS.filter((m) => m.chainId && !m.hidden).map((m) => m.id);
    const progresses = await MissionProgress.find({
      userId,
      missionId: { $in: allChainMissionIds },
    }).lean();
    const progressMap = new Map(progresses.map((p) => [p.missionId, p]));

    const chains = [];
    for (const [chainId, chainDefs] of chainMap) {
      const sorted = chainDefs.sort((a, b) => (a.chainOrder || 0) - (b.chainOrder || 0));
      const firstDef = sorted[0];

      const steps = sorted.map((def) => {
        const mp = progressMap.get(def.id);
        return {
          missionId: def.id,
          name: def.name,
          description: def.description,
          icon: def.icon,
          rewards: def.rewards,
          status: mp?.status || 'locked',
          progress: mp?.progress || 0,
          target: def.condition.target,
          completedAt: mp?.completedAt || null,
          claimedAt: mp?.claimedAt || null,
        };
      });

      const claimedCount = steps.filter((s) => s.status === 'claimed').length;
      const completedCount = steps.filter((s) => s.status === 'completed' || s.status === 'claimed').length;
      const activeStep = steps.find((s) => s.status === 'active');

      chains.push({
        chainId,
        name: firstDef?.name?.split(' — ')[0] || chainId,
        description: firstDef?.description || '',
        icon: firstDef?.icon || '🔗',
        unlockLevel: firstDef?.unlockLevel || 1,
        steps,
        totalSteps: steps.length,
        completedSteps: completedCount,
        currentStep: activeStep ? steps.indexOf(activeStep) : claimedCount,
        status: claimedCount === steps.length ? 'completed' : activeStep ? 'active' : 'locked',
      });
    }

    chains.sort((a, b) => (a.unlockLevel || 0) - (b.unlockLevel || 0));

    res.json({ success: true, chains });
  } catch (err) {
    console.error('[MISSIONS] Error fetching chains:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch mission chains' });
  }
});

router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const allProgress = await MissionProgress.find({ userId }).lean();

    const stats = {
      totalActive: allProgress.filter((p) => p.status === 'active').length,
      totalCompleted: allProgress.filter((p) => p.status === 'completed').length,
      totalClaimed: allProgress.filter((p) => p.status === 'claimed').length,
      totalXpEarned: allProgress
        .filter((p) => p.status === 'claimed')
        .reduce((sum, p) => sum + (p.rewardsClaimed?.xp || 0), 0),
      totalBalanceEarned: allProgress
        .filter((p) => p.status === 'claimed')
        .reduce((sum, p) => sum + (p.rewardsClaimed?.balance || 0), 0),
      completionRate:
        allProgress.length > 0
          ? Math.round((allProgress.filter((p) => p.status === 'claimed').length / allProgress.length) * 100)
          : 0,
      byCategory: {},
      byDifficulty: {},
    };

    for (const cat of MISSION_CATEGORIES) {
      const catMissions = MISSION_DEFINITIONS.filter((m) => m.category === cat && !m.hidden);
      const catProgress = allProgress.filter((p) => catMissions.some((m) => m.id === p.missionId));
      stats.byCategory[cat] = {
        total: catMissions.length,
        completed: catProgress.filter((p) => p.status === 'claimed').length,
      };
    }

    for (const diff of ['easy', 'medium', 'hard', 'expert', 'legendary']) {
      const diffMissions = MISSION_DEFINITIONS.filter((m) => m.difficulty === diff && !m.hidden);
      const diffProgress = allProgress.filter((p) => diffMissions.some((m) => m.id === p.missionId));
      stats.byDifficulty[diff] = {
        total: diffMissions.length,
        completed: diffProgress.filter((p) => p.status === 'claimed').length,
      };
    }

    res.json({ success: true, stats });
  } catch (err) {
    console.error('[MISSIONS] Error fetching stats:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch mission stats' });
  }
});

router.post('/claim/:missionId', authenticate, claimRateLimit, async (req, res) => {
  try {
    const { missionId } = req.params;
    const result = await claimMissionReward(req.user._id, missionId);

    await cacheDel(cacheKeys.missionDashboard(req.user._id.toString()));

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[MISSIONS] Error claiming reward:', err);
    res.status(400).json({ success: false, error: err.message || 'Failed to claim reward' });
  }
});

router.post('/refresh', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const created = await initializeMissionsForUser(userId);
    await cacheDel(cacheKeys.missionDashboard(userId.toString()));
    res.json({ success: true, initialized: created });
  } catch (err) {
    console.error('[MISSIONS] Error refreshing missions:', err);
    res.status(500).json({ success: false, error: 'Failed to refresh missions' });
  }
});

router.post('/admin/reset-periods', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    const result = await processMissionReset();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[MISSIONS] Error resetting periods:', err);
    res.status(500).json({ success: false, error: 'Failed to reset mission periods' });
  }
});

export default router;
