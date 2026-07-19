import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatMoney, formatMoneyExact, formatPrice } from '../utils/format';

const API = '/api';

async function api(path) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

const TYPE_COLORS = {
  world: 'bg-yellow-900 text-yellow-300',
  industry: 'bg-blue-900 text-blue-300',
  city: 'bg-green-900 text-green-300',
};

const TYPE_ICONS = {
  world: '\uD83C\uDF0D',
  industry: '\uD83C\uDFED',
  city: '\uD83C\uDFD9',
};

export default function IndexMarket() {
  const { t } = useTranslation();
  const [indexes, setIndexes] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('value');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [indexesData, overviewData] = await Promise.all([api('/indexes'), api('/indexes/market/overview')]);
      setIndexes(indexesData);
      setOverview(overviewData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const filtered = indexes
    .filter((i) => !typeFilter || i.type === typeFilter)
    .filter(
      (i) =>
        !search ||
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.ticker.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === 'change') return b.dayChangePercent - a.dayChangePercent;
      if (sortBy === 'return') return b.totalReturn - a.totalReturn;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.value - a.value;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('indexes.title')}</h1>
        <Link to="/stocks/portfolio" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500">
          {t('indexes.myPortfolio')}
        </Link>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.totalIndexes')}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{overview.totalIndexes}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.topGainer')}</div>
            {overview.gainers[0] ? (
              <div className="text-lg font-semibold text-green-500">
                {overview.gainers[0].ticker} +{overview.gainers[0].dayChangePercent}%
              </div>
            ) : (
              <div className="text-lg font-semibold text-gray-400">-</div>
            )}
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.topLoser')}</div>
            {overview.losers[0] ? (
              <div className="text-lg font-semibold text-red-500">
                {overview.losers[0].ticker} {overview.losers[0].dayChangePercent}%
              </div>
            ) : (
              <div className="text-lg font-semibold text-gray-400">-</div>
            )}
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.worldIndex')}</div>
            {overview.gainers.concat(overview.losers).find((i) => i.ticker === 'WLD') ? (
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {overview.gainers.concat(overview.losers).find((i) => i.ticker === 'WLD').dayChangePercent >= 0
                  ? '+'
                  : ''}
                {overview.gainers.concat(overview.losers).find((i) => i.ticker === 'WLD').dayChangePercent}%
              </div>
            ) : (
              <div className="text-lg font-semibold text-gray-400">-</div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('indexes.search')}
          className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
        >
          <option value="">{t('indexes.allTypes')}</option>
          <option value="world">{t('indexes.typeWorld')}</option>
          <option value="industry">{t('indexes.typeIndustry')}</option>
          <option value="city">{t('indexes.typeCity')}</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
        >
          <option value="value">{t('indexes.indexValue')}</option>
          <option value="change">{t('indexes.change')}</option>
          <option value="return">{t('indexes.totalReturn')}</option>
          <option value="name">{t('indexes.name')}</option>
        </select>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                <th className="px-4 py-3 text-left">{t('indexes.index')}</th>
                <th className="px-4 py-3 text-left">{t('indexes.type')}</th>
                <th className="px-4 py-3 text-right">{t('indexes.indexValue')}</th>
                <th className="px-4 py-3 text-right">{t('indexes.change')}</th>
                <th className="px-4 py-3 text-right">{t('indexes.totalReturn')}</th>
                <th className="px-4 py-3 text-right">{t('indexes.constituents')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((idx) => (
                <tr
                  key={idx._id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
                >
                  <td className="px-4 py-3">
                    <Link to={`/index/${idx._id}`} className="flex items-center gap-2">
                      <span className="text-lg">{TYPE_ICONS[idx.type]}</span>
                      <div>
                        <div className="text-gray-900 dark:text-white font-medium">{idx.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{idx.ticker}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${TYPE_COLORS[idx.type]}`}>
                      {t(`indexes.type${idx.type.charAt(0).toUpperCase() + idx.type.slice(1)}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium" title={`$${idx.value?.toFixed(2)}`}>
                    {formatPrice(idx.value)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={idx.dayChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}>
                      {idx.dayChangePercent >= 0 ? '+' : ''}
                      {idx.dayChangePercent}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={idx.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}>
                      {idx.totalReturn >= 0 ? '+' : ''}
                      {idx.totalReturn}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{idx.constituentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500">{t('indexes.noIndexes')}</div>
        )}
      </div>
    </div>
  );
}
