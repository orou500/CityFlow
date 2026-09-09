import { useTranslation } from 'react-i18next';
import { formatMoney } from '../utils/format';
import { useNavigate } from 'react-router-dom';

function PropertyTypeLabel({ type }) {
  const { t } = useTranslation();
  const key = `propertyType.${type}`;
  const label = t(key, { defaultValue: type });
  return <span className="capitalize text-xs text-gray-500 dark:text-gray-400">{label}</span>;
}

export default function RentalIncomeBreakdown({ data, locked, onHire, hiring }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!data && !locked) return null;

  if (locked) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-2">{t('dashboard.rentalIncomeTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('dashboard.rentalIncomeLockedHint')}</p>
        <button
          onClick={onHire}
          disabled={hiring}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
        >
          {hiring ? t('assistant.hiring') : t('assistant.hireButton')}
        </button>
      </div>
    );
  }

  const { totalRentalIncome, totalGrossIncome, properties } = data;
  const totalCosts = (properties || []).reduce(
    (sum, p) => sum + (p.maintenanceCost || 0) + (p.operatingExpenses || 0),
    0,
  );
  const hasIncome = totalRentalIncome > 0 && properties?.length > 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">{t('dashboard.rentalIncomeTitle')}</h2>

      {!hasIncome ? (
        <div>
          <p className="text-gray-500 dark:text-gray-400">{t('dashboard.noRentalIncome')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t('dashboard.noRentalIncomeHint')}</p>
        </div>
      ) : (
        <>
          <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {formatMoney(totalRentalIncome)}
            <span className="text-sm font-normal text-gray-400"> {t('dashboard.perMonth')}</span>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.totalRentalIncome')}</p>
          {totalGrossIncome > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {t('dashboard.rentGross')}: {formatMoney(totalGrossIncome)} · {t('dashboard.rentCosts')}: -
              {formatMoney(totalCosts)}
            </p>
          )}

          <div className="mt-4">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pe-2">{t('dashboard.rentProperty')}</th>
                    <th className="py-2 pe-2">{t('dashboard.rentCity')}</th>
                    <th className="py-2 pe-2 text-end">{t('dashboard.rentMonthly')}</th>
                    <th className="py-2 pe-2 text-end">{t('dashboard.rentActual')}</th>
                    <th className="py-2 text-end">{t('dashboard.rentShare')}</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((p) => (
                    <tr
                      key={p.propertyId}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                      onClick={() => navigate(`/property/${p.propertyId}`)}
                    >
                      <td className="py-2 pe-2">
                        <p className="font-semibold text-gray-900 dark:text-white">{p.name}</p>
                        <PropertyTypeLabel type={p.type} />
                      </td>
                      <td className="py-2 pe-2 text-gray-500 dark:text-gray-400">{p.city || '—'}</td>
                      <td className="py-2 pe-2 text-end text-gray-600 dark:text-gray-300">
                        {formatMoney(p.monthlyRent)}
                      </td>
                      <td className="py-2 pe-2 text-end text-green-600 dark:text-green-400">
                        {formatMoney(p.rentalIncome)}
                      </td>
                      <td className="py-2 text-end text-gray-600 dark:text-gray-300">
                        {p.percentageOfTotal.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold text-gray-900 dark:text-white">
                    <td className="py-2 pe-2" colSpan={3}>
                      {t('dashboard.rentTotal')}
                    </td>
                    <td className="py-2 pe-2 text-end text-purple-600 dark:text-purple-400">
                      {formatMoney(totalRentalIncome)}
                    </td>
                    <td className="py-2 text-end">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="md:hidden space-y-2">
              {properties.map((p) => (
                <div
                  key={p.propertyId}
                  className="bg-gray-50 dark:bg-gray-800 p-3 rounded cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => navigate(`/property/${p.propertyId}`)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {p.city || '—'} · <PropertyTypeLabel type={p.type} />
                      </p>
                    </div>
                    <p className="text-green-600 dark:text-green-400 font-semibold whitespace-nowrap">
                      {formatMoney(p.rentalIncome)}
                    </p>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
                    <span>
                      {t('dashboard.rentMonthly')}: {formatMoney(p.monthlyRent)}
                    </span>
                    <span>{p.percentageOfTotal.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded font-semibold text-gray-900 dark:text-white">
                <span>{t('dashboard.rentTotal')}</span>
                <span className="text-purple-600 dark:text-purple-400">{formatMoney(totalRentalIncome)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
