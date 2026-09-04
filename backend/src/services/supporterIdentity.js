/**
 * Supporter Identity service — centralized business logic for the cosmetic
 * Supporter Identity System.
 *
 * Authority rules (see AGENTS.md / the supporter-identity spec):
 *  - Supporter eligibility is computed server-side from confirmed donation
 *    records (User.donationStats.totalDonated), NEVER from client input.
 *  - The tier/badge is the existing donation badge (none | supporter |
 *    early_supporter | founding_supporter). Eligible = badge != 'none'.
 *  - All cosmetic selections are validated against the whitelist in
 *    config/supporterCosmetics.js; unknown/raw/CSS/HTML/URL input is rejected.
 *  - Cosmetics are presentation-only and grant no gameplay advantage.
 */

import { TIERS, DEFAULT_COSMETICS, validateAndSanitizeCosmetics } from '../config/supporterCosmetics.js';

/**
 * Current supporter badge for a user doc. Defaults to 'none' when missing.
 */
export function supporterBadge(user) {
  return user?.supporter?.badge || TIERS.NONE;
}

/**
 * Whether a user is eligible for supporter cosmetics.
 */
export function isSupporter(user) {
  return supporterBadge(user) !== TIERS.NONE;
}

/**
 * Build the cosmetic settings to persist for a user. Non-supporters always
 * get the default (all cosmetic features disabled/neutral) regardless of what
 * the client sends.
 *
 * `input` is the raw request body cosmetics object (or undefined). Returns a
 * plain object safe to assign to `user.cosmetics`.
 */
export function resolveCosmetics(user, input) {
  if (!isSupporter(user)) {
    return { ...DEFAULT_COSMETICS, badge: 'supporter', title: 'supporter' };
  }
  const badge = supporterBadge(user);
  const result = validateAndSanitizeCosmetics(input, badge);
  if (!result.ok) {
    const err = new Error(result.error);
    err.status = 400;
    throw err;
  }
  return result.cosmetics;
}

/**
 * Reset a supporter's cosmetics to safe defaults for their tier.
 */
export function resetCosmetics(user) {
  return { ...DEFAULT_COSMETICS, badge: user.supporter?.badge || 'none', title: 'supporter' };
}

/**
 * The public identity payload a client/game surface needs to render this
 * player's identity consistently. Includes only whitelisted cosmetic IDs.
 * NOTE: the caller should merge from a User doc; `user` can be a lean doc
 * with `cosmetics`, `supporter`, `donationStats` present.
 */
export function buildIdentityPayload(user = {}) {
  const badge = supporterBadge(user);
  const cosmetics = { ...DEFAULT_COSMETICS, ...(user.cosmetics || {}) };
  return {
    isSupporter: badge !== TIERS.NONE,
    tier: badge,
    cosmetics,
    supporterSince: user.donationStats?.donorSince || null,
    totalDonated: user.donationStats?.totalDonated || 0,
  };
}
