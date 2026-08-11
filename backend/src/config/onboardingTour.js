/**
 * Guided onboarding tour for new players.
 *
 * Steps are either informational (advance via the "Next" button) or
 * event-gated (only complete when the real gameplay event happens — the
 * client can never claim them). Event steps are the ones that teach by
 * doing: buying the first property, collecting rent, upgrading, completing
 * a mission.
 *
 * `event` steps map to the event names fired through processPlayerProgress()
 * (see utils/playerProgress.js XP_REWARDS) or to 'mission_complete' (fired
 * by the mission engine when a mission completes).
 */
export const ONBOARDING_STEPS = [
  { id: 'welcome', route: '/dashboard' },
  { id: 'dashboard', route: '/dashboard' },
  { id: 'cities', route: '/map' },
  { id: 'buy_property', route: '/marketplace', event: ['property_buy', 'auction_won'] },
  { id: 'property_page', route: '/property/:id' },
  { id: 'collect_rent', route: '/dashboard', event: ['rent_collect'] },
  {
    id: 'upgrade_property',
    route: '/development?tab=buildings',
    event: ['property_upgrade', 'property_grade_upgrade', 'upgrade'],
  },
  { id: 'missions', route: '/missions?tab=completed', event: ['mission_claimed'] },
  { id: 'marketplace', route: '/marketplace' },
  { id: 'companies', route: '/real-estate-companies' },
  { id: 'complete', route: '/dashboard' },
];

export const ONBOARDING_STEP_IDS = ONBOARDING_STEPS.map((s) => s.id);

export function getOnboardingStep(stepId) {
  return ONBOARDING_STEPS.find((s) => s.id === stepId) || null;
}

export function isEventGatedStep(stepId) {
  const step = getOnboardingStep(stepId);
  return !!step && Array.isArray(step.event) && step.event.length > 0;
}

export function stepMatchesEvent(stepId, event) {
  const step = getOnboardingStep(stepId);
  if (!step || !Array.isArray(step.event)) return false;
  return step.event.includes(event);
}
