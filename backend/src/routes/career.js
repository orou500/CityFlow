import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getCareerDashboard,
  processPrestige,
  setDisplayTitle,
  checkAndAwardAchievements,
} from '../engine/careerProcessing.js';
import { cacheGet, cacheSet, cacheDel } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = cacheKeys.careerDashboard(userId.toString());
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, career: cached });

    const career = await getCareerDashboard(userId);
    if (!career) return res.status(404).json({ success: false, error: 'User not found' });

    await cacheSet(cacheKey, career, 60);
    res.json({ success: true, career });
  } catch (err) {
    console.error('[CAREER] Error fetching dashboard:', err);
    res.serverError(err);
  }
});

router.get('/achievements', async (req, res) => {
  try {
    const career = await getCareerDashboard(req.user._id);
    res.json({ success: true, achievements: career.achievements });
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/title', async (req, res) => {
  try {
    const { title } = req.body;
    const result = await setDisplayTitle(req.user._id, title || '');
    await cacheDel(cacheKeys.careerDashboard(req.user._id.toString()));
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/prestige', async (req, res) => {
  try {
    const result = await processPrestige(req.user._id);
    const cacheKey = cacheKeys.careerDashboard(req.user._id.toString());
    await cacheDel(cacheKey);
    res.json({ success: true, prestige: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/check-achievements', async (req, res) => {
  try {
    const result = await checkAndAwardAchievements(req.user._id, req.body.triggerType || 'manual');
    res.json({ success: true, newlyCompleted: result });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
