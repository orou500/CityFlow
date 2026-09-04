/**
 * Supporter cosmetic configuration — the SINGLE source of truth for the
 * Supporter Identity System.
 *
 * Every cosmetic option (username color/gradient, profile backgrounds,
 * avatar frames, borders, badges, titles, presets) is a NAMED ID defined
 * here. The backend validates ALL user-submitted cosmetic selections against
 * this file — unknown IDs, raw CSS/HTML/URLs, and JavaScript are rejected.
 * The frontend mirrors this file for preview rendering but the backend is
 * the authority.
 *
 * IMPORTANT: This system is cosmetic-only. It GRANTS NO economic, gameplay,
 * property, auction, company, investment, loan, XP or competitive advantage.
 *
 * Monetary thresholds (configurable): a supporter tier is derived from the
 * user's lifetime confirmed donation total (`User.donationStats.totalDonated`).
 * These thresholds are the SAME as the existing donation badges
 * (backend/src/routes/donations.js): any confirmed donation = 'supporter',
 * $25+ = 'early_supporter', $100+ = 'founding_supporter'. Eligible = any tier
 * above 'none'.
 */

export const TIERS = {
  NONE: 'none',
  SUPPORTER: 'supporter',
  EARLY_SUPPORTER: 'early_supporter',
  FOUNDING_SUPPORTER: 'founding_supporter',
};

export const TIER_ORDER = [TIERS.NONE, TIERS.SUPPORTER, TIERS.EARLY_SUPPORTER, TIERS.FOUNDING_SUPPORTER];

// Which tier unlocks which feature category. A tier index >= the minimum
// required index unlocks it.
export const TIER_MIN_INDEX = {
  // Badges / basic username color / basic avatar frame unlock at 'supporter'
  badge: TIER_ORDER.indexOf(TIERS.SUPPORTER),
  usernameColor: TIER_ORDER.indexOf(TIERS.SUPPORTER),
  gradient: TIER_ORDER.indexOf(TIERS.SUPPORTER),
  animatedGradient: TIER_ORDER.indexOf(TIERS.EARLY_SUPPORTER),
  profileBackground: TIER_ORDER.indexOf(TIERS.SUPPORTER),
  profileBackgroundEffect: TIER_ORDER.indexOf(TIERS.EARLY_SUPPORTER),
  avatarFrame: TIER_ORDER.indexOf(TIERS.SUPPORTER),
  avatarRing: TIER_ORDER.indexOf(TIERS.EARLY_SUPPORTER),
  profileBorder: TIER_ORDER.indexOf(TIERS.SUPPORTER),
  glow: TIER_ORDER.indexOf(TIERS.EARLY_SUPPORTER),
  title: TIER_ORDER.indexOf(TIERS.SUPPORTER),
  emblem: TIER_ORDER.indexOf(TIERS.FOUNDING_SUPPORTER),
};

/**
 * Human-readable tier and badge/title metadata. Titles are COSMETIC and must
 * never imply gameplay authority. The `icon` is a static glyph (whitelisted),
 * never raw user input.
 */

/**
 * Approved username colors. Only these IDs are allowed. Each value maps to a
 * CSS color that passes the app's contrast checks.
 */
export const USERNAME_COLORS = {
  cityflow_blue: { labelKey: 'supporterIdentity.color.cityflowBlue', value: '#1e90ff' },
  cityflow_cyan: { labelKey: 'supporterIdentity.color.cityflowCyan', value: '#22d3ee' },
  cityflow_orange: { labelKey: 'supporterIdentity.color.cityflowOrange', value: '#ff8c00' },
  purple: { labelKey: 'supporterIdentity.color.purple', value: '#a855f7' },
  red: { labelKey: 'supporterIdentity.color.red', value: '#ef4444' },
  green: { labelKey: 'supporterIdentity.color.green', value: '#22c55e' },
  gold: { labelKey: 'supporterIdentity.color.gold', value: '#f5b301' },
  white: { labelKey: 'supporterIdentity.color.white', value: '#f8fafc' },
};

// Colors that only higher tiers may pick (early_supporter+).
export const USERNAME_COLOR_TIER = {
  cityflow_blue: TIERS.SUPPORTER,
  cityflow_cyan: TIERS.SUPPORTER,
  cityflow_orange: TIERS.SUPPORTER,
  green: TIERS.SUPPORTER,
  white: TIERS.SUPPORTER,
  red: TIERS.EARLY_SUPPORTER,
  purple: TIERS.EARLY_SUPPORTER,
  gold: TIERS.FOUNDING_SUPPORTER,
};

