import { Router } from 'express';
import User from '../models/User.js';
import Property from '../models/Property.js';
import { authenticate } from '../middleware/auth.js';
import { ONBOARDING_UNLOCKS } from '../config/onboarding.js';
import { backfillOnboarding, completeOnboardingStep, getPendingOnboarding } from '../utils/onboarding.js';
import { advanceInformationalStep, getTourState, skipOnboarding } from '../utils/onboardingTour.js';

const router = Router();

router.use(authenticate);

// The buy_property tour step directs players to a property priced at or
// below this cap. Before directing, the server verifies such inventory
// actually exists so onboarding never strands a player with nothing to buy.
export const CHEAP_PROPERTY_CAP = 100000;

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
    res.serverError(err);
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
    res.serverError(err);
  }
});

/**
 * Guided tour â€” state is persisted in User.onboardingV2. Gameplay steps
 * (buy_property, collect_rent, upgrade_property, missions) only advance
 * server-side when the real event happens; the client can never claim them.
 */

router.get('/tour/status', async (req, res) => {
  try {
    const state = await getTourState(req.user._id);
    if (!state) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, ...state });
  } catch (err) {
    res.serverError(err);
  }
});

/**
 * Read-only inventory check for the buy_property tour step: is there a
 * property priced <= CHEAP_PROPERTY_CAP that the player can actually buy?
 * Bank properties (ownerId null, forSale) or player-listed properties that
 * are not under construction. Never creates properties and never bypasses
 * purchase rules â€” it only tells the UI whether to offer the fallback.
 */
router.get('/tour/buy-property-availability', async (req, res) => {
  try {
    const eligible = await Property.find({
      forSale: true,
      currentPrice: { $gt: 0, $lte: CHEAP_PROPERTY_CAP },
      // No in-progress construction/improvement (empty subdoc has no id).
      'activeImprovement.improvementId': null,
      $or: [{ ownerId: null }, { ownerId: { $ne: req.user._id } }],
    })
      .sort({ currentPrice: 1 })
      .limit(5)
      .select('name currentPrice type cityId forSale')
      .lean();

    res.json({
      success: true,
      eligible: eligible.length > 0,
      count: eligible.length,
      marketUrl: '/marketplace',
      examples: eligible.map((p) => ({
        id: p._id,
        name: p.name,
        currentPrice: p.currentPrice,
        type: p.type,
        cityId: p.cityId,
      })),
    });
  } catch (err) {
    res.serverError(err);
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
    res.serverError(err);
  }
});

router.post('/tour/skip', async (req, res) => {
  try {
    const state = await skipOnboarding(req.user._id);
    if (!state) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, status: state.status });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
