import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';
import { formatMoney, formatCompact } from '../utils/format';
import CompactValue from '../components/CompactValue';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const ECONOMIC_COLORS = {
  boom: 'bg-green-900 text-green-300',
  growth: 'bg-blue-900 text-blue-300',
  stable: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
  slowdown: 'bg-yellow-900 text-yellow-300',
  recession: 'bg-red-900 text-red-300',
};

export default function CityDashboard() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const { selectedCity, cityProperties, cityEvents, cityDemographics, fetchCity, buyProperty, sellProperty, loading } =
    useGameStore();
  const [actionMsg, setActionMsg] = useState(null);
  const [propPage, setPropPage] = useState(1);
  const [historyData, setHistoryData] = useState([]);
  const PROPS_PER_PAGE = 21;

  useEffect(() => {
    if (id) {
      fetchCity(id);
      setPropPage(1);
      fetchHistory(id);
    }
  }, [id, fetchCity]);

  const fetchHistory = async (cityId) => {
    try {
      const hist = await api(`/cities/${cityId}/history?limit=24`);
      setHistoryData(hist);
    } catch {
      setHistoryData([]);
    }
  };

  const handleBuy = async (propertyId) => {
    try {
      await buyProperty(propertyId);
      setActionMsg({ type: 'success', text: t('errors.propertyPurchased') });
      if (id) fetchCity(id);
      if (user) fetchMe();
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
  };

  const handleSell = async (propertyId) => {
    try {
      await sellProperty(propertyId);
      setActionMsg({ type: 'success', text: t('errors.propertyListed') });
      if (id) fetchCity(id);
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
  };

  if (loading && !selectedCity) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  if (!selectedCity) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('common.error')}</p>
      </div>
    );
  }

  const propertyTypes = {
    apartment: t('property.apartment'),
    house: t('property.house'),
    commercial: t('property.commercial'),
    land: t('property.land'),
  };

  const demo = cityDemographics;
  const netMigration = demo ? demo.immigration - demo.emigration : 0;

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <button
        onClick={() => navigate('/')}
        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-300 mb-4 inline-block"
      >
        &larr; {t('map.title')}
      </button>

      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h1 className="text-3xl font-bold">{selectedCity.name}</h1>
            <p className="text-gray-500 dark:text-gray-400">{selectedCity.country}</p>
          </div>
          {demo && (
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${ECONOMIC_COLORS[demo.economicCondition] || ECONOMIC_COLORS.stable}`}
            >
              {t(`demographics.economicConditions.${demo.economicCondition}`)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('demographics.population')}</p>
            <p className="text-lg font-semibold">{formatCompact(selectedCity.population)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('demographics.demandIndex')}</p>
            <p className="text-lg font-semibold">{selectedCity.demandIndex?.toFixed(2)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('demographics.supplyIndex')}</p>
            <p className="text-lg font-semibold">{selectedCity.supplyIndex?.toFixed(2)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('demographics.growthRate')}</p>
            <p
              className={`text-lg font-semibold ${(selectedCity.growthRate || 0) >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}
            >
              {((selectedCity.growthRate || 0) * 100).toFixed(2)}%
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('demographics.avgRent')}</p>
            <p className="text-lg font-semibold">
              <CompactValue value={demo?.avgRent || selectedCity.avgRent || 0} />
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('map.avgPrice')}</p>
            <p className="text-lg font-semibold">
              <CompactValue value={selectedCity.avgPrice} />
            </p>
          </div>
        </div>
      </div>

      {demo && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">{t('demographics.title')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('demographics.immigration')}</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">+{formatCompact(demo.immigration)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('demographics.perMonth')}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('demographics.emigration')}</p>
              <p className="text-lg font-bold text-red-500">-{formatCompact(demo.emigration)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('demographics.perMonth')}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('demographics.netMigration')}</p>
              <p
                className={`text-lg font-bold ${netMigration >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}
              >
                {netMigration >= 0 ? '+' : ''}
                {formatCompact(netMigration)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('demographics.perMonth')}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('demographics.economicCondition')}</p>
              <p className="text-lg font-bold capitalize">
                {t(`demographics.economicConditions.${demo.economicCondition}`)}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('demographics.avgRentLevel')}</p>
              <p className="text-lg font-bold">
                <CompactValue value={demo.avgRent || 0} />
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('demographics.housingDemand')}</p>
              <p
                className={`text-lg font-bold ${demo.demandIndex >= 1.2 ? 'text-green-600 dark:text-green-400' : demo.demandIndex <= 0.8 ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}
              >
                {demo.demandIndex >= 1.5
                  ? t('demographics.demandLevels.veryHigh')
                  : demo.demandIndex >= 1.2
                    ? t('demographics.demandLevels.high')
                    : demo.demandIndex >= 0.8
                      ? t('demographics.demandLevels.medium')
                      : t('demographics.demandLevels.low')}
              </p>
            </div>
          </div>
        </div>
      )}

      {historyData.length > 1 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">{t('demographics.history')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-1 pr-2">{t('demographics.month')}</th>
                  <th className="text-right py-1 px-2">{t('demographics.population')}</th>
                  <th className="text-right py-1 px-2">{t('demographics.netMigration')}</th>
                  <th className="text-right py-1 px-2">{t('demographics.growthRate')}</th>
                  <th className="text-right py-1 px-2">{t('demographics.avgRent')}</th>
                  <th className="text-right py-1 pl-2">{t('demographics.economicCondition')}</th>
                </tr>
              </thead>
              <tbody>
                {historyData
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((entry, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="py-1 pr-2 text-gray-600 dark:text-gray-300">
                        {t('propertyManagement.tick', { number: entry.tick })}
                      </td>
                      <td className="py-1 px-2 text-right">{formatCompact(entry.population)}</td>
                      <td
                        className={`py-1 px-2 text-right ${entry.immigration - entry.emigration >= 0 ? 'text-blue-500' : 'text-red-500'}`}
                      >
                        {entry.immigration - entry.emigration >= 0 ? '+' : ''}
                        {formatCompact(entry.immigration - entry.emigration)}
                      </td>
                      <td
                        className={`py-1 px-2 text-right ${(entry.growthRate || 0) >= 0 ? 'text-blue-500' : 'text-red-500'}`}
                      >
                        {((entry.growthRate || 0) * 100).toFixed(2)}%
                      </td>
                      <td className="py-1 px-2 text-right text-blue-600 dark:text-blue-400">
                        <CompactValue value={entry.avgRent || 0} />
                      </td>
                      <td className="py-1 pl-2 text-right capitalize">
                        {t(`demographics.economicConditions.${entry.economicCondition}`)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cityEvents.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-3">{t('city.events')}</h2>
          <div className="space-y-2">
            {cityEvents.map((event) => (
              <div
                key={event._id}
                className="bg-gray-50 dark:bg-gray-800 p-3 rounded flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold">{event.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{event.description}</p>
                </div>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {event.remainingTicks} {t('general.periods')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {actionMsg && (
        <div
          className={`p-3 rounded mb-4 text-sm ${actionMsg.type === 'success' ? 'bg-blue-900 text-blue-300' : 'bg-red-900 text-red-300'}`}
        >
          {actionMsg.text}
          <button onClick={() => setActionMsg(null)} className="ml-2">
            &times;
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">
          {t('map.properties')} ({cityProperties.length})
        </h2>
        {cityProperties.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">{t('city.noProperties')}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
              {cityProperties.slice(0, propPage * PROPS_PER_PAGE).map((p) => {
                const isOwner = user && p.ownerId?._id === user._id;
                return (
                  <div key={p._id} className="bg-gray-50 dark:bg-gray-800 p-4 rounded flex flex-col gap-2 h-full">
                    <div className="flex-1 cursor-pointer" onClick={() => navigate(`/property/${p._id}`)}>
                      <h3 className="font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        {p.name}
                      </h3>
                      <div className="flex gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1 flex-wrap">
                        <span>{propertyTypes[p.type] || p.type}</span>
                        <span>·</span>
                        <span>
                          {t('city.rent')}: {formatMoney(p.rent)}
                        </span>
                        {p.ownerId && (
                          <>
                            <span>·</span>
                            <span>
                              {t('city.owner')}: {p.ownerId.username || 'Unknown'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-lg font-bold text-orange-500 dark:text-orange-400">
                        <CompactValue value={p.currentPrice} />
                      </p>
                      {!user && <p className="text-xs text-gray-400 dark:text-gray-500">{t('city.forSale')}</p>}
                      {user && !isOwner && p.forSale && (
                        <button
                          onClick={() => handleBuy(p._id)}
                          className="bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-sm px-4 py-1.5 rounded transition-colors"
                        >
                          {t('city.buy')}
                        </button>
                      )}
                      {user && isOwner && (
                        <div className="flex gap-2">
                          <span className="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded">{t('city.owned')}</span>
                          {!p.forSale && (
                            <button
                              onClick={() => handleSell(p._id)}
                              className="text-xs bg-yellow-600 hover:bg-yellow-500 text-gray-900 dark:text-white px-2 py-1 rounded transition-colors"
                            >
                              {t('city.sell')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {cityProperties.length > PROPS_PER_PAGE && (
              <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700 mt-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('dashboard.showing', {
                    shown: Math.min(propPage * PROPS_PER_PAGE, cityProperties.length),
                    total: cityProperties.length,
                  })}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPropPage((p) => Math.max(1, p - 1))}
                    disabled={propPage === 1}
                    className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('marketplace.previous')}
                  </button>
                  <button
                    onClick={() => setPropPage((p) => p + 1)}
                    disabled={propPage * PROPS_PER_PAGE >= cityProperties.length}
                    className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('marketplace.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
