import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function MaintenancePage({ message }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/30 mb-4">
            <span className="text-4xl">🔧</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('maintenance.title')}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t('maintenance.subtitle')}</p>
        </div>

        {message && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{message}</p>
          </div>
        )}

        <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">{t('maintenance.checkBack')}</p>

        <Link
          to="/login"
          className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
        >
          {t('maintenance.staffLogin')}
        </Link>
      </div>
    </div>
  );
}
