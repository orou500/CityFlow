import { useTranslation } from 'react-i18next';
import { formatMoney } from '../utils/format';

export default function RentInfoPanel({ data }) {
  const { t } = useTranslation();

  if (!data) return null;

  const hasHeadroom = data.nextAvailableIncrease > 0;
  const grandfathered = data.maxValidatedRentPerUnit > data.currentMaxPerUnit;

  return (
    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
      <p className="text-sm font-semibold mb-2">{t('propertyManagement.rentSummary')}</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-500 dark:text-gray-400">{t('propertyManagement.currentRentPerUnit')}</span>
          <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(data.perUnitRent)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 dark:text-gray-400">{t('propertyManagement.marketRentPerUnit')}</span>
          <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(data.marketRate)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 dark:text-gray-400">{t('propertyManagement.maximumRentPerUnit')}</span>
          <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(data.effectiveMaxPerUnit)}</span>
        </div>
        {grandfathered && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('propertyManagement.grandfatheredRentNote', { amount: formatMoney(data.maxValidatedRentPerUnit) })}
          </p>
        )}
        <div className="flex justify-between items-center">
          <span className="text-gray-500 dark:text-gray-400">{t('propertyManagement.nextAvailableIncrease')}</span>
          {hasHeadroom ? (
            <span className="font-semibold text-green-600 dark:text-green-400">
              +{formatMoney(data.nextAvailableIncrease)}
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {t('propertyManagement.noIncreaseAvailable')}
            </span>
          )}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 dark:text-gray-400">{t('propertyManagement.netMonthlyIncome')}</span>
          <span
            className={`font-semibold ${data.netIncome >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}
          >
            {formatMoney(data.netIncome)}
          </span>
        </div>
      </div>
    </div>
  );
}
