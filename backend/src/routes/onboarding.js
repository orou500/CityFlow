import { Router } from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { ONBOARDING_UNLOCKS } from '../config/onboarding.js';
import { backfillOnboarding, completeOnboardingStep, getPendingOnboarding } from '../utils/onboarding.js';
import { advanceInformationalStep, getTourState, skipOnboarding } from '../utils/onboardingTour.js';

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

/**
 * Guided tour — state is persisted in User.onboardingV2. Gameplay steps
 * (buy_property, collect_rent, upgrade_property, missions) only advance
 * server-side when the real event happens; the client can never claim them.
 */

router.get('/tour/status', async (req, res) => {
  try {
    const state = await getTourState(req.user._id);
    if (!state) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, ...state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tour/advance', async (req, res) => {
  try {
    const state = await advanceInformationalStep(req.user._id);
    if (!state) return res.status(404).json({ error: 'User not found' });
    const tour = await getTourState(req.user._id);
    res.json({ success: true, ...tour });
  } catch (err) {
    if (err.code === 'ONBOARDING_EVENT_STEP') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/tour/skip', async (req, res) => {
  try {
    const state = await skipOnboarding(req.user._id);
    if (!state) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, status: state.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