/**
 * Approved username gradients. Each is defined as a CSS gradient string with
 * ONLY inline color stops the backend controls (never user input). `animated`
 * gradients additionally require a CSS animation class (gated by reduced
 * motion on the frontend).
 */
export const USERNAME_GRADIENTS = {
  cityflow_ocean: {
    labelKey: 'supporterIdentity.gradient.cityflowOcean',
    stops: ['#22d3ee', '#1e90ff', '#3b82f6'],
  },
  ocean_dream: {
    labelKey: 'supporterIdentity.gradient.oceanDream',
    stops: ['#38bdf8', '#818cf8'],
  },
  sunset: {
    labelKey: 'supporterIdentity.gradient.sunset',
    stops: ['#fb923c', '#ef4444', '#a855f7'],
  },
  royal: {
    labelKey: 'supporterIdentity.gradient.royal',
    stops: ['#a855f7', '#f5b301'],
  },
  neon: {
    labelKey: 'supporterIdentity.gradient.neon',
    stops: ['#22d3ee', '#a855f7'],
  },
  empyrean: {
    labelKey: 'supporterIdentity.gradient.empyrean',
    stops: ['#f5b301', '#1e90ff'],
  },
};

/**
 * Username effect. Each maps to a whitelisted CSS utility/class on the
 * frontend (glow, shimmer, pulse, gradient-flow). The server only stores the
 * `effect` ID — never CSS.
 */
export const USERNAME_EFFECTS = {
  none: { labelKey: 'supporterIdentity.effect.none', minTier: TIERS.SUPPORTER },
  glow: { labelKey: 'supporterIdentity.effect.glow', minTier: TIERS.EARLY_SUPPORTER },
  soft_glow: { labelKey: 'supporterIdentity.effect.softGlow', minTier: TIERS.SUPPORTER },
  shimmer: { labelKey: 'supporterIdentity.effect.shimmer', minTier: TIERS.EARLY_SUPPORTER },
  pulse: { labelKey: 'supporterIdentity.effect.pulse', minTier: TIERS.EARLY_SUPPORTER },
  gradient_flow: { labelKey: 'supporterIdentity.effect.gradientFlow', minTier: TIERS.EARLY_SUPPORTER },
};

/**
 * Profile background THEMES. Each is a whitelisted named preset rendered as a
 * CSS gradient/image pattern by the frontend. The server stores only the ID.
 */
export const PROFILE_BACKGROUNDS = {
  none: { labelKey: 'supporterIdentity.background.none', minTier: TIERS.SUPPORTER },
  midnight_city: { labelKey: 'supporterIdentity.background.midnightCity', minTier: TIERS.SUPPORTER },
  blue_horizon: { labelKey: 'supporterIdentity.background.blueHorizon', minTier: TIERS.SUPPORTER },
  financial_district: { labelKey: 'supporterIdentity.background.financialDistrict', minTier: TIERS.SUPPORTER },
  neon_metro: { labelKey: 'supporterIdentity.background.neonMetro', minTier: TIERS.EARLY_SUPPORTER },
  sunset_skyline: { labelKey: 'supporterIdentity.background.sunsetSkyline', minTier: TIERS.EARLY_SUPPORTER },
  ocean_city: { labelKey: 'supporterIdentity.background.oceanCity', minTier: TIERS.EARLY_SUPPORTER },
  corporate_black: { labelKey: 'supporterIdentity.background.corporateBlack', minTier: TIERS.EARLY_SUPPORTER },
  global_empire: { labelKey: 'supporterIdentity.background.globalEmpire', minTier: TIERS.FOUNDING_SUPPORTER },
  golden_hour: { labelKey: 'supporterIdentity.background.goldenHour', minTier: TIERS.FOUNDING_SUPPORTER },
  deep_space: { labelKey: 'supporterIdentity.background.deepSpace', minTier: TIERS.FOUNDING_SUPPORTER },
};

/**
 * Profile background sub-effects. Subtle, lightweight CSS-only. The server
 * stores the ID; the frontend renders a precedence layer. NONE is always
 * allowed.
 */
