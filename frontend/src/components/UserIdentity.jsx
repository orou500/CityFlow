import React from 'react';
import Avatar from './Avatar.jsx';
import {
  usernameTextStyle,
  usernameGradientClassName,
  isAnimatedUsername,
  USERNAME_ANIMATED_CLASS,
  USERNAME_EFFECT_CLASS,
  PROFILE_BACKGROUND_CLASS,
  PROFILE_BACKGROUND_EFFECT_CLASS,
  PROFILE_BORDER_CLASS,
  BADGES,
  resolveOptionLabel,
} from '../config/supporterCosmetics.js';
import { useTranslation } from 'react-i18next';

/**
 * Shared identity renderer — the single component for displaying a player's
 * avatar, username (with whitelisted cosmetics), supporter badge and cosmetic
 * title consistently across the app (leaderboards, lists, profile, preview).
 *
 * Cosmetic styling is PURELY PRESENTATION: it never changes the underlying
 * canonical username, and it only maps server-validated cosmetic IDs to CSS
 * classes (raw CSS/HTML is never used). Reduced-motion is handled in CSS.
 *
 * Accepts either a full User doc/object or a lightweight lean identity object
 * (`{ username, displayName, avatar, cosmetics, supporterBadge }`). If
 * cosmetic fields are absent, it degrades gracefully to a plain username.
 *
 * `variant="card"` renders the profile identity card wrapper (profile
 * background + effects + border) used by BOTH the profile page and the
 * Supporter Style live preview, so preview always matches the real profile.
 */
export default function UserIdentity({
  user,
  username,
  displayName,
  avatar,
  cosmetics,
  supporterBadge,
  title,
  className = '',
  usernameClass = '',
  showAvatar = true,
  showBadge = true,
  titleClass = '',
  avatarClass = 'w-8 h-8',
  avatarTextClass = '',
  as = 'span',
  usernameAs = 'span',
  variant = 'inline',
  cardClassName = '',
  avatarOverlay = null,
  onClick,
  'aria-label': ariaLabel,
}) {
  const { t, i18n } = useTranslation();
  const name = displayName || user?.displayName || username || user?.username || 'Player';

  // Determine cosmetics (lean identity object fields OR full user doc).
  const cos = cosmetics || user?.cosmetics || null;
  const badgeId = supporterBadge || user?.supporter?.badge || null;
  const cosmeticTitle = title || cos?.title || user?.cosmetics?.title || null;

  const userStyle = cos?.usernameStyle || null;
  const effectId = cos?.usernameEffect || 'none';

  const effectiveBadge = badgeId && badgeId !== 'none' ? badgeId : null;
  const badgeMeta = effectiveBadge ? BADGES[effectiveBadge] : null;
  const showTitleBadge = cosmeticTitle && cosmeticTitle !== 'none' && showBadge;

  const style = usernameTextStyle(userStyle);
  const gradientCls = usernameGradientClassName(userStyle);
  const animatedCls = isAnimatedUsername(userStyle) ? USERNAME_ANIMATED_CLASS : '';
  const effectCls = USERNAME_EFFECT_CLASS[effectId] || '';

  const nameCls = `si-username ${gradientCls} ${animatedCls} ${effectCls} ${usernameClass}`;
  const UsernameTag = usernameAs;

  const usernameEl = (
    <UsernameTag className={nameCls} style={effectiveBadge ? style : undefined}>
      {name}
    </UsernameTag>
  );

  const identity = (
    <span className={`min-w-0 inline-flex items-center gap-1.5 ${variant === 'card' ? '' : ''}`} onClick={onClick}>
      {showAvatar && (
        <span className="relative shrink-0">
          <Avatar
            avatar={avatar || user?.avatar}
            name={name}
            className={avatarClass}
            textClassName={avatarTextClass}
            frame={cos?.avatarFrame}
          />
          {avatarOverlay}
        </span>
      )}
      <span className="min-w-0 inline-flex items-center gap-1.5 flex-wrap">
        {usernameEl}
        {showBadge && badgeMeta?.symbol && (
          <span
            aria-label={ariaLabel || (effectiveBadge ? t('supporterIdentity.badgeLabel') : undefined)}
            title={effectiveBadge ? t('supporterIdentity.badgeTitle') : undefined}
            className="si-badge si-badge-inline text-[0.7em]"
            data-badge={effectiveBadge}
          >
            {badgeMeta.symbol}
          </span>
        )}
        {showTitleBadge && (
          <span className={`si-title text-[0.72em] text-muted ${titleClass}`}>
            {resolveOptionLabel(t, 'title', cosmeticTitle, i18n)}
          </span>
        )}
      </span>
    </span>
  );

  if (variant === 'card') {
    const bgCls = PROFILE_BACKGROUND_CLASS[cos?.profileBackground] || '';
    const bgfxCls = PROFILE_BACKGROUND_EFFECT_CLASS[cos?.profileBackgroundEffect] || '';
    const borderCls = PROFILE_BORDER_CLASS[cos?.profileBorder] || '';
    return (
      <div className={`si-bg-card rounded-xl overflow-hidden ${cardClassName}`} data-testid="user-identity-card">
        <div className={`${bgCls} si-bg-layer`} aria-hidden="true" />
        <div className={`${bgfxCls} si-bg-layer`} aria-hidden="true" />
        <div className={`si-bg-content p-6 rounded-xl bg-gray-50/80 dark:bg-gray-900/60 ${borderCls} si-border`}>
          {identity}
        </div>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`} data-testid="user-identity">
      {identity}
    </span>
  );
}
