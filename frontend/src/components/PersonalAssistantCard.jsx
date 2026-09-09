import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../utils/format';

/**
 * Personal Assistant employment card. Pure presentation over the
 * server-authoritative assistant state from useGameStore; every mutation goes
 * through the backend (hire/fire) and the UI only reflects server responses.
 */
export default function PersonalAssistantCard({ assistant, onHire, onFire, hiring, firing }) {
  const { t } = useTranslation();
  const [confirmFire, setConfirmFire] = useState(false);

  if (!assistant) return null;

  const { status, salary, canHire, canFire } = assistant;
  const active = status === 'active';
  const firedThisMonth = status === 'fired' && !canHire;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-xl font-bold">{t('assistant.title')}</h2>
        {active && (
          <span className="text-xs font-semibold px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            {t('assistant.employed')}
          </span>
        )}
        {firedThisMonth && (
          <span className="text-xs font-semibold px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
            {t('assistant.fired')}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {active
          ? t('assistant.activeDescription')
          : firedThisMonth
            ? t('assistant.firedDescription')
            : t('assistant.availableDescription')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('assistant.statusLabel')}</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {active
              ? t('assistant.employed')
              : firedThisMonth
                ? t('assistant.firedThisMonth')
                : t('assistant.available')}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('assistant.salaryLabel')}</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {formatMoney(salary)}
            <span className="text-xs text-gray-400 font-normal"> {t('assistant.perMonth')}</span>
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('assistant.responsibilities')}</p>
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">
            {active ? '\u2713 ' : '\u2717 '}
            {t('assistant.rentalIncomeTracking')}
          </p>
        </div>
      </div>

      {firedThisMonth && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">{t('assistant.nextMonthMessage')}</p>
      )}

      {active && (
        <button
          onClick={() => setConfirmFire(true)}
          disabled={!canFire || firing}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
        >
          {t('assistant.fireButton')}
        </button>
      )}
      {!active && canHire && (
        <button
          onClick={onHire}
          disabled={hiring}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
        >
          {hiring ? t('assistant.hiring') : t('assistant.hireButton')}
        </button>
      )}

      {confirmFire && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-sm">
            <h3 className="text-gray-900 dark:text-white font-semibold mb-2">{t('assistant.fireConfirmTitle')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('assistant.fireConfirmBody')}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmFire(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  setConfirmFire(false);
                  onFire();
                }}
                disabled={firing}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded"
              >
                {firing ? t('assistant.firing') : t('assistant.fireConfirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
