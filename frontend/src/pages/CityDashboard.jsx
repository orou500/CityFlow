import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';
import { formatMoney, formatCompact } from '../utils/format';
import CompactValue from '../components/CompactValue';

export default function CityDashboard() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const { selectedCity, cityProperties, cityEvents, fetchCity, buyProperty, sellProperty, loading } = useGameStore();
  const [actionMsg, setActionMsg] = useState(null);
  const [propPage, setPropPage] = useState(1);
  const PROPS_PER_PAGE = 21;

  useEffect(() => {
    if (id) {
      fetchCity(id);
      setPropPage(1);
    }
  }, [id, fetchCity]);

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

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <button
        onClick={() => navigate('/')}
        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-300 mb-4 inline-block"
      >
        &larr; {t('map.title')}
      </button>

      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
        <h1 className="text-3xl font-bold">{selectedCity.name}</h1>
        <p className="text-gray-500 dark:text-gray-400">{selectedCity.country}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('map.population')}</p>
            <p className="text-lg font-semibold">{formatCompact(selectedCity.population)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('map.demand')}</p>
            <p className="text-lg font-semibold">{selectedCity.demandIndex?.toFixed(2)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('map.supply')}</p>
            <p className="text-lg font-semibold">{selectedCity.supplyIndex?.toFixed(2)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('map.avgPrice')}</p>
            <p className="text-lg font-semibold">
              <CompactValue value={selectedCity.avgPrice} />
            </p>
          </div>
        </div>
      </div>

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
