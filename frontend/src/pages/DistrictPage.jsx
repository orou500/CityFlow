import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../utils/capacitor';
import { formatMoney, formatCompact } from '../utils/format';
import { localizeCityName, localizeCountryName } from '../utils/cityNames';
import PropertyImage from '../components/PropertyImage';
import Avatar from '../components/Avatar';
import {
  usernameTextStyle,
  usernameGradientClassName,
  isAnimatedUsername,
  USERNAME_ANIMATED_CLASS,
  USERNAME_EFFECT_CLASS,
} from '../config/supporterCosmetics';

const TIER_STYLES = {
  premium: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-300', icon: '👑' },
  growing: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-700 dark:text-green-300', icon: '📈' },
  commercial: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-300', icon: '🏢' },
  affordable: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-300', icon: '🏠' },
  suburban: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', icon: '🌳' },
  moderate: { bg: 'bg-teal-100 dark:bg-teal-900/50', text: 'text-teal-700 dark:text-teal-300', icon: '🏘️' },
};

const INFLUENCE_TIER_STYLES = {
  market_leader: { color: 'text-yellow-500', label: 'Market Leader' },
  significant_investor: { color: 'text-blue-500', label: 'Significant Investor' },
  minor_investor: { color: 'text-green-500', label: 'Minor Investor' },
  observer: { color: 'text-gray-400', label: 'Observer' },
};

