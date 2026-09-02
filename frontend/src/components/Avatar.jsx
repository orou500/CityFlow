import { useState } from 'react';
import { getAvatarUrl } from '../utils/capacitor';
import useNativeAvatarUrl from '../hooks/useNativeAvatarUrl';

/**
 * Single reusable avatar renderer. Every avatar in the app flows through
 * getAvatarUrl() (web vs native base URL), useNativeAvatarUrl() (native blob
 * resolution on Capacitor) and — when the image is missing/broken — an
 * initials fallback, so a 404 avatar never renders an empty or HTML-poisoned
 * <img>.
 */
export default function Avatar({ avatar, name = '?', className = 'w-10 h-10', textClassName = '' }) {
  const src = useNativeAvatarUrl(getAvatarUrl(avatar || null));
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(src) && !errored;
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
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
}
