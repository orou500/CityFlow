import User from '../models/User.js';
import MissionProgress from '../models/MissionProgress.js';
import { enqueueNotification } from './notificationQueue.js';
import { ONBOARDING_STEPS, getOnboardingStep, isEventGatedStep, stepMatchesEvent } from '../config/onboardingTour.js';

const TOUR_NOTIFICATION_EVENT_KEY = (userId) => `onboarding:${userId}:completed`;

/**
 * Lazy one-time migration for players that predate the guided tour.
 *
 * Event-gated steps are marked complete when the player's existing history
 * already proves the action happened (owned property, collected rent,
 * upgrades, completed missions). Players with a full history are marked
 * completed outright so veterans never see a first-time tutorial. Runs only
 * once per user (guarded by onboardingV2.status === null).
 */
async function initializeTour(userId) {
  const user = await User.findById(userId);
  if (!user) return null;
  if (user.onboardingV2?.status) return user;

  const [completedMissions] = await Promise.all([MissionProgress.countDocuments({ userId, status: 'completed' })]);

  const hasProperty = (user.ownedProperties || []).length > 0;
  const hasCollectedRent = !!user.lastRentCollectedAt || (user.lifetimeStats?.totalRentCollected || 0) > 0;
  const hasUpgraded = (user.lifetimeStats?.totalUpgrades || 0) > 0;
  const hasMissions = completedMissions > 0;
  const isExperienced =
    hasProperty ||
    hasCollectedRent ||
    hasUpgraded ||
    hasMissions ||
    (user.level || 1) > 3 ||
    (user.lifetimeStats?.totalTransactions || 0) >= 5;

  const historySatisfied = {
    buy_property: hasProperty,
    collect_rent: hasCollectedRent,
    upgrade_property: hasUpgraded,
    missions: hasMissions,
  };

  if (isExperienced && hasProperty && hasCollectedRent && hasUpgraded && hasMissions) {
    user.onboardingV2 = {
      status: 'completed',
      currentStep: 'complete',
      completedSteps: ONBOARDING_STEPS.map((s) => s.id),
      startedAt: new Date(),
      completedAt: new Date(),
      skippedAt: null,
    };
    await user.save();
    return user;
  }

  // Walk the tour. Event steps are completed only when history proves the
  // action happened; informational steps (welcome, dashboard, cities, ...)
  // are auto-completed for experienced players who don't need the basics.
  const completedSteps = [];
  let currentStep = ONBOARDING_STEPS[0].id;
  let started = false;
  for (const step of ONBOARDING_STEPS) {
    if (started) continue;
    const proven = historySatisfied[step.id] || false;
    const skipInfo = isExperienced && !isEventGatedStep(step.id);
    if (proven || skipInfo) {
      completedSteps.push(step.id);
      continue;
    }
    currentStep = step.id;
    started = true;
  }

  user.onboardingV2 = {
    status: 'active',
    currentStep,
    completedSteps,
    startedAt: new Date(),
    completedAt: null,
    skippedAt: null,
  };
  await user.save();
  return user;
}

/**
 * Advance the tour. Server-side only — event-gated steps only advance when
 * the real gameplay event fires; informational steps advance on any
 * "advance" signal (client Next button). Event steps can never be claimed
 * by the client.
 */
export async function advanceOnboarding(userId, event) {
  if (!userId) return null;
  const user = await initializeTour(userId);
  if (!user) return null;
  if (user.onboardingV2.status !== 'active') return user.onboardingV2;

  const current = user.onboardingV2.currentStep;
  const isInformational = !isEventGatedStep(current);
  const matchesEvent = stepMatchesEvent(current, event);
  if (!isInformational && !matchesEvent) return user.onboardingV2;

  const completedSteps = [...new Set([...(user.onboardingV2.completedSteps || []), current])];
  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.id === current);
  const nextStep = ONBOARDING_STEPS[currentIndex + 1] || null;

  if (!nextStep) {
    user.onboardingV2.status = 'completed';
    user.onboardingV2.currentStep = current;
    user.onboardingV2.completedSteps = completedSteps;
    user.onboardingV2.completedAt = new Date();
    await user.save();
    await enqueueNotification({
      userId,
      type: 'system',
      title: 'Onboarding Complete',
      message: 'You now know the basics of CityFlow. Build your real estate empire!',
      eventKey: TOUR_NOTIFICATION_EVENT_KEY(userId),
      route: '/dashboard',
      entityType: 'onboarding',
      entityId: userId,
      global: false,
    });
    return user.onboardingV2;
  }

  user.onboardingV2.currentStep = nextStep.id;
  user.onboardingV2.completedSteps = completedSteps;
  await user.save();
  return user.onboardingV2;
}

/**
 * Advance an informational step (client-driven). Event-gated steps reject
 * advancement so players cannot click through the hands-on parts.
 */
export async function advanceInformationalStep(userId) {
  const user = await initializeTour(userId);
  if (!user) return null;
  if (user.onboardingV2.status !== 'active') return user.onboardingV2;

  const current = user.onboardingV2.currentStep;
  if (isEventGatedStep(current)) {
    const err = new Error('Complete the current onboarding action first');
    err.code = 'ONBOARDING_EVENT_STEP';
    throw err;
  }

  return advanceOnboarding(userId, 'advance');
}

export async function skipOnboarding(userId) {
  const user = await initializeTour(userId);
  if (!user) return null;
  if (user.onboardingV2.status === 'skipped') return user.onboardingV2;

  user.onboardingV2.status = 'skipped';
  user.onboardingV2.skippedAt = new Date();
  await user.save();
  return user.onboardingV2;
}

export async function getTourState(userId) {
  const user = await initializeTour(userId);
  if (!user) return null;

  const completedSteps = user.onboardingV2.completedSteps || [];
  const currentIndex = Math.max(
    0,
    ONBOARDING_STEPS.findIndex((s) => s.id === user.onboardingV2.currentStep),
  );
  const current = ONBOARDING_STEPS[Math.min(currentIndex, ONBOARDING_STEPS.length - 1)];

  return {
    status: user.onboardingV2.status || 'active',
    currentStep: current.id,
    eventGated: isEventGatedStep(current.id),
    completedSteps,
    totalSteps: ONBOARDING_STEPS.length,
    currentIndex,
    startedAt: user.onboardingV2.startedAt,
    completedAt: user.onboardingV2.completedAt || null,
    skippedAt: user.onboardingV2.skippedAt || null,
    lastPropertyId: (user.ownedProperties || [])[0]?.toString() || null,
    steps: ONBOARDING_STEPS.map((s) => ({
      id: s.id,
      route: s.route,
      eventGated: isEventGatedStep(s.id),
    })),
  };
}

export function getStepDefinition(stepId) {
  return getOnboardingStep(stepId);
}
