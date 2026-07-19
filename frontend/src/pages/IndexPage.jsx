import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatMoney, formatMoneyExact, formatCompact, formatPrice, formatCount } from '../utils/format';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

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

const TYPE_ICONS = {
  world: '\uD83C\uDF0D',
  industry: '\uD83C\uDFED',
  city: '\uD83C\uDFD9',
};

export default function IndexPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [index, setIndex] = useState(null);
  const [history, setHistory] = useState([]);
  const [constituents, setConstituents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buyShares, setBuyShares] = useState('');
  const [sellShares, setSellShares] = useState('');
  const [trading, setTrading] = useState(false);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    loadIndex();
  }, [id]);

  async function loadIndex() {
    try {
      const [indexData, historyData, constData] = await Promise.all([
        api(`/indexes/${id}`),
        api(`/indexes/${id}/history`),
        api(`/indexes/${id}/constituents`),
      ]);
      setIndex(indexData);
      setHistory(historyData);
      setConstituents(constData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleBuy() {
    const numShares = parseInt(buyShares);
    if (!numShares || numShares <= 0) return;
    setTrading(true);
    try {
      await api('/indexes/buy', {
        method: 'POST',
        body: JSON.stringify({ indexId: id, shares: numShares }),
      });
      setBuyShares('');
      loadIndex();
    } catch (e) {
      alert(e.message);
    }
    setTrading(false);
  }

  async function handleSell() {
    const numShares = parseInt(sellShares);
    if (!numShares || numShares <= 0) return;
    setTrading(true);
    try {
      await api('/indexes/sell', {
        method: 'POST',
        body: JSON.stringify({ indexId: id, shares: numShares }),
      });
      setSellShares('');
      loadIndex();
    } catch (e) {
      alert(e.message);
    }
    setTrading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  if (!index) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">{t('indexes.notFound')}</div>
      </div>
    );
  }

  const priceChangeColor = index.dayChangePercent >= 0 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{TYPE_ICONS[index.type]}</span>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{index.name}</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{index.ticker}</span>
              <span className="capitalize">{index.type}</span>
            </div>
          </div>
        </div>
        <Link to="/stocks" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500">
          {t('indexes.backToMarket')}
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.indexValue')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white" title={`$${index.value?.toFixed(2)}`}>
            {formatPrice(index.value)}
          </div>
          <div className={`text-sm ${priceChangeColor}`}>
            {index.dayChange >= 0 ? '+' : ''}
            {index.dayChange?.toFixed(2)} ({index.dayChangePercent}%)
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.totalReturn')}</div>
          <div className={`text-xl font-bold ${index.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {index.totalReturn >= 0 ? '+' : ''}
            {index.totalReturn}%
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.constituents')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white">{index.constituentCount}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.high52')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white" title={`$${index.high52Week?.toFixed(2)}`}>
            {formatPrice(index.high52Week)}
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('indexes.valueChart')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.slice().reverse()}>
                <defs>
                  <linearGradient id="indexGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="tick" stroke="#6b7280" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#f3f4f6',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`$${value.toFixed(2)}`, t('indexes.indexValue')]}
                  labelFormatter={(label) => `${t('indexes.month')} ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#indexGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {index.userHolding && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">{t('indexes.yourPosition')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-blue-600 dark:text-blue-400">{t('indexes.shares')}</div>
              <div
                className="font-medium text-gray-900 dark:text-white"
                title={index.userHolding.shares.toLocaleString()}
              >
                {formatCount(index.userHolding.shares)}
              </div>
            </div>
            <div>
              <div className="text-blue-600 dark:text-blue-400">{t('indexes.avgBuyPrice')}</div>
              <div className="font-medium text-gray-900 dark:text-white">
                ${index.userHolding.avgBuyPrice?.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-blue-600 dark:text-blue-400">{t('indexes.currentValue')}</div>
              <div
                className="font-medium text-gray-900 dark:text-white"
                title={formatMoneyExact(index.userHolding.currentValue)}
              >
                {formatMoney(index.userHolding.currentValue)}
              </div>
            </div>
            <div>
              <div className="text-blue-600 dark:text-blue-400">{t('indexes.profitLoss')}</div>
              <div className={`font-medium ${index.userHolding.profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {index.userHolding.profitLoss >= 0 ? '+' : ''}
                <span title={formatMoneyExact(index.userHolding.profitLoss)}>
                  {formatMoney(index.userHolding.profitLoss)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('indexes.trade')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{t('indexes.buyShares')}</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={buyShares}
                onChange={(e) => setBuyShares(e.target.value)}
                placeholder="0"
                min="1"
                className="flex-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white"
              />
              <button
                onClick={handleBuy}
                disabled={trading || !buyShares}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded font-medium"
              >
                {t('indexes.buy')}
              </button>
            </div>
            {buyShares && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('indexes.total')}:{' '}
                <span title={formatMoneyExact(parseInt(buyShares) * index.value)}>
                  {formatMoney(parseInt(buyShares) * index.value)}
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{t('indexes.sellShares')}</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={sellShares}
                onChange={(e) => setSellShares(e.target.value)}
                placeholder="0"
                min="1"
                max={index.userHolding?.shares || 0}
                className="flex-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white"
              />
              <button
                onClick={handleSell}
                disabled={trading || !sellShares}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded font-medium"
              >
                {t('indexes.sell')}
              </button>
            </div>
            {sellShares && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('indexes.total')}:{' '}
                <span title={formatMoneyExact(parseInt(sellShares) * index.value)}>
                  {formatMoney(parseInt(sellShares) * index.value)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {['overview', 'constituents'].map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t2
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t(`indexes.tab${t2.charAt(0).toUpperCase() + t2.slice(1)}`)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">{t('indexes.indexType')}</span>
              <span className="text-gray-900 dark:text-white capitalize">{index.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">{t('indexes.constituents')}</span>
              <span className="text-gray-900 dark:text-white">{index.constituentCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">{t('indexes.high52')}</span>
              <span className="text-gray-900 dark:text-white" title={`$${index.high52Week?.toFixed(2)}`}>
                {formatPrice(index.high52Week)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">{t('indexes.low52')}</span>
              <span className="text-gray-900 dark:text-white" title={`$${index.low52Week?.toFixed(2)}`}>
                {formatPrice(index.low52Week)}
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'constituents' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                  <th className="px-4 py-3 text-left">{t('indexes.company')}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left">{t('indexes.industry')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.sharePrice')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.change')}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-right">{t('indexes.marketCap')}</th>
                </tr>
              </thead>
              <tbody>
                {constituents.map((c) => (
                  <tr
                    key={c._id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/company/${c._id}`}
                        className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{c.ticker}</div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-500 dark:text-gray-400 capitalize">
                      {c.industry}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">${c.sharePrice?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={c.dayChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {c.dayChangePercent >= 0 ? '+' : ''}
                        {c.dayChangePercent}%
                      </span>
                    </td>
                    <td
                      className="hidden sm:table-cell px-4 py-3 text-right text-gray-500 dark:text-gray-400"
                      title={formatMoneyExact(c.marketCap)}
                    >
                      {formatMoney(c.marketCap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {constituents.length === 0 && (
            <div className="text-center py-8 text-gray-400">{t('indexes.noConstituents')}</div>
          )}
        </div>
      )}
    </div>
  );
}
