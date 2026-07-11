import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';

const API = '/api';

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function PriceHistoryChart({ history }) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const [activeIdx, setActiveIdx] = useState(null);
  const [pinned, setPinned] = useState(false);

  if (!history || history.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-500 text-sm">
        {t('propertyDetail.notEnoughData')}
      </div>
    );
  }

  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 600;
  const h = 160;
  const padding = 24;
  const chartW = w - padding * 2;
  const chartH = h - padding * 2;

  const getPoint = (i) => {
    const t = i / (prices.length - 1);
    const x = isRtl ? padding + (1 - t) * chartW : padding + t * chartW;
    const y = padding + chartH - ((prices[i] - min) / range) * chartH;
    return { x, y };
  };

  const polyline = prices
    .map((_, i) => {
      const pt = getPoint(i);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');

  const startColor = prices[0] <= prices[prices.length - 1] ? '#1E90FF' : '#ef4444';

  const active = activeIdx !== null ? history[activeIdx] : null;
  const activePt = activeIdx !== null ? getPoint(activeIdx) : null;
  const prevPrice = activeIdx > 0 ? history[activeIdx - 1].price : null;
  const diff = activeIdx > 0 && active ? active.price - history[activeIdx - 1].price : null;
  const diffPct = diff !== null && prevPrice ? (diff / prevPrice) * 100 : null;

  const fmt = (v) => `$${v.toLocaleString('en-US')}`;
  const fmtDiff = (v) => {
    const sign = v >= 0 ? '+' : '';
    return `${sign}$${Math.abs(v).toLocaleString('en-US')}`;
  };
  const fmtPct = (v) => {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  };

  const showPoint = (i) => {
    if (!pinned) setActiveIdx(i);
  };
  const hidePoint = () => {
    if (!pinned) setActiveIdx(null);
  };
  const clickPoint = (i) => {
    if (pinned && activeIdx === i) {
      setPinned(false);
      setActiveIdx(null);
    } else {
      setActiveIdx(i);
      setPinned(true);
    }
  };

  const isTopHalf = activePt && activePt.y < h * 0.35;

  return (
    <div className="relative" onMouseLeave={hidePoint}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible">
        <polyline
          fill="none"
          stroke={startColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polyline}
        />
        <text
          x={isRtl ? w - padding : padding}
          y={padding + 10}
          className="fill-gray-600 dark:fill-gray-300 text-[10px]"
          textAnchor={isRtl ? 'end' : 'start'}
        >
          {fmt(min)}
        </text>
        <text
          x={isRtl ? w - padding : padding}
          y={h - padding - 4}
          className="fill-gray-600 dark:fill-gray-300 text-[10px]"
          textAnchor={isRtl ? 'end' : 'start'}
        >
          {fmt(max)}
        </text>
        <text
          x={isRtl ? padding : w - padding}
          y={h - padding - 4}
          className="fill-gray-600 dark:fill-gray-300 text-[10px]"
          textAnchor={isRtl ? 'start' : 'end'}
        >
          {prices.length} {t('general.periods')}
        </text>
        {prices.map((_, i) => {
          const pt = getPoint(i);
          const isActive = activeIdx === i;
          return (
            <g key={i}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isActive ? 5 : 3.5}
                fill={isActive ? '#1E90FF' : '#6b7280'}
                stroke={isActive ? '#0057B8' : 'none'}
                strokeWidth={isActive ? 2 : 0}
              />
              <circle
                cx={pt.x}
                cy={pt.y}
                r="14"
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => showPoint(i)}
                onClick={() => clickPoint(i)}
              />
            </g>
          );
        })}
      </svg>

      {active && activePt && (
        <div
          className={`absolute z-10 min-w-[140px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs shadow-lg ${pinned ? 'shadow-2xl ring-1 ring-blue-500/40' : 'pointer-events-none'}`}
          style={{
            left: `${(activePt.x / w) * 100}%`,
            top: isTopHalf ? `${(activePt.y / h) * 100 + 2}%` : `${(activePt.y / h) * 100}%`,
            transform: isTopHalf ? 'translate(-50%, 10px)' : 'translate(-50%, calc(-100% - 10px))',
          }}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              ...(isTopHalf
                ? { top: '-5px', borderBottom: '5px solid var(--color-border)' }
                : { bottom: '-5px', borderTop: '5px solid var(--color-border)' }),
            }}
          />

          <div className="space-y-0.5">
            <div>
              <span className="text-gray-500 dark:text-gray-400">{t('propertyDetail.chartMonth')}</span> {active.tick}
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">{t('propertyDetail.chartPrice')}</span>{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">{fmt(active.price)}</span>
            </div>
            {diff !== null && (
              <>
                <div className={`${diff >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                  <span className="text-gray-500 dark:text-gray-400">{t('propertyDetail.chartChange')}</span>{' '}
                  {fmtDiff(diff)} ({fmtPct(diffPct)})
                </div>
                <div className="text-gray-400 dark:text-gray-500">
                  <span className="text-gray-500 dark:text-gray-400">{t('propertyDetail.chartPrevious')}</span>{' '}
                  {fmt(prevPrice)}
                </div>
              </>
            )}
          </div>

          {pinned && (
            <button
              onClick={() => {
                setPinned(false);
                setActiveIdx(null);
              }}
              className="absolute -top-2 -right-2 w-4 h-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-300 text-[10px] leading-none"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const propertyTypes = {
  apartment: 'Apartment',
  house: 'House',
  commercial: 'Commercial',
  land: 'Land',
};

export default function PropertyPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const { fetchUserData, createOffer } = useGameStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerLoading, setOfferLoading] = useState(false);
  const [unitsPage, setUnitsPage] = useState(0);
  const UNITS_PER_PAGE = 5;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api(`/properties/${id}/detail`);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) {
      setUnitsPage(0);
      load();
    }
  }, [id]);

  const handleBuy = async () => {
    try {
      const res = await api('/properties/buy', {
        method: 'POST',
        body: JSON.stringify({ propertyId: id }),
      });
      setActionMsg({ type: 'success', text: t('errors.propertyPurchased') });
      load();
      fetchMe();
      fetchUserData();
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
  };

  const handleSell = async () => {
    try {
      const res = await api('/properties/sell', {
        method: 'POST',
        body: JSON.stringify({ propertyId: id }),
      });
      const price = res.balance || res.property?.currentPrice || 0;
      setActionMsg({ type: 'success', text: t('errors.propertySold', { price: price.toLocaleString() }) });
      load();
      fetchMe();
      fetchUserData();
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
  };

  const handleMakeOffer = async () => {
    const amount = parseFloat(offerAmount);
    if (!amount || amount <= 0) return;
    setOfferLoading(true);
    try {
      await createOffer(id, amount);
      setActionMsg({ type: 'success', text: t('propertyDetail.offerSent') });
      setShowOfferModal(false);
      setOfferAmount('');
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
    setOfferLoading(false);
  };

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-600 dark:text-red-400">
          {error ? translateError(new Error(error), t) : t('errors.Property not found')}
        </p>
      </div>
    );
  }

  const { property, totalRentEarned, totalInvestment } = data;
  const isOwner = user && property.ownerId?._id === user._id;
  const isBankOwned = !property?.ownerId;
  const canOffer = user && !isOwner && !isBankOwned && property?.ownerId;

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 mb-4 inline-block"
      >
        &larr; {t('propertyDetail.backToCity')}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h1 className="text-2xl font-bold mb-4">{property.name}</h1>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.currentValue')}</p>
                <p className="text-lg font-bold text-orange-500 dark:text-orange-400">
                  ${property.currentPrice?.toLocaleString()}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.baseValue')}</p>
                <p className="text-lg font-semibold">${property.basePrice?.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.rentIncome')}</p>
                <p className="text-lg font-semibold text-orange-500 dark:text-orange-400">
                  ${property.rent?.toLocaleString()}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.condition')}</p>
                <p className="text-lg font-semibold">{property.condition}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-3">{t('propertyDetail.marketInfo')}</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.demandIndex')}</p>
                <p className="text-lg font-semibold">{property.cityId?.demandIndex?.toFixed(2) || '—'}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.supplyIndex')}</p>
                <p className="text-lg font-semibold">{property.cityId?.supplyIndex?.toFixed(2) || '—'}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.growthRate')}</p>
                <p className="text-lg font-semibold">
                  {property.cityId?.growthRate != null ? `${(property.cityId.growthRate * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>
          </div>

          {property.units && property.units.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-3">
                {t('propertyDetail.buildingUnits', { count: property.units.length })}
              </h2>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.occupancy')}</p>
                  <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{property.occupancy}%</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.maintenanceCost')}</p>
                  <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                    ${property.maintenanceCost?.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {(() => {
                  const start = unitsPage * UNITS_PER_PAGE;
                  const end = start + UNITS_PER_PAGE;
                  const pageUnits = property.units.slice(start, end);
                  const totalPages = Math.ceil(property.units.length / UNITS_PER_PAGE);
                  return (
                    <>
                      {pageUnits.map((unit, i) => (
                        <div
                          key={start + i}
                          className="bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded text-sm flex justify-between items-center"
                        >
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">
                              {t('propertyDetail.unitNumber', { number: unit.unitNumber })}
                            </span>
                            <span className="text-gray-400 dark:text-gray-500 ml-2">
                              {unit.type?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-blue-600 dark:text-blue-400">
                              ${unit.rentPrice?.toLocaleString()}
                              {t('propertyDetail.perPeriod')}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${unit.occupied ? 'bg-blue-900 text-blue-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                            >
                              {unit.occupied ? t('propertyDetail.occupied') : t('propertyDetail.vacant')}
                            </span>
                          </div>
                        </div>
                      ))}
                      {property.units.length > UNITS_PER_PAGE && (
                        <div className="flex items-center justify-between pt-2 text-xs text-gray-500 dark:text-gray-400">
                          <button
                            onClick={() => setUnitsPage((p) => Math.max(0, p - 1))}
                            disabled={unitsPage === 0}
                            className="px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            &larr; {t('common.previous')}
                          </button>
                          <span>
                            {t('common.showingRange', {
                              start: start + 1,
                              end: Math.min(end, property.units.length),
                              total: property.units.length,
                            })}
                          </span>
                          <button
                            onClick={() => setUnitsPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={unitsPage >= totalPages - 1}
                            className="px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            {t('common.next')} &rarr;
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-3">{t('propertyDetail.priceHistory')}</h2>
            <div className="overflow-visible">
              <PriceHistoryChart history={property.priceHistory} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">{t('propertyDetail.ownership')}</h2>
            {isOwner ? (
              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.owner')}</p>
                  <p className="font-semibold">{user.username}</p>
                </div>
                {property.lastPurchasePrice && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.purchasePrice')}</p>
                    <p className="font-semibold">${property.lastPurchasePrice?.toLocaleString()}</p>
                  </div>
                )}
                {property.lastPurchaseDate && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.purchaseDate')}</p>
                    <p className="font-semibold text-sm">{new Date(property.lastPurchaseDate).toLocaleDateString()}</p>
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.totalRentEarned')}</p>
                  <p className="font-semibold text-purple-600 dark:text-purple-400">
                    ${totalRentEarned?.toLocaleString() || '0'}
                  </p>
                </div>
                {totalInvestment > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.totalInvestment')}</p>
                    <p className="font-semibold text-orange-500 dark:text-orange-400">
                      ${totalInvestment?.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            ) : property.ownerId ? (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.owner')}</p>
                <p className="font-semibold">{property.ownerId.username || 'Unknown'}</p>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">{t('propertyDetail.unowned')}</p>
            )}
          </div>

          {actionMsg && (
            <div
              className={`p-3 rounded text-sm ${actionMsg.type === 'success' ? 'bg-blue-900 text-blue-300' : 'bg-red-900 text-red-300'}`}
            >
              {actionMsg.text}
              <button onClick={() => setActionMsg(null)} className="ml-2">
                &times;
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">{t('propertyDetail.actions')}</h2>
            <div className="space-y-2">
              {property.cityId && (
                <button
                  onClick={() => navigate(`/city/${property.cityId._id || property.cityId}`)}
                  className="w-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm py-2 rounded transition-colors"
                >
                  {t('propertyDetail.navToCity')}
                </button>
              )}
              {user && !isOwner && property.forSale && (
                <button
                  onClick={handleBuy}
                  className="w-full bg-orange-500 hover:bg-orange-400 text-gray-900 dark:text-white text-sm py-2 rounded transition-colors"
                >
                  {t('propertyDetail.buyProperty')} — ${property.currentPrice?.toLocaleString()}
                </button>
              )}
              {canOffer && (
                <button
                  onClick={() => setShowOfferModal(true)}
                  className="w-full bg-orange-500 hover:bg-orange-400 text-gray-900 dark:text-white text-sm py-2 rounded transition-colors"
                >
                  {t('propertyDetail.makeOffer')}
                </button>
              )}
              {user && isOwner && (
                <button
                  onClick={handleSell}
                  className="w-full bg-yellow-600 hover:bg-yellow-500 text-gray-900 dark:text-white text-sm py-2 rounded transition-colors"
                >
                  {t('propertyDetail.sellProperty')} — ${property.currentPrice?.toLocaleString()}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showOfferModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-sm">
            <h3 className="text-gray-900 dark:text-white font-semibold mb-2">{t('propertyDetail.makeAnOffer')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('propertyDetail.marketValue')}: ${property.currentPrice?.toLocaleString()}
              <br />
              {t('propertyDetail.minimumOffer')}: ${Math.round(property.currentPrice * 0.7).toLocaleString()} (70%)
            </p>
            <input
              type="number"
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              placeholder={t('propertyDetail.yourOfferAmount')}
              className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-gray-900 dark:text-white text-sm mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleMakeOffer}
                disabled={offerLoading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 dark:disabled:bg-gray-600 text-gray-900 dark:text-white text-sm rounded transition-colors"
              >
                {offerLoading ? t('propertyDetail.sending') : t('propertyDetail.sendOffer')}
              </button>
              <button
                onClick={() => setShowOfferModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
