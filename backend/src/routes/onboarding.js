import { Router } from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { ONBOARDING_UNLOCKS } from '../config/onboarding.js';
import { backfillOnboarding, completeOnboardingStep, getPendingOnboarding } from '../utils/onboarding.js';

const router = Router();

router.use(authenticate);

router.get('/status', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await backfillOnboarding(user);

    const pending = getPendingOnboarding(user);
    res.json({
      success: true,
      level: user.level,
      pending: pending.map((u) => ({
        id: u.id,
        requiredLevel: u.requiredLevel,
        route: u.route,
        titleKey: u.titleKey,
        descriptionKey: u.descriptionKey,
        stepsKeys: u.stepsKeys,
      })),
      completed: user.completedOnboarding || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id || !ONBOARDING_UNLOCKS.some((u) => u.id === id)) {
      return res.status(400).json({ error: 'Invalid onboarding step' });
    }

    const user = await completeOnboardingStep(req.user._id, id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      success: true,
      completed: user.completedOnboarding || [],
      pending: getPendingOnboarding(user).map((u) => ({
        id: u.id,
        requiredLevel: u.requiredLevel,
        route: u.route,
        titleKey: u.titleKey,
        descriptionKey: u.descriptionKey,
        stepsKeys: u.stepsKeys,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
