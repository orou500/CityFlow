/**
 * Frontend mirror of backend/src/config/supporterCosmetics.js.
 *
 * Contains the SAME whitelisted cosmetic IDs plus the CSS class mapping used
 * to RENDER those cosmetics. The backend is the authority: it validates and
 * persists cosmetics; this file only translates validated IDs to styles. It
 * never receives raw CSS/HTML from a user.
 */

export const TIER_ORDER = ['none', 'supporter', 'early_supporter', 'founding_supporter'];

export const USERNAME_COLORS = {
  cityflow_blue: { value: '#1e90ff' },
  cityflow_cyan: { value: '#22d3ee' },
  cityflow_orange: { value: '#ff8c00' },
  purple: { value: '#a855f7' },
  red: { value: '#ef4444' },
  green: { value: '#22c55e' },
  gold: { value: '#f5b301' },
  white: { value: '#f8fafc' },
};

// CSS class name for a gradient username body (static gradient).
export const USERNAME_GRADIENT_CLASS = {
  cityflow_ocean: 'si-gradient-cityflow-ocean',
  ocean_dream: 'si-gradient-ocean-dream',
  sunset: 'si-gradient-sunset',
  royal: 'si-gradient-royal',
  neon: 'si-gradient-neon',
  empyrean: 'si-gradient-empyrean',
};

// CSS class for an animated gradient (background-position animation).
export const USERNAME_ANIMATED_CLASS = 'si-username-animated';

// Username effect -> CSS class (subtle, light-weight).
export const USERNAME_EFFECT_CLASS = {
  none: '',
  glow: 'si-effect-glow',
  soft_glow: 'si-effect-soft-glow',
  shimmer: 'si-effect-shimmer',
  pulse: 'si-effect-pulse',
  gradient_flow: 'si-effect-gradient-flow',
};

// Profile background -> CSS class. Render as an absolutely-positioned layer.
export const PROFILE_BACKGROUND_CLASS = {
  none: '',
  midnight_city: 'si-bg-midnight-city',
  blue_horizon: 'si-bg-blue-horizon',
  financial_district: 'si-bg-financial-district',
  neon_metro: 'si-bg-neon-metro',
  sunset_skyline: 'si-bg-sunset-skyline',
  ocean_city: 'si-bg-ocean-city',
  corporate_black: 'si-bg-corporate-black',
  global_empire: 'si-bg-global-empire',
  golden_hour: 'si-bg-golden-hour',
  deep_space: 'si-bg-deep-space',
};

// Background sub-effect -> class (stacked above the background layer).
export const PROFILE_BACKGROUND_EFFECT_CLASS = {
  none: '',
  gradient: 'si-bgfx-gradient',
  animated_gradient: 'si-bgfx-animated-gradient',
  city_lights: 'si-bgfx-city-lights',
  particles: 'si-bgfx-particles',
  grid: 'si-bgfx-grid',
  light_streaks: 'si-bgfx-light-streaks',
  skyline: 'si-bgfx-skyline',
  glass: 'si-bgfx-glass',
};

// Profile border -> class applied to a profile card.
export const PROFILE_BORDER_CLASS = {
  none: '',
  cityflow_blue: 'si-border-cityflow-blue',
  cyan: 'si-border-cyan',
  purple: 'si-border-purple',
  gold: 'si-border-gold',
  platinum: 'si-border-platinum',
  animated_gradient: 'si-border-animated-gradient',
};

// Avatar frame -> class applied to the avatar wrapper (ring/glow/frame around
// the unmodified avatar image).
export const AVATAR_FRAME_CLASS = {
  none: '',
  blue_glow: 'si-avatar-blue-glow',
  cyan_ring: 'si-avatar-cyan-ring',
  gold_ring: 'si-avatar-gold-ring',
  gradient_ring: 'si-avatar-gradient-ring',
  animated_ring: 'si-avatar-animated-ring',
  premium_frame: 'si-avatar-premium-frame',
};

export const BADGES = {
  none: { icon: '', symbol: '' },
  supporter: { icon: '❤️', symbol: '★' },
  early_supporter: { icon: '💎', symbol: '◆' },
  founding_supporter: { icon: '⭐', symbol: '✨' },
};

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

// Which cosmetic IDs are unlocked at which tier index (mirrors backend).
export const TIER_INDEX = { none: 0, supporter: 1, early_supporter: 2, founding_supporter: 3 };

