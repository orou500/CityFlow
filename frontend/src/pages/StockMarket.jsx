import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatMoney, formatMoneyExact, formatCount, formatPrice } from '../utils/format';

const API = '/api';

async function api(path) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

const INDUSTRY_COLORS = {
  technology: 'bg-blue-900 text-blue-300',
  finance: 'bg-green-900 text-green-300',
  manufacturing: 'bg-yellow-900 text-yellow-300',
  retail: 'bg-pink-900 text-pink-300',
  energy: 'bg-red-900 text-red-300',
  healthcare: 'bg-cyan-900 text-cyan-300',
  logistics: 'bg-purple-900 text-purple-300',
  entertainment: 'bg-orange-900 text-orange-300',
};

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

const INDEX_TYPE_ICONS = {
  world: '\uD83C\uDF0D',
  industry: '\uD83C\uDFED',
  city: '\uD83C\uDFD9',
};

const INDEX_TYPE_COLORS = {
  world: 'bg-yellow-900 text-yellow-300',
  industry: 'bg-blue-900 text-blue-300',
  city: 'bg-green-900 text-green-300',
};

function CompaniesTab() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [industryFilter, setIndustryFilter] = useState('');
  const [sortBy, setSortBy] = useState('marketCap');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [companiesData, overviewData] = await Promise.all([api('/companies'), api('/companies/market/overview')]);
      setCompanies(companiesData);
      setOverview(overviewData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const filtered = companies
    .filter((c) => !industryFilter || c.industry === industryFilter)
    .filter(
      (c) =>
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.ticker.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === 'price') return b.sharePrice - a.sharePrice;
      if (sortBy === 'change') return b.dayChangePercent - a.dayChangePercent;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.marketCap - a.marketCap;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <>
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.totalMarketCap')}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white" title={formatMoneyExact(overview.totalMarketCap)}>
              {formatMoney(overview.totalMarketCap)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.totalCompanies')}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{overview.totalCompanies}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.topGainer')}</div>
            {overview.gainers[0] ? (
              <div className="text-lg font-semibold text-green-500">
                {overview.gainers[0].ticker} +{overview.gainers[0].dayChangePercent}%
              </div>
            ) : (
              <div className="text-lg font-semibold text-gray-400">-</div>
            )}
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.topLoser')}</div>
            {overview.losers[0] ? (
              <div className="text-lg font-semibold text-red-500">
                {overview.losers[0].ticker} {overview.losers[0].dayChangePercent}%
              </div>
            ) : (
              <div className="text-lg font-semibold text-gray-400">-</div>
            )}
          </div>
        </div>
      )}

      {overview && Object.keys(overview.industries).length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            {t('stocks.industryPerformance')}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(overview.industries).map(([key, ind]) => (
              <div key={key} className="flex items-center gap-2">
                <span>{INDUSTRY_ICONS[key]}</span>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{key}</div>
                  <div className={`text-sm font-medium ${ind.avgChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {ind.avgChange >= 0 ? '+' : ''}
                    {ind.avgChange}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('stocks.search')}
          className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
        />
        <select
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
        >
          <option value="">{t('stocks.allIndustries')}</option>
          {Object.keys(INDUSTRY_COLORS).map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
        >
          <option value="marketCap">{t('stocks.marketCap')}</option>
          <option value="price">{t('stocks.sharePrice')}</option>
          <option value="change">{t('stocks.change')}</option>
          <option value="name">{t('stocks.name')}</option>
        </select>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                <th className="px-4 py-3 text-left">{t('stocks.company')}</th>
                <th className="px-4 py-3 text-left">{t('stocks.industry')}</th>
                <th className="px-4 py-3 text-right">{t('stocks.sharePrice')}</th>
                <th className="px-4 py-3 text-right">{t('stocks.change')}</th>
                <th className="px-4 py-3 text-right">{t('stocks.marketCap')}</th>
                <th className="px-4 py-3 text-right">{t('stocks.employees')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c._id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
                >
                  <td className="px-4 py-3">
                    <Link to={`/company/${c._id}`} className="flex items-center gap-2">
                      <span className="text-lg">{INDUSTRY_ICONS[c.industry]}</span>
                      <div>
                        <div className="text-gray-900 dark:text-white font-medium">{c.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{c.ticker}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${INDUSTRY_COLORS[c.industry]}`}>{c.industry}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">
                    ${c.sharePrice?.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={c.dayChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}>
                      {c.dayChangePercent >= 0 ? '+' : ''}
                      {c.dayChangePercent}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400" title={formatMoneyExact(c.marketCap)}>{formatMoney(c.marketCap)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400" title={c.employees?.toLocaleString()}>
                    {formatCount(c.employees)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500">{t('stocks.noCompanies')}</div>
        )}
      </div>
    </>
  );
}

function IndexesTab() {
  const { t } = useTranslation();
  const [indexes, setIndexes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('value');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const data = await api('/indexes');
      setIndexes(data);
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
    <>
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
        <Link to="/stocks/portfolio" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 ml-auto">
          {t('indexes.myPortfolio')}
        </Link>
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
                      <span className="text-lg">{INDEX_TYPE_ICONS[idx.type]}</span>
                      <div>
                        <div className="text-gray-900 dark:text-white font-medium">{idx.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{idx.ticker}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${INDEX_TYPE_COLORS[idx.type]}`}>
                      {idx.type}
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
    </>
  );
}

export default function StockMarket() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('companies');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('stocks.title')}</h1>
        <Link to="/stocks/portfolio" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500">
          {t('stocks.myPortfolio')}
        </Link>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {['companies', 'indexes'].map((t2) => (
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

      {tab === 'companies' && <CompaniesTab />}
      {tab === 'indexes' && <IndexesTab />}
    </div>
  );
}