export default function DistrictPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const API = getApiBaseUrl();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState(null);
  const [influence, setInfluence] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/districts/${id}`).then((r) => r.json()),
      fetch(`${API}/districts/${id}/history`).then((r) => r.json()),
      fetch(`${API}/districts/${id}/influence`).then((r) => r.json()),
    ])
      .then(([distData, histData, infData]) => {
        if (distData.error) setError(distData.error);
        else {
          setData(distData);
          setHistory(histData);
          setInfluence(infData);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load district');
        setLoading(false);
      });
  }, [id, API]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{error}</h2>
          <Link to="/map" className="text-blue-600 dark:text-blue-400 hover:underline">
            {t('common.goHome')}
          </Link>
        </div>
      </div>
    );
  }

  const { district, topInvestors, recentProperties, stats } = data;
  const tierStyle = TIER_STYLES[district.tier] || TIER_STYLES.suburban;
  const cityName = district.cityId?.name || 'Unknown';
  const countryCode = district.cityId?.country || '';
  const localizedCityName = localizeCityName(cityName, t);
  const localizedCountryName = localizeCountryName(countryCode, t);

  const tabs = [
    { key: 'overview', label: t('districts.overview', 'Overview') },
    { key: 'investors', label: t('districts.investors', 'Investors') },
    { key: 'properties', label: t('districts.properties', 'Properties') },
    { key: 'events', label: t('districts.events', 'Events') },
    { key: 'history', label: t('districts.history', 'History') },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
          <Link to="/map" className="hover:text-blue-500 min-w-0 truncate">
            {t('nav.map')}
          </Link>
          <span className="shrink-0">/</span>
          <Link to={`/city/${district.cityId?._id || ''}`} className="hover:text-blue-500 min-w-0 truncate">
            {localizedCityName}
          </Link>
          <span>/</span>
          <span className="text-gray-900 dark:text-white">{district.name}</span>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col md:flex-row items-start gap-4">
            <div className="text-4xl">{tierStyle.icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{district.name}</h1>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tierStyle.bg} ${tierStyle.text}`}>
                  {district.tier.charAt(0).toUpperCase() + district.tier.slice(1)}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {localizedCityName}, {localizedCountryName}
              </p>
            </div>
            {district.activeEvents?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {district.activeEvents.map((ev, i) => (
                  <span
                    key={i}
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      ev.type === 'positive'
                        ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                        : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {ev.type === 'positive' ? '+' : ''} {ev.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label={t('districts.population', 'Population')} value={formatCompact(district.population)} />
          <StatCard
            label={t('districts.demandIndex', 'Demand')}
            value={district.demandIndex?.toFixed(2)}
            color={
              district.demandIndex > 1.3
                ? 'text-green-500'
                : district.demandIndex < 0.8
                  ? 'text-red-500'
                  : 'text-gray-900 dark:text-white'
            }
          />
          <StatCard
            label={t('districts.supplyIndex', 'Supply')}
            value={district.supplyIndex?.toFixed(2)}
            color={
              district.supplyIndex < 0.8
                ? 'text-green-500'
                : district.supplyIndex > 1.5
                  ? 'text-red-500'
                  : 'text-gray-900 dark:text-white'
            }
          />
          <StatCard
            label={t('districts.avgPrice', 'Avg Price')}
            value={formatMoney(district.avgPrice)}
            color="text-orange-500"
          />
          <StatCard
            label={t('districts.growthRate', 'Growth')}
            value={`${(district.growthRate * 100).toFixed(1)}%`}
            color={district.growthRate > 0 ? 'text-green-500' : 'text-red-500'}
          />
          <StatCard
            label={t('districts.properties', 'Properties')}
            value={stats?.propertyCount ?? district.propertyCount ?? 0}
            color="text-blue-500"
          />
        </div>

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.key
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                {t('districts.marketInsights', 'Market Insights')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InsightRow
                  label={t('districts.priceToRent', 'Price-to-Rent Ratio')}
                  value={district.avgRent > 0 ? (district.avgPrice / (district.avgRent * 12)).toFixed(1) + 'x' : 'N/A'}
                />
                <InsightRow
                  label={t('districts.rentalYield', 'Rental Yield')}
                  value={
                    district.avgPrice > 0
                      ? (((district.avgRent * 12) / district.avgPrice) * 100).toFixed(1) + '%'
                      : 'N/A'
                  }
                />
                <InsightRow
                  label={t('districts.avgRent', 'Avg Rent')}
                  value={formatMoney(district.avgRent || 0) + '/mo'}
                />
                <InsightRow
                  label={t('districts.totalValue', 'Total Value')}
                  value={formatMoney(stats?.totalValue || 0)}
                />
                <InsightRow
                  label={t('districts.occupancyRate', 'Occupancy')}
                  value={(stats?.occupancyRate ?? 0) + '%'}
                />
                <InsightRow label={t('districts.forSale', 'For Sale')} value={stats?.forSaleCount ?? 0} />
                <InsightRow label={t('districts.playerOwned', 'Player-Owned')} value={stats?.ownedCount ?? 0} />
                <InsightRow
                  label={t('districts.companyOwned', 'Company-Owned')}
                  value={stats?.companyOwnedCount ?? 0}
                />
                <InsightRow
                  label={t('districts.investorCount', 'Active Investors')}
                  value={topInvestors?.length || 0}
                />
                <InsightRow
                  label={t('districts.marketLeader', 'Market Leader')}
                  value={topInvestors?.[0]?.displayName || t('districts.none', 'None')}
                />
                <InsightRow
                  label={t('districts.leaderInfluence', 'Leader Influence')}
                  value={topInvestors?.[0] ? (topInvestors[0].score * 100).toFixed(1) + '%' : '0%'}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'investors' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('districts.topInvestors', 'Top Investors')}
            </h2>
            {topInvestors?.length > 0 ? (
              <div className="space-y-2">
                {topInvestors.map((inv, i) => {
                  const tierInfo = INFLUENCE_TIER_STYLES[inv.tier] || INFLUENCE_TIER_STYLES.observer;
                  const cos = inv.cosmetics || null;
                  const us = cos?.usernameStyle;
                  const nameStyle = usernameTextStyle(us);
                  const nameClass = [
                    usernameGradientClassName(us),
                    isAnimatedUsername(us) ? USERNAME_ANIMATED_CLASS : '',
                    cos?.usernameEffect ? USERNAME_EFFECT_CLASS[cos.usernameEffect] : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <div
                      key={inv.userId}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-400 w-6">#{i + 1}</span>
                        <Avatar
                          avatar={inv.avatar}
                          name={inv.displayName}
                          frame={cos?.avatarFrame}
                          className="w-8 h-8"
                        />
                        <div>
                          <Link
                            to={`/profile/${inv.username}`}
                            className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-500"
                            style={cos ? nameStyle : undefined}
                          >
                            <span className={cos ? nameClass : undefined}>{inv.displayName}</span>
                          </Link>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{inv.propertyCount} properties</p>
                        </div>
                      </div>
                      <div className="text-end">
                        <span className={`text-sm font-bold ${tierInfo.color}`}>{(inv.score * 100).toFixed(1)}%</span>
                        <p className={`text-xs ${tierInfo.color}`}>{tierInfo.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('districts.noInvestors', 'No investors yet')}
              </p>
            )}
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('districts.recentProperties', 'Properties in District')}{' '}
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({stats?.propertyCount ?? recentProperties?.length ?? 0})
              </span>
            </h2>
            {recentProperties?.length > 0 ? (
              <div className="space-y-2">
                {recentProperties.map((prop) => (
                  <Link
                    key={prop._id}
                    to={`/property/${prop._id}`}
                    className="flex justify-between items-center gap-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 rounded-lg p-3 transition-colors"
                  >
                    <PropertyImage
                      property={prop}
                      alt={prop.name}
                      className="w-14 h-14 object-cover rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{prop.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-1 flex-wrap">
                        <span>{prop.type}</span>
                        {prop.forSale && <span className="text-green-600 dark:text-green-400">For Sale</span>}
                        {prop.ownerId && <span>· {prop.ownerId.displayName || prop.ownerId.username}</span>}
                        {prop.companyId && <span className="text-blue-500">· Company</span>}
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="text-sm font-semibold text-orange-500">{formatMoney(prop.currentPrice)}</div>
                      {prop.rent > 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{formatMoney(prop.rent)}/mo</div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('districts.noProperties', 'No properties yet')}
              </p>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('districts.activeEvents', 'Active Events')}
            </h2>
            {district.activeEvents?.length > 0 ? (
              <div className="space-y-3">
                {district.activeEvents.map((ev, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-lg border ${
                      ev.type === 'positive'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3
                          className={`font-semibold ${
                            ev.type === 'positive'
                              ? 'text-green-800 dark:text-green-200'
                              : 'text-red-800 dark:text-red-200'
                          }`}
                        >
                          {ev.name}
                        </h3>
                        <p
                          className={`text-sm ${
                            ev.type === 'positive'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {t('districts.eventsRemaining', { count: ev.remainingTicks })}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded ${
                          ev.type === 'positive'
                            ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                            : 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200'
                        }`}
                      >
                        {ev.type === 'positive' ? '+' : ''}
                        {((ev.effects.demandDelta || 0) * 100).toFixed(0)}% demand
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('districts.noEvents', 'No active events')}</p>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('districts.priceHistory', 'Price History')}
            </h2>
            {history?.history?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                      <th className="text-start px-3 py-2">{t('districts.historyTick', 'Month')}</th>
                      <th className="text-start px-3 py-2">{t('districts.avgPrice', 'Avg Price')}</th>
                      <th className="text-start px-3 py-2">{t('districts.demandIndex', 'Demand')}</th>
                      <th className="text-start px-3 py-2">{t('districts.supplyIndex', 'Supply')}</th>
                      <th className="text-start px-3 py-2">{t('districts.growthRate', 'Growth')}</th>
                      <th className="text-start px-3 py-2">{t('districts.population', 'Population')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.history
                      .slice(-30)
                      .reverse()
                      .map((entry, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 text-gray-500">{entry.tick}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                            {formatMoney(entry.avgPrice)}
                          </td>
                          <td className="px-3 py-2">{entry.demandIndex?.toFixed(2)}</td>
                          <td className="px-3 py-2">{entry.supplyIndex?.toFixed(2)}</td>
                          <td className="px-3 py-2">{(entry.growthRate * 100).toFixed(1)}%</td>
                          <td className="px-3 py-2">{formatCompact(entry.population)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('districts.noHistory', 'No history yet')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
      <div className={`text-xl font-bold ${color || 'text-gray-900 dark:text-white'}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function InsightRow({ label, value }) {
  return (
    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-2">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <span className="text-sm font-semibold text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}
