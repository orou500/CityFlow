import { useState } from 'react';
import { getAvatarUrl } from '../utils/capacitor';
import useNativeAvatarUrl from '../hooks/useNativeAvatarUrl';
import { AVATAR_FRAME_CLASS } from '../config/supporterCosmetics.js';

/**
 * Single reusable avatar renderer. Every avatar in the app flows through
 * getAvatarUrl() (web vs native base URL), useNativeAvatarUrl() (native blob
 * resolution on Capacitor) and — when the image is missing/broken — an
 * initials fallback, so a 404 avatar never renders an empty or HTML-poisoned
 * <img>.
 *
 * `frame` (optional) is a whitelisted supporter cosmetic frame/ring ID (see
 * config/supporterCosmetics.js). It renders a cosmetic border/glow around the
 * UNMODIFIED avatar image only — the image itself is never altered and the ID
 * is validated server-side. Pass `frame="none"`/undefined for no frame.
 */
export default function Avatar({ avatar, name = '?', className = 'w-10 h-10', textClassName = '', frame }) {
  const src = useNativeAvatarUrl(getAvatarUrl(avatar || null));
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(src) && !errored;
  const initial = (name || '?').charAt(0).toUpperCase();
  const frameClass = frame && frame !== 'none' ? AVATAR_FRAME_CLASS[frame] : '';

  const inner = (
    <div
      aria-hidden="true"
      className={`${className} rounded-full overflow-hidden bg-blue-600 text-white flex items-center justify-center shrink-0`}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
          onLoad={() => setErrored(false)}
        />
      ) : (
        <span className={`text-xs font-medium leading-none ${textClassName}`}>{initial}</span>
      )}
    </div>
  );

  if (!frameClass) return inner;

  return (
    <span className={`si-avatar ${frameClass}`} aria-hidden="true">
      <span className="si-avatar-inner">{inner}</span>
    </span>
  );
}
