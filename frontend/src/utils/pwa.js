import { isNativePlatform } from './capacitor';

/**
 * Installation state for the PWA install experience.
 */
export const PWA_STATUS = {
  UNSUPPORTED: 'unsupported',
  IOS: 'ios',
  INSTALLABLE: 'installable',
  INSTALLED: 'installed',
};

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)');
  return mq.matches || (typeof window.navigator.standalone === 'boolean' && window.navigator.standalone === true);
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS (>= 13) reports macOS; a Macintosh UA with touch points is an iPad.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function defaultRegisterSw() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return Promise.resolve(null);
  return navigator.serviceWorker.register('/sw.js');
}

/**
 * Register the service worker. Production + web only.
 *
 * Enabled AND requirements (each can be injected for tests):
 *   - `isProd`  : import.meta.env.PROD — false in dev, Vitest and preview.
 *   - `isNative`: Capacitor builds must never register a browser SW.
 *   - browsers without ServiceWorker support are skipped.
 *
 * Returns { registered, reason } for tests and diagnostics.
 */
export function registerServiceWorker({
  isProd = import.meta.env.PROD,
  isNative = isNativePlatform(),
  register = defaultRegisterSw,
} = {}) {
  if (!isProd) {
    return { registered: false, reason: 'not-production' };
  }
  if (isNative) {
    return { registered: false, reason: 'native' };
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { registered: false, reason: 'unsupported' };
  }
  Promise.resolve(register()).catch(() => {});
  return { registered: true, reason: 'ok' };
}