export const PROFILE_BACKGROUND_EFFECTS = {
  none: { labelKey: 'supporterIdentity.backgroundEffect.none', minTier: TIERS.SUPPORTER },
  gradient: { labelKey: 'supporterIdentity.backgroundEffect.gradient', minTier: TIERS.SUPPORTER },
  animated_gradient: {
    labelKey: 'supporterIdentity.backgroundEffect.animatedGradient',
    minTier: TIERS.EARLY_SUPPORTER,
  },
  city_lights: { labelKey: 'supporterIdentity.backgroundEffect.cityLights', minTier: TIERS.EARLY_SUPPORTER },
  particles: { labelKey: 'supporterIdentity.backgroundEffect.particles', minTier: TIERS.EARLY_SUPPORTER },
  grid: { labelKey: 'supporterIdentity.backgroundEffect.grid', minTier: TIERS.SUPPORTER },
  light_streaks: { labelKey: 'supporterIdentity.backgroundEffect.lightStreaks', minTier: TIERS.FOUNDING_SUPPORTER },
  skyline: { labelKey: 'supporterIdentity.backgroundEffect.skyline', minTier: TIERS.EARLY_SUPPORTER },
  glass: { labelKey: 'supporterIdentity.backgroundEffect.glass', minTier: TIERS.SUPPORTER },
};

/**
 * Profile / card borders. Whitelisted named borders.
 */
export const PROFILE_BORDERS = {
  none: { labelKey: 'supporterIdentity.border.none', minTier: TIERS.SUPPORTER },
  cityflow_blue: { labelKey: 'supporterIdentity.border.cityflowBlue', minTier: TIERS.SUPPORTER },
  cyan: { labelKey: 'supporterIdentity.border.cyan', minTier: TIERS.SUPPORTER },
  purple: { labelKey: 'supporterIdentity.border.purple', minTier: TIERS.EARLY_SUPPORTER },
  gold: { labelKey: 'supporterIdentity.border.gold', minTier: TIERS.EARLY_SUPPORTER },
  platinum: { labelKey: 'supporterIdentity.border.platinum', minTier: TIERS.FOUNDING_SUPPORTER },
  animated_gradient: { labelKey: 'supporterIdentity.border.animatedGradient', minTier: TIERS.FOUNDING_SUPPORTER },
};

/**
 * Avatar frames/rings that render AROUND the unmodified avatar image.
 */
export const AVATAR_FRAMES = {
  none: { labelKey: 'supporterIdentity.avatarFrame.none', minTier: TIERS.SUPPORTER },
  blue_glow: { labelKey: 'supporterIdentity.avatarFrame.blueGlow', minTier: TIERS.SUPPORTER },
  cyan_ring: { labelKey: 'supporterIdentity.avatarFrame.cyanRing', minTier: TIERS.SUPPORTER },
  gold_ring: { labelKey: 'supporterIdentity.avatarFrame.goldRing', minTier: TIERS.EARLY_SUPPORTER },
  gradient_ring: { labelKey: 'supporterIdentity.avatarFrame.gradientRing', minTier: TIERS.EARLY_SUPPORTER },
  animated_ring: { labelKey: 'supporterIdentity.avatarFrame.animatedRing', minTier: TIERS.EARLY_SUPPORTER },
  premium_frame: { labelKey: 'supporterIdentity.avatarFrame.premiumFrame', minTier: TIERS.FOUNDING_SUPPORTER },
};

/**
 * Cosmetic badges shown next to a username. `badge` may be 'none' (no badge)
 * or a supporter badge ID.
 */
export const BADGES = {
  none: { labelKey: 'supporterIdentity.badge.none', minTier: TIERS.SUPPORTER, icon: '' },
  supporter: { labelKey: 'supporterIdentity.badge.supporter', minTier: TIERS.SUPPORTER, icon: '❤️', symbol: '★' },
  early_supporter: {
    labelKey: 'supporterIdentity.badge.early_supporter',
    minTier: TIERS.EARLY_SUPPORTER,
    icon: '💎',
    symbol: '◆',
  },
  founding_supporter: {
    labelKey: 'supporterIdentity.badge.founding_supporter',
    minTier: TIERS.FOUNDING_SUPPORTER,
    icon: '⭐',
    symbol: '✨',
  },
};

/**
 * Cosmetic titles. COSMETIC ONLY — never imply gameplay authority unless the
 * player actually has it. (`title` is shown to others as a flair label.)
 */
