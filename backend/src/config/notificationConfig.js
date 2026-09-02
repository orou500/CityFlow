/**
 * Notification configuration — priorities, categories and central event
 * metadata. Every notification produced by the system is tagged with a
 * priority and a category so the frontend can prioritize, filter and
 * eventually let users opt out of categories.
 *
 * Priority is derived from the logical event (eventKey), never from title /
 * message text. Callers may override via `priority` / `category` on the
 * notification payload.
 */

export const PRIORITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

export const PRIORITY_ORDER = [PRIORITY.CRITICAL, PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW];

export const CATEGORY = {
  MISSION: 'mission',
  ACHIEVEMENT: 'achievement',
  RENT: 'rent',
  AUCTION: 'auction',
  COMPANY: 'company',
  CONTRACT: 'contract',
  STOCK: 'stock',
  LOAN: 'loan',
  PROPERTY: 'property',
  FRIEND: 'friend',
  SEASON: 'season',
  LEADERBOARD: 'leaderboard',
  MARKET: 'market',
  SYSTEM: 'system',
  ONBOARDING: 'onboarding',
};

export const CATEGORIES = Object.values(CATEGORY);

export const VALID_PRIORITIES = Object.values(PRIORITY);

export const VALID_CATEGORIES = Object.values(CATEGORY);

/**
 * Preference keys exposed to the user (future settings UI). Critical /
 * security notifications always bypass preferences — the flag only gates
 * non-critical categories.
 */
export const DEFAULT_PREFERENCES = {
  mission: true,
  achievement: true,
  auction: true,
  company: true,
  friend: true,
  market: true,
  property: true,
  system: true,
};

export const CATEGORY_TO_PREFERENCE = {
  mission: 'mission',
  achievement: 'achievement',
  auction: 'auction',
  company: 'company',
  contract: 'company',
  loan: 'company',
  friend: 'friend',
  market: 'market',
  stock: 'market',
  property: 'property',
  rent: 'property',
  season: 'system',
  leaderboard: 'system',
  onboarding: 'system',
  system: 'system',
};

// High-volume protection: never let a user's unread list grow unboundedly.
export const MAX_UNREAD_NOTIFICATIONS = 300;

// Retention — old READ notifications are pruned; unread are never removed.
export const READ_RETENTION_DAYS = 7;
export const CRITICAL_READ_RETENTION_DAYS = 30;

// The rent "ready to collect" notification only appears once rent actually
// becomes meaningful to collect.
export const MIN_RENT_READY_AMOUNT = 100;

export const RENT_READY_EVENT_KEY = (userId) => `rent:ready:${userId}`;

/**
 * Resolve the priority + category for a logical event.
 *
 * Rules are matched against the eventKey structure (`domain:entityId:action`)
 * so the same category of event always maps consistently. Explicit
 * `priority`/`category` passed by a caller take precedence.
 */
