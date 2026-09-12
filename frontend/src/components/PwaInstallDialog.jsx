import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PWA_STATUS } from '../utils/pwa';

/**
 * Install prompt dialog. Follows the existing ConfirmDialog modal pattern
 * (role=dialog, aria-modal, aria-label, Escape to close, backdrop click to
 * close, RTL) — it is NOT a second modal system.
 *
 * - INSTALLABLE (Chrome/Edge/Android with a captured beforeinstallprompt):
 *   explicit Install / Not Now.
 * - IOS: honest step-by-step "Share -> Add to Home Screen -> Add" instructions.
 *   Never fakes a native prompt.
 */
export default function PwaInstallDialog({ open, status, onClose, onInstall }) {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  if (status !== PWA_STATUS.INSTALLABLE && status !== PWA_STATUS.IOS) return null;

  const isRtl = i18n?.language?.toLowerCase().startsWith('he');
  const isInstallable = status === PWA_STATUS.INSTALLABLE;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isInstallable ? t('pwa.title') : t('pwa.iosTitle')}
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <img src="/icons/pwa-192x192.png" alt={t('pwa.appIconAlt')} className="w-12 h-12 rounded-xl shrink-0" />
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
            {isInstallable ? t('pwa.title') : t('pwa.iosTitle')}
          </h3>
        </div>

        {isInstallable ? (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">{t('pwa.description')}</p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 sm:py-2.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('pwa.cancelButton')}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  onInstall();
                  onClose();
                }}
                className="flex-1 px-4 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('pwa.installButton')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">{t('pwa.iosIntro')}</p>
            <ol className="space-y-3 mb-5">
              {[1, 2, 3].map((step) => (
                <li key={step} className="flex items-start gap-3 text-sm text-gray-500 dark:text-gray-400">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white flex items-center justify-center text-xs font-bold">
                    {step}
                  </span>
                  <span className="leading-relaxed">{t(`pwa.iosStep${step}`)}</span>
                </li>
              ))}
            </ol>
            <div className="flex justify-end">
              <button
                type="button"
                autoFocus
                onClick={onClose}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('pwa.gotItButton')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