export const TITLES = {
  none: { labelKey: 'supporterIdentity.title.none', minTier: TIERS.SUPPORTER },
  supporter: { labelKey: 'supporterIdentity.title.supporter', minTier: TIERS.SUPPORTER },
  city_builder: { labelKey: 'supporterIdentity.title.cityBuilder', minTier: TIERS.SUPPORTER },
  urban_investor: { labelKey: 'supporterIdentity.title.urbanInvestor', minTier: TIERS.EARLY_SUPPORTER },
  empire_builder: { labelKey: 'supporterIdentity.title.empireBuilder', minTier: TIERS.EARLY_SUPPORTER },
  global_developer: { labelKey: 'supporterIdentity.title.globalDeveloper', minTier: TIERS.EARLY_SUPPORTER },
  market_mogul: { labelKey: 'supporterIdentity.title.marketMogul', minTier: TIERS.FOUNDING_SUPPORTER },
  cityflow_founder: { labelKey: 'supporterIdentity.title.cityflowFounder', minTier: TIERS.FOUNDING_SUPPORTER },
};

/**
 * Presets — one-click curated combinations. Users can pick a preset then
 * still fine-tune individual elements. Each preset references whitelisted IDs
 * only.
 */
export const PRESETS = {
  cityflow: {
    labelKey: 'supporterIdentity.preset.cityflow',
    minTier: TIERS.SUPPORTER,
    options: {
      usernameStyle: { type: 'static', color: 'cityflow_blue', gradient: 'cityflow_ocean', animated: false },
      usernameEffect: 'soft_glow',
      profileBackground: 'blue_horizon',
      profileBackgroundEffect: 'gradient',
      profileBorder: 'cityflow_blue',
      avatarFrame: 'blue_glow',
      badge: 'supporter',
      title: 'supporter',
    },
  },
  executive: {
    labelKey: 'supporterIdentity.preset.executive',
    minTier: TIERS.EARLY_SUPPORTER,
    options: {
      usernameStyle: { type: 'static', color: 'gold', gradient: 'empyrean', animated: false },
      usernameEffect: 'glow',
      profileBackground: 'corporate_black',
      profileBackgroundEffect: 'grid',
      profileBorder: 'gold',
      avatarFrame: 'gold_ring',
      badge: 'early_supporter',
      title: 'market_mogul',
    },
  },
  ocean: {
    labelKey: 'supporterIdentity.preset.ocean',
    minTier: TIERS.SUPPORTER,
    options: {
      usernameStyle: { type: 'gradient', color: 'cityflow_cyan', gradient: 'ocean_dream', animated: false },
      usernameEffect: 'soft_glow',
      profileBackground: 'ocean_city',
      profileBackgroundEffect: 'animated_gradient',
      profileBorder: 'cyan',
      avatarFrame: 'gradient_ring',
      badge: 'supporter',
      title: 'city_builder',
    },
  },
  sunset: {
    labelKey: 'supporterIdentity.preset.sunset',
    minTier: TIERS.EARLY_SUPPORTER,
    options: {
      usernameStyle: { type: 'animated-gradient', color: 'cityflow_orange', gradient: 'sunset', animated: true },
      usernameEffect: 'gradient_flow',
      profileBackground: 'sunset_skyline',
      profileBackgroundEffect: 'city_lights',
      profileBorder: 'purple',
      avatarFrame: 'animated_ring',
      badge: 'early_supporter',
      title: 'global_developer',
    },
  },
  royal: {
    labelKey: 'supporterIdentity.preset.royal',
    minTier: TIERS.EARLY_SUPPORTER,
    options: {
      usernameStyle: { type: 'gradient', color: 'purple', gradient: 'royal', animated: false },
      usernameEffect: 'glow',
      profileBackground: 'financial_district',
      profileBackgroundEffect: 'particles',
      profileBorder: 'purple',
      avatarFrame: 'premium_frame',
      badge: 'early_supporter',
      title: 'empire_builder',
    },
  },
  neon: {
    labelKey: 'supporterIdentity.preset.neon',
    minTier: TIERS.EARLY_SUPPORTER,
    options: {
      usernameStyle: { type: 'animated-gradient', color: 'cityflow_cyan', gradient: 'neon', animated: true },
      usernameEffect: 'shimmer',
      profileBackground: 'neon_metro',
      profileBackgroundEffect: 'light_streaks',
      profileBorder: 'animated_gradient',
      avatarFrame: 'animated_ring',
      badge: 'early_supporter',
      title: 'city_builder',
    },
  },
  empire: {
    labelKey: 'supporterIdentity.preset.empire',
    minTier: TIERS.FOUNDING_SUPPORTER,
    options: {
      usernameStyle: { type: 'animated-gradient', color: 'gold', gradient: 'empyrean', animated: true },
      usernameEffect: 'gradient_flow',
      profileBackground: 'global_empire',
      profileBackgroundEffect: 'light_streaks',
      profileBorder: 'platinum',
      avatarFrame: 'premium_frame',
      badge: 'founding_supporter',
      title: 'cityflow_founder',
    },
  },
};

