import { useTranslation } from 'react-i18next';

export default function MaintenanceBanner({ message }) {
  const { t } = useTranslation();

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <span className="text-yellow-600 dark:text-yellow-400 text-lg">⚠️</span>
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{t('maintenance.bannerTitle')}</p>
          {message && <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">{message}</p>}
        </div>
      </div>
    </div>
  );
}
