import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../utils/capacitor';
import { formatMoney, formatCompact } from '../utils/format';

const TIER_STYLES = {
  premium: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-300', icon: '👑' },
  growing: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-700 dark:text-green-300', icon: '📈' },
  commercial: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-300', icon: '🏢' },
  affordable: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-300', icon: '🏠' },
  suburban: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', icon: '🌳' },
};

export default function DistrictListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const API = getApiBaseUrl();
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('price');

  const selectedCity = searchParams.get('city') || '';

  useEffect(() => {
    setLoading(true);
    const url = selectedCity
      ? `${API}/districts?cityId=${selectedCity}`
      : `${API}/districts/leaderboard/top?sortBy=${sortBy}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setDistricts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch(`${API}/cities`)
      .then((r) => r.json())
      .then((data) => setCities(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [API, selectedCity, sortBy]);

  const sorted = [...districts].sort((a, b) => {
    if (sortBy === 'demand') return (b.demandIndex || 0) - (a.demandIndex || 0);
    if (sortBy === 'growth') return (b.growthRate || 0) - (a.growthRate || 0);
    return (b.avgPrice || 0) - (a.avgPrice || 0);
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('districts.pageTitle', 'Districts')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('districts.pageSubtitle', 'Explore neighborhoods and compete for local influence')}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={selectedCity}
            onChange={(e) => {
              if (e.target.value) setSearchParams({ city: e.target.value });
              else setSearchParams({});
            }}
            className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
          >
            <option value="">{t('districts.allCities', 'All Cities')}</option>
            {cities.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {['price', 'demand', 'growth'].map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortBy === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {s === 'price'
                  ? t('districts.price', 'Price')
                  : s === 'demand'
                    ? t('districts.demand', 'Demand')
                    : t('districts.growth', 'Growth')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {t('districts.noDistricts', 'No districts found')}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sorted.map((district) => {
              const tierStyle = TIER_STYLES[district.tier] || TIER_STYLES.suburban;
              const cityName = district.cityId?.name || 'Unknown';
              return (
                <Link
                  key={district._id}
                  to={`/district/${district._id}`}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-blue-400 dark:hover:border-blue-500 transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{tierStyle.icon}</span>
                        <h3 className="font-bold text-gray-900 dark:text-white">{district.name}</h3>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cityName}</p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tierStyle.bg} ${tierStyle.text}`}
                    >
                      {district.tier}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">
                        {t('districts.avgPrice', 'Avg Price')}
                      </div>
                      <div className="font-semibold text-orange-500">{formatMoney(district.avgPrice)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">
                        {t('districts.demandIndex', 'Demand')}
                      </div>
                      <div
                        className={`font-semibold ${
                          district.demandIndex > 1.3
                            ? 'text-green-500'
                            : district.demandIndex < 0.8
                              ? 'text-red-500'
                              : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {district.demandIndex?.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">
                        {t('districts.growthRate', 'Growth')}
                      </div>
                      <div className={`font-semibold ${district.growthRate > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {(district.growthRate * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">
                        {t('districts.properties', 'Properties')}
                      </div>
                      <div className="font-semibold text-gray-900 dark:text-white">{district.propertyCount || 0}</div>
                    </div>
                  </div>

                  {district.activeEvents?.length > 0 && (
                    <div className="mt-3 flex gap-1 flex-wrap">
                      {district.activeEvents.map((ev, i) => (
                        <span
                          key={i}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            ev.type === 'positive'
                              ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                              : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                          }`}
                        >
                          {ev.name}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