/**
 * Default cosmetics for a supporter (tier 1). Safe defaults that render
 * correctly and are subdued.
 */
export const DEFAULT_COSMETICS = {
  usernameStyle: { type: 'static', color: 'cityflow_blue', gradient: 'cityflow_ocean', animated: false },
  usernameEffect: 'none',
  profileBackground: 'none',
  profileBackgroundEffect: 'none',
  profileBorder: 'none',
  avatarFrame: 'none',
  badge: 'supporter',
  title: 'supporter',
};

// ---- Validation helpers -------------------------------------------------

const ALLOWED_USERNAME_STYLES = ['static', 'gradient', 'animated-gradient'];

export function isValidUsernameColor(value) {
  return Boolean(typeof value === 'string' && USERNAME_COLORS[value]);
}

export function isValidGradient(value) {
  return Boolean(typeof value === 'string' && USERNAME_GRADIENTS[value]);
}

export function isValidUsernameStyle(type, color, gradient) {
  if (!ALLOWED_USERNAME_STYLES.includes(type)) return false;
  if (type === 'static') return isValidUsernameColor(color);
  return isValidUsernameColor(color) && isValidGradient(gradient);
}

export function isValidUsernameEffect(value) {
  return Boolean(typeof value === 'string' && USERNAME_EFFECTS[value]);
}

export function isValidProfileBackground(value) {
  return Boolean(typeof value === 'string' && PROFILE_BACKGROUNDS[value]);
}

export function isValidProfileBackgroundEffect(value) {
  return Boolean(typeof value === 'string' && PROFILE_BACKGROUND_EFFECTS[value]);
}

export function isValidProfileBorder(value) {
  return Boolean(typeof value === 'string' && PROFILE_BORDERS[value]);
}

export function isValidAvatarFrame(value) {
  return Boolean(typeof value === 'string' && AVATAR_FRAMES[value]);
}

export function isValidBadge(value) {
  return Boolean(typeof value === 'string' && BADGES[value]);
}

export function isValidTitle(value) {
  return Boolean(typeof value === 'string' && TITLES[value]);
}

/**
 * Resolve the cosmetic tier index for a badge ('none' | 'supporter' |
 * 'early_supporter' | 'founding_supporter').
 */
export function tierIndexForBadge(badge) {
  return TIER_ORDER.indexOf(badge);
}

/**
 * A given option is allowed for a user if their tier index >= the option's
 * minimum tier index (computed from the option's `minTier` badge).
 */
function optionAllowed(minTier, tierIndex) {
  const idx = TIER_ORDER.indexOf(minTier);
  return tierIndex >= idx;
}

/**
 * Full server-side validation of a submitted cosmetics object against the
 * current user's tier. Returns `{ ok: true, cosmetics }` or
 * `{ ok: false, error }`. Only whitelisted IDs pass; unknown/raw/HTML/CSS/URL
 * input is rejected.
 */
