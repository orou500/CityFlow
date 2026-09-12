import { useCallback, useEffect, useRef, useState } from 'react';
import { isIOS, isStandalone, PWA_STATUS } from '../utils/pwa';

function getInitialStatus() {
  if (isStandalone()) return PWA_STATUS.INSTALLED;
  if (isIOS()) return PWA_STATUS.IOS;
  return PWA_STATUS.UNSUPPORTED;
}

/**
 * PWA install lifecycle for one hook instance.
 *
 * - Captures `beforeinstallprompt` ONCE (no duplicate listeners, even across
 *   React re-renders or StrictMode double-effects).
 * - Never calls `prompt()` automatically — only via `promptInstall()` after an
 *   explicit user interaction.
 * - Clears the deferred event after use and listens for `appinstalled`.
 * - `appinstalled`, the standalone display-mode change, or an accepted
 *   `userChoice` all transition to INSTALLED (CTA hidden).
 */
export default function usePwaInstall() {
  const [status, setStatus] = useState(getInitialStatus);
  const deferredPromptRef = useRef(null);
  const installedRef = useRef(isStandalone());
  const attachedRef = useRef(false);

  useEffect(() => {
    if (installedRef.current || attachedRef.current) return undefined;

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredPromptRef.current = event;
      setStatus(PWA_STATUS.INSTALLABLE);
    };

    const onAppInstalled = () => {
      installedRef.current = true;
      deferredPromptRef.current = null;
      setStatus(PWA_STATUS.INSTALLED);
    };

    const onStandaloneChange = (event) => {
      if (event.matches) {
        installedRef.current = true;
        deferredPromptRef.current = null;
        setStatus(PWA_STATUS.INSTALLED);
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', onStandaloneChange);

    attachedRef.current = true;

    return () => {
      if (!attachedRef.current) return;
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      mq.removeEventListener('change', onStandaloneChange);
      attachedRef.current = false;
    };
  }, []);

  /**
   * Shows the native install prompt (handled as a user gesture) and resolves
   * with the outcome. The deferred event is cleared before the prompt call so
   * the same event can never be used twice.
   */
  const promptInstall = useCallback(() => {
    const deferredEvent = deferredPromptRef.current;
    if (!deferredEvent || typeof deferredEvent.prompt !== 'function') {
      return Promise.resolve({ outcome: 'unsupported' });
    }
    deferredPromptRef.current = null;
    deferredEvent.prompt();
    return deferredEvent.userChoice
      .then((choice) => {
        if (choice?.outcome === 'accepted') {
          installedRef.current = true;
          setStatus(PWA_STATUS.INSTALLED);
        }
        return { outcome: choice?.outcome || 'dismissed' };
      })
      .catch(() => ({ outcome: 'dismissed' }));
  }, []);

  return { status, promptInstall };
}
