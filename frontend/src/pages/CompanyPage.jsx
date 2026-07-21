import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatMoney, formatMoneyExact, formatCompact, formatCount } from '../utils/format';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getApiBaseUrl } from '../utils/capacitor';

const API = getApiBaseUrl();

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const INDUSTRY_ICONS = {
  technology: '\uD83D\uDCBB',
  finance: '\uD83D\uDCB0',
  manufacturing: '\uD83C\uDFED',
  retail: '\uD83C\uDFEA',
  energy: '\u26A1',
  healthcare: '\uD83C\uDFE5',
  logistics: '\uD83D\uDCE6',
  entertainment: '\uD83C\uDFAC',
};

export default function CompanyPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [company, setCompany] = useState(null);
  const [history, setHistory] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buyShares, setBuyShares] = useState('');
  const [sellShares, setSellShares] = useState('');
  const [trading, setTrading] = useState(false);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    loadCompany();
  }, [id]);

  async function loadCompany() {
    try {
      const [companyData, historyData, eventsData] = await Promise.all([
        api(`/companies/${id}`),
        api(`/companies/${id}/history`),
        api(`/companies/${id}/events`),
      ]);
      setCompany(companyData);
      setHistory(historyData);
      setEvents(eventsData);
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
      await api('/stocks/buy', {
        method: 'POST',
        body: JSON.stringify({ companyId: id, shares: numShares }),
      });
      setBuyShares('');
      loadCompany();
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
      await api('/stocks/sell', {
        method: 'POST',
        body: JSON.stringify({ companyId: id, shares: numShares }),
      });
      setSellShares('');
      loadCompany();
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

  if (!company) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">{t('stocks.notFound')}</div>
      </div>
    );
  }

  const priceChangeColor = company.dayChangePercent >= 0 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{INDUSTRY_ICONS[company.industry]}</span>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{company.name}</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{company.ticker}</span>
              <span className="capitalize">{company.industry}</span>
              <span className="capitalize">{company.size}</span>
            </div>
          </div>
        </div>
        <Link to="/stocks" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500">
          {t('stocks.backToMarket')}
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.sharePrice')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white">${company.sharePrice?.toFixed(2)}</div>
          <div className={`text-sm ${priceChangeColor}`}>
            {company.dayChange >= 0 ? '+' : ''}
            {company.dayChange?.toFixed(2)} ({company.dayChangePercent}%)
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.marketCap')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white" title={formatMoneyExact(company.marketCap)}>
            {formatMoney(company.marketCap)}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.employees')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white" title={company.employees?.toLocaleString()}>
            {formatCount(company.employees)}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.revenue')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white" title={formatMoneyExact(company.revenue)}>
            {formatMoney(company.revenue)}
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('stocks.priceChart')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.slice().reverse()}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
                  formatter={(value) => [`$${value.toFixed(2)}`, t('stocks.sharePrice')]}
                  labelFormatter={(label) => `${t('stocks.month')} ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#priceGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {company.userHolding && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">{t('stocks.yourPosition')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-blue-600 dark:text-blue-400">{t('stocks.shares')}</div>
              <div
                className="font-medium text-gray-900 dark:text-white"
                title={company.userHolding.shares.toLocaleString()}
              >
                {formatCount(company.userHolding.shares)}
              </div>
            </div>
            <div>
              <div className="text-blue-600 dark:text-blue-400">{t('stocks.avgBuyPrice')}</div>
              <div className="font-medium text-gray-900 dark:text-white">
                ${company.userHolding.avgBuyPrice?.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-blue-600 dark:text-blue-400">{t('stocks.currentValue')}</div>
              <div
                className="font-medium text-gray-900 dark:text-white"
                title={formatMoneyExact(company.userHolding.currentValue)}
              >
                {formatMoney(company.userHolding.currentValue)}
              </div>
            </div>
            <div>
              <div className="text-blue-600 dark:text-blue-400">{t('stocks.profitLoss')}</div>
              <div className={`font-medium ${company.userHolding.profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {company.userHolding.profitLoss >= 0 ? '+' : ''}
                <span title={formatMoneyExact(company.userHolding.profitLoss)}>
                  {formatMoney(company.userHolding.profitLoss)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('stocks.trade')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{t('stocks.buyShares')}</label>
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
                {t('stocks.buy')}
              </button>
            </div>
            {buyShares && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('stocks.total')}:{' '}
                <span title={formatMoneyExact(parseInt(buyShares) * company.sharePrice)}>
                  {formatMoney(parseInt(buyShares) * company.sharePrice)}
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{t('stocks.sellShares')}</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={sellShares}
                onChange={(e) => setSellShares(e.target.value)}
                placeholder="0"
                min="1"
                max={company.userHolding?.shares || 0}
                className="flex-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white"
              />
              <button
                onClick={handleSell}
                disabled={trading || !sellShares}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded font-medium"
              >
                {t('stocks.sell')}
              </button>
            </div>
            {sellShares && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('stocks.total')}:{' '}
                <span title={formatMoneyExact(parseInt(sellShares) * company.sharePrice)}>
                  {formatMoney(parseInt(sellShares) * company.sharePrice)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {['overview', 'history', 'events'].map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t2
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t(`stocks.tab${t2.charAt(0).toUpperCase() + t2.slice(1)}`)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('stocks.companyInfo')}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('stocks.hq')}</span>
                <span className="text-gray-900 dark:text-white">{company.hqCityId?.name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('stocks.offices')}</span>
                <span className="text-gray-900 dark:text-white">{company.offices?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('stocks.totalReturn')}</span>
                <span className={company.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {company.totalReturn >= 0 ? '+' : ''}
                  {company.totalReturn}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('stocks.high52')}</span>
                <span className="text-gray-900 dark:text-white">${company.high52Week?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('stocks.low52')}</span>
                <span className="text-gray-900 dark:text-white">${company.low52Week?.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('stocks.officesList')}</h3>
            <div className="space-y-2">
              {company.offices?.map((office, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-900 dark:text-white capitalize">{office.type}</span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400" title={office.employees?.toLocaleString()}>
                    {formatCount(office.employees)} {t('stocks.emp')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 overflow-x-auto">
          {history.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                  <th className="px-3 py-2 text-left">{t('stocks.month')}</th>
                  <th className="px-3 py-2 text-right">{t('stocks.sharePrice')}</th>
                  <th className="hidden sm:table-cell px-3 py-2 text-right">{t('stocks.employees')}</th>
                  <th className="hidden sm:table-cell px-3 py-2 text-right">{t('stocks.revenue')}</th>
                  <th className="hidden md:table-cell px-3 py-2 text-right">{t('stocks.marketCap')}</th>
                </tr>
              </thead>
              <tbody>
                {history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{h.tick}</td>
                      <td className="px-3 py-2 text-right text-gray-900 dark:text-white">${h.price?.toFixed(2)}</td>
                      <td
                        className="hidden sm:table-cell px-3 py-2 text-right text-gray-500 dark:text-gray-400"
                        title={h.employees?.toLocaleString()}
                      >
                        {formatCount(h.employees)}
                      </td>
                      <td
                        className="hidden sm:table-cell px-3 py-2 text-right text-gray-500 dark:text-gray-400"
                        title={formatMoneyExact(h.revenue)}
                      >
                        {formatMoney(h.revenue)}
                      </td>
                      <td
                        className="hidden md:table-cell px-3 py-2 text-right text-gray-500 dark:text-gray-400"
                        title={formatMoneyExact(h.marketCap)}
                      >
                        {formatMoney(h.marketCap)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8 text-gray-400">{t('stocks.noHistory')}</div>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          {events.length > 0 ? (
            <div className="space-y-2">
              {events
                .slice()
                .reverse()
                .map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    <span className="text-gray-500 dark:text-gray-400 w-16">
                      {t('stocks.month')} {e.tick}
                    </span>
                    <span className="text-gray-900 dark:text-white">{e.description}</span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">{t('stocks.noEvents')}</div>
          )}
        </div>
      )}
    </div>
  );
}