export function validateAndSanitizeCosmetics(input, badge) {
  const tierIndex = tierIndexForBadge(badge);
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid cosmetics payload' };
  }
  if (tierIndex < tierIndexForBadge(TIERS.SUPPORTER)) {
    return { ok: false, error: 'Supporter cosmetics unavailable' };
  }

  const out = {};

  // usernameStyle
  const {
    type = 'static',
    color = 'cityflow_blue',
    gradient = 'cityflow_ocean',
    animated = false,
  } = input.usernameStyle || {};
  if (!isValidUsernameStyle(type, color, gradient)) {
    return { ok: false, error: 'Invalid username style' };
  }
  if (type !== 'static') {
    const gmin = gradientMinTier(gradient);
    if (!optionAllowed(gmin, tierIndex)) return { ok: false, error: 'Gradient locked for your tier' };
  }
  if (animated === true && type !== 'static') {
    if (!optionAllowed(TIERS.EARLY_SUPPORTER, tierIndex)) {
      return { ok: false, error: 'Animated usernames locked for your tier' };
    }
  }
  out.usernameStyle = { type, color, gradient, animated: type !== 'static' ? !!animated : false };

  // usernameEffect
  const effect = input.usernameEffect ?? 'none';
  if (!isValidUsernameEffect(effect)) return { ok: false, error: 'Invalid username effect' };
  if (!optionAllowed(USERNAME_EFFECTS[effect].minTier, tierIndex))
    return { ok: false, error: 'Username effect locked for your tier' };
  out.usernameEffect = effect;

  // profileBackground
  const bg = input.profileBackground ?? 'none';
  if (!isValidProfileBackground(bg)) return { ok: false, error: 'Invalid profile background' };
  if (!optionAllowed(PROFILE_BACKGROUNDS[bg].minTier, tierIndex))
    return { ok: false, error: 'Profile background locked for your tier' };
  out.profileBackground = bg;

  // profileBackgroundEffect
  const bgFx = input.profileBackgroundEffect ?? 'none';
  if (!isValidProfileBackgroundEffect(bgFx)) return { ok: false, error: 'Invalid background effect' };
  if (!optionAllowed(PROFILE_BACKGROUND_EFFECTS[bgFx].minTier, tierIndex))
    return { ok: false, error: 'Background effect locked for your tier' };
  out.profileBackgroundEffect = bgFx;

  // profileBorder
  const border = input.profileBorder ?? 'none';
  if (!isValidProfileBorder(border)) return { ok: false, error: 'Invalid profile border' };
  if (!optionAllowed(PROFILE_BORDERS[border].minTier, tierIndex))
    return { ok: false, error: 'Profile border locked for your tier' };
  out.profileBorder = border;

  // avatarFrame
  const frame = input.avatarFrame ?? 'none';
  if (!isValidAvatarFrame(frame)) return { ok: false, error: 'Invalid avatar frame' };
  if (!optionAllowed(AVATAR_FRAMES[frame].minTier, tierIndex))
    return { ok: false, error: 'Avatar frame locked for your tier' };
  out.avatarFrame = frame;

  // badge — must never exceed the user's earned tier
  const badgeSel = input.badge ?? badge;
  if (!isValidBadge(badgeSel)) return { ok: false, error: 'Invalid badge' };
  if (!optionAllowed(BADGES[badgeSel].minTier, tierIndex)) return { ok: false, error: 'Badge locked for your tier' };
  out.badge = badgeSel;

  // title
  const title = input.title ?? 'supporter';
  if (!isValidTitle(title)) return { ok: false, error: 'Invalid title' };
  if (!optionAllowed(TITLES[title].minTier, tierIndex)) return { ok: false, error: 'Title locked for your tier' };
  out.title = title;

  return { ok: true, cosmetics: out };
}

function gradientMinTier(gradient) {
  // gradients themselves are all tier-1 but animated gradients are tier-2
  return TIERS.SUPPORTER;
}

/**
 * Options payload sent to the frontend so it can render the customization
 * panel (labels/ids) consistent with the server's allowed set.
 */
export function getOptionsPayload() {
  return {
    tiers: TIER_ORDER,
    usernameColors: keysOf(USERNAME_COLORS, USERNAME_COLOR_TIER),
    gradients: keysOf(USERNAME_GRADIENTS),
    effects: minTierMap(USERNAME_EFFECTS),
    backgrounds: minTierMap(PROFILE_BACKGROUNDS),
    backgroundEffects: minTierMap(PROFILE_BACKGROUND_EFFECTS),
    borders: minTierMap(PROFILE_BORDERS),
    avatarFrames: minTierMap(AVATAR_FRAMES),
    badges: minTierMap(BADGES),
    titles: minTierMap(TITLES),
    presets: Object.fromEntries(
      Object.entries(PRESETS).map(([id, p]) => [id, { labelKey: p.labelKey, minTier: p.minTier, options: p.options }]),
    ),
  };
}

function keysOf(map, tierMap) {
  if (!tierMap) return Object.keys(map);
  return Object.keys(map).map((k) => ({ id: k, minTier: tierMap[k] || TIERS.SUPPORTER }));
}

function minTierMap(map) {
  return Object.fromEntries(Object.entries(map).map(([id, def]) => [id, def.minTier]));
}