// Option group -> { id: tierIndexRequired } for lock rendering.
export const OPTION_GROUPS = {
  usernameColor: {
    cityflow_blue: 1,
    cityflow_cyan: 1,
    cityflow_orange: 1,
    green: 1,
    white: 1,
    red: 2,
    purple: 2,
    gold: 3,
  },
  gradient: { cityflow_ocean: 1, ocean_dream: 1, sunset: 1, royal: 1, neon: 1, empyrean: 1 },
  animatedGradient: { _min: 2 },
  effect: { none: 1, soft_glow: 1, glow: 2, shimmer: 2, pulse: 2, gradient_flow: 2 },
  background: {
    none: 1,
    midnight_city: 1,
    blue_horizon: 1,
    financial_district: 1,
    neon_metro: 2,
    sunset_skyline: 2,
    ocean_city: 2,
    corporate_black: 2,
    global_empire: 3,
    golden_hour: 3,
    deep_space: 3,
  },
  backgroundEffect: {
    none: 1,
    gradient: 1,
    grid: 1,
    glass: 1,
    animated_gradient: 2,
    city_lights: 2,
    particles: 2,
    skyline: 2,
    light_streaks: 3,
  },
  border: { none: 1, cityflow_blue: 1, cyan: 1, purple: 2, gold: 2, platinum: 3, animated_gradient: 3 },
  avatarFrame: {
    none: 1,
    blue_glow: 1,
    cyan_ring: 1,
    gold_ring: 2,
    gradient_ring: 2,
    animated_ring: 2,
    premium_frame: 3,
  },
  badge: { none: 1, supporter: 1, early_supporter: 2, founding_supporter: 3 },
  title: {
    none: 1,
    supporter: 1,
    city_builder: 1,
    urban_investor: 2,
    empire_builder: 2,
    global_developer: 2,
    market_mogul: 3,
    cityflow_founder: 3,
  },
};

// Presets -> cosmetic defaults to apply; min tier index.
export const PRESETS = {
  cityflow: {
    minTier: 1,
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
    minTier: 2,
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
    minTier: 1,
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
    minTier: 2,
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
    minTier: 2,
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
    minTier: 2,
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
    minTier: 3,
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

// Convenience resolvers shared by renderer / panel.
export function tierIndexFor(badge) {
  return TIER_INDEX[badge] ?? 0;
}

/**
 * Style object to render a username's static color. If a gradient is set and
 * the style type is not 'static', returns the gradient class instead of a
 * flat color.
 */
export function usernameTextStyle(usernameStyle) {
  const s = usernameStyle || DEFAULT_COSMETICS.usernameStyle;
  if (!s || s.type === 'static') {
    return { color: USERNAME_COLORS[s?.color]?.value || USERNAME_COLORS.cityflow_blue.value };
  }
  return {};
}

export function usernameGradientClassName(usernameStyle) {
  const s = usernameStyle || DEFAULT_COSMETICS.usernameStyle;
  if (!s || s.type === 'static') return '';
  return USERNAME_GRADIENT_CLASS[s.gradient] || '';
}

export function isAnimatedUsername(usernameStyle) {
  return !!usernameStyle && usernameStyle.animated === true && usernameStyle.type !== 'static';
}

/* ============================================================
   Localized label resolution (single source of truth).
   Option IDs are canonical snake_case identifiers (matching the
   backend whitelist). The i18n keys in en.json/he.json use the
   SAME ids: `supporterIdentity.<group>.<id>`. Never render an id
   directly — always resolve through `resolveOptionLabel()` so
   unknown/future ids degrade to a safe localized fallback instead
   of leaking raw identifiers into the UI.
   ============================================================ */

/** Known ids per label group (derived from the canonical option maps). */
export const KNOWN_OPTION_IDS = {
  tier: ['none', 'supporter', 'early_supporter', 'founding_supporter'],
  color: [...Object.keys(OPTION_GROUPS.usernameColor)],
  gradient: [...Object.keys(OPTION_GROUPS.gradient), 'none'],
  effect: [...Object.keys(OPTION_GROUPS.effect)],
  background: [...Object.keys(OPTION_GROUPS.background)],
  backgroundEffect: [...Object.keys(OPTION_GROUPS.backgroundEffect)],
  border: [...Object.keys(OPTION_GROUPS.border)],
  avatarFrame: [...Object.keys(OPTION_GROUPS.avatarFrame)],
  badge: [...Object.keys(OPTION_GROUPS.badge)],
  title: [...Object.keys(OPTION_GROUPS.title)],
  preset: Object.keys(PRESETS),
};

/** Fallback id per group when an unknown id must never leak. */
export const LABEL_FALLBACK_KEYS = {
  tier: 'supporter',
  badge: 'supporter',
  title: 'supporter',
  color: 'cityflow_blue',
  preset: 'cityflow',
};

/**
 * Resolve a localized label for a cosmetic option id.
 *
 * - Known id → `supporterIdentity.<group>.<id>` (key exists in en/he).
 * - Unknown id → safe localized fallback (never the raw identifier),
 *   with a dev-only console warning.
 * - Missing key (id known but translation absent) → `i18n.exists()`
 *   guard falls back the same way when the i18n instance provides it.
 */
export function resolveOptionLabel(t, group, id, i18n) {
  const key = `supporterIdentity.${group}.${id}`;
  const known = KNOWN_OPTION_IDS[group]?.includes(id) === true;
  const exists = typeof i18n?.exists === 'function' ? i18n.exists(key) : true;
  if (known && exists) return t(key);

  if (import.meta.env?.DEV) {
    console.warn(`[supporter-identity] unresolved label for "${key}" — using safe fallback`);
  }
  const fallbackId = LABEL_FALLBACK_KEYS[group] || 'none';
  const fallbackKey = `supporterIdentity.${group}.${fallbackId}`;
  if (typeof i18n?.exists === 'function' && !i18n.exists(fallbackKey)) {
    return key;
  }
  return t(fallbackKey);
}