export function getNotificationMeta(eventKey = '', type = 'system') {
  const key = String(eventKey || '');
  let priority = PRIORITY.LOW;
  let category = CATEGORY.SYSTEM;

  if (key.startsWith('auction:')) {
    category = CATEGORY.AUCTION;
    if (key.includes(':won:') || key.includes(':insufficient_funds:') || key.includes(':outbid:')) {
      priority = PRIORITY.CRITICAL;
    } else if (
      key.includes(':sold:') ||
      key.includes(':no_winner:') ||
      key.includes(':cancelled:') ||
      key.includes(':reserve_reached:') ||
      key.includes(':reserve_met:')
    ) {
      priority = PRIORITY.HIGH;
    } else if (key.includes(':extended:')) {
      priority = PRIORITY.MEDIUM;
    } else if (key.includes(':watched_ended:')) {
      priority = PRIORITY.LOW;
    } else {
      priority = PRIORITY.MEDIUM;
    }
  } else if (key.startsWith('rent:')) {
    category = CATEGORY.RENT;
    priority = key.includes(':expired:') ? PRIORITY.CRITICAL : key.includes(':ready:') ? PRIORITY.HIGH : PRIORITY.HIGH;
  } else if (key.startsWith('mission:')) {
    category = CATEGORY.MISSION;
    priority = PRIORITY.HIGH;
  } else if (key.startsWith('achievement:')) {
    category = CATEGORY.ACHIEVEMENT;
    priority = PRIORITY.HIGH;
  } else if (key.startsWith('levelup:') || key.startsWith('prestige:')) {
    category = key.startsWith('prestige:') ? CATEGORY.ACHIEVEMENT : CATEGORY.SYSTEM;
    priority = key.startsWith('prestige:') ? PRIORITY.HIGH : PRIORITY.MEDIUM;
  } else if (key.startsWith('friend:')) {
    category = CATEGORY.FRIEND;
    priority = PRIORITY.MEDIUM;
  } else if (key.startsWith('season:')) {
    category = CATEGORY.SEASON;
    priority = PRIORITY.MEDIUM;
  } else if (key.startsWith('leaderboard:')) {
    category = CATEGORY.LEADERBOARD;
    priority = PRIORITY.MEDIUM;
  } else if (key.startsWith('offer:')) {
    category = CATEGORY.MARKET;
    priority = key.includes(':expired:') ? PRIORITY.LOW : PRIORITY.MEDIUM;
  } else if (key.startsWith('dividend:')) {
    category = CATEGORY.STOCK;
    priority = PRIORITY.MEDIUM;
  } else if (key.startsWith('property:')) {
    category = CATEGORY.PROPERTY;
    priority = PRIORITY.MEDIUM;
  } else if (key.startsWith('construction:') || key.startsWith('improvement:')) {
    category = CATEGORY.PROPERTY;
    priority = PRIORITY.HIGH;
  } else if (key.startsWith('loan:')) {
    category = CATEGORY.LOAN;
    priority = PRIORITY.CRITICAL;
  } else if (key.startsWith('hazard:') || key.startsWith('risk:') || key.startsWith('property_risk:')) {
    category = CATEGORY.PROPERTY;
    priority = PRIORITY.CRITICAL;
  } else if (key.startsWith('contract:')) {
    category = CATEGORY.CONTRACT;
    priority = key.includes(':vote_request:') ? PRIORITY.MEDIUM : PRIORITY.HIGH;
  } else if (key.startsWith('company:')) {
    category = CATEGORY.COMPANY;
    if (key.includes(':vote_request:')) {
      priority = PRIORITY.HIGH;
    } else if (key.includes(':expired:') || key.includes(':withdraw:') || key.includes(':milestone:')) {
      priority = PRIORITY.MEDIUM;
    } else if (
      key.includes(':approved:') ||
      key.includes(':executed:') ||
      key.includes(':exec_failed:') ||
      key.includes(':unavailable:') ||
      key.includes(':insufficient_funds:')
    ) {
      priority = PRIORITY.HIGH;
    } else if (
      key.includes(':level_up:') ||
      key.includes(':invite:') ||
      key.includes(':joined:') ||
      key.includes(':removed:')
    ) {
      priority = PRIORITY.MEDIUM;
    } else {
      priority = PRIORITY.MEDIUM;
    }
  } else if (key.startsWith('sizops:')) {
    category = CATEGORY.SYSTEM;
    priority = key.includes(':welcome:') ? PRIORITY.HIGH : PRIORITY.MEDIUM;
  } else if (key.startsWith('onboarding:')) {
    category = CATEGORY.ONBOARDING;
    priority = PRIORITY.LOW;
  } else if (key.startsWith('rewardedad:')) {
    category = CATEGORY.SYSTEM;
    priority = PRIORITY.LOW;
  } else if (key.startsWith('system:')) {
    category = CATEGORY.SYSTEM;
    priority = PRIORITY.MEDIUM;
  } else if (key.startsWith('test:') || key.startsWith('legacy:')) {
    category = CATEGORY.SYSTEM;
    priority = PRIORITY.LOW;
  }

  // Type-based fallback for callers that don't pass an eventKey.
  if (category === CATEGORY.SYSTEM && priority === PRIORITY.LOW) {
    if (type === 'company_vote') {
      category = CATEGORY.COMPANY;
      priority = PRIORITY.HIGH;
    } else if (type === 'mission_complete') {
      category = CATEGORY.MISSION;
      priority = PRIORITY.HIGH;
    } else if (type === 'season_reward') {
      category = CATEGORY.SEASON;
      priority = PRIORITY.MEDIUM;
    } else if (type === 'friend_request') {
      category = CATEGORY.FRIEND;
      priority = PRIORITY.MEDIUM;
    } else if (type === 'construction_complete' || type === 'improvement_complete') {
      category = CATEGORY.PROPERTY;
      priority = PRIORITY.HIGH;
    }
  }

  return { priority, category };
}

export function resolveNotificationMeta(data) {
  const meta = getNotificationMeta(data.eventKey, data.type);
  return {
    priority: VALID_PRIORITIES.includes(data.priority) ? data.priority : meta.priority,
    category: CATEGORIES.includes(data.category) ? data.category : meta.category,
  };
}
