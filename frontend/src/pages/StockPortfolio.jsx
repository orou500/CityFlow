import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatMoney, formatMoneyExact, formatPrice, formatCount } from '../utils/format';
import { getApiBaseUrl } from '../utils/capacitor';

const API = getApiBaseUrl();

async function api(path) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

async function apiPost(path, body) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function StockPortfolio() {
  const { t } = useTranslation();
  const [stockPortfolio, setStockPortfolio] = useState(null);
  const [indexPortfolio, setIndexPortfolio] = useState(null);
  const [stockTransactions, setStockTransactions] = useState([]);
  const [indexTransactions, setIndexTransactions] = useState([]);
  const [dividends, setDividends] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('stocks');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [sPortfolio, iPortfolio, sTx, iTx, divData] = await Promise.all([
        api('/companies/portfolio'),
        api('/indexes/portfolio'),
        api('/stocks/transactions'),
        api('/indexes/user/transactions'),
        api('/stocks/dividends'),
      ]);
      setStockPortfolio(sPortfolio);
      setIndexPortfolio(iPortfolio);
      setStockTransactions(sTx);
      setIndexTransactions(iTx);
      setDividends(divData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const handleClaimDividends = useCallback(async () => {
    setClaiming(true);
    setClaimResult(null);
    try {
      const result = await apiPost('/stocks/dividends/claim', {});
      setClaimResult({ success: true, totalClaimed: result.totalClaimed });
      setDividends({ dividends: [], totalUnclaimed: 0 });
      loadData();
    } catch (e) {
      setClaimResult({ success: false, error: e.message });
    }
    setClaiming(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  const stockHoldings = stockPortfolio?.holdings || [];
  const indexHoldings = indexPortfolio?.holdings || [];

  const totalValue = (stockPortfolio?.totalValue || 0) + (indexPortfolio?.totalValue || 0);
  const totalCost = (stockPortfolio?.totalCost || 0) + (indexPortfolio?.totalCost || 0);
  const totalPL = (stockPortfolio?.totalPL || 0) + (indexPortfolio?.totalPL || 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('stocks.portfolio')}</h1>
        <Link to="/stocks" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500">
          {t('stocks.backToMarket')}
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.totalValue')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white" title={formatMoneyExact(totalValue)}>
            {formatMoney(totalValue)}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.totalCost')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white" title={formatMoneyExact(totalCost)}>
            {formatMoney(totalCost)}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('stocks.profitLoss')}</div>
          <div className={`text-xl font-bold ${totalPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalPL >= 0 ? '+' : ''}
            <span title={formatMoneyExact(totalPL)}>{formatMoney(totalPL)}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {['stocks', 'indexes', 'dividends'].map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === tabKey
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t(`stocks.tab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`)}
          </button>
        ))}
      </div>

      {tab === 'stocks' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                  <th className="px-4 py-3 text-start">{t('stocks.company')}</th>
                  <th className="px-4 py-3 text-end">{t('stocks.shares')}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-end">{t('stocks.avgBuyPrice')}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-end">{t('stocks.currentPrice')}</th>
                  <th className="px-4 py-3 text-end">{t('stocks.currentValue')}</th>
                  <th className="px-4 py-3 text-end">{t('stocks.profitLoss')}</th>
                </tr>
              </thead>
              <tbody>
                {stockHoldings.map((h) => (
                  <tr
                    key={h._id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/company/${h.company?._id}`}
                        className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {h.company?.name}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{h.company?.ticker}</div>
                    </td>
                    <td className="px-4 py-3 text-end text-gray-900 dark:text-white" title={h.shares.toLocaleString()}>
                      {formatCount(h.shares)}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-end text-gray-500 dark:text-gray-400">
                      ${h.avgBuyPrice?.toFixed(2)}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-end text-gray-900 dark:text-white">
                      ${h.company?.sharePrice?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-end text-gray-900 dark:text-white">
                      <span title={formatMoneyExact(h.currentValue)}>{formatMoney(h.currentValue)}</span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <span className={h.profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {h.profitLoss >= 0 ? '+' : ''}
                        <span title={formatMoneyExact(h.profitLoss)}>{formatMoney(h.profitLoss)}</span>
                      </span>
                      <div className={`text-xs ${h.profitLossPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {h.profitLossPercent >= 0 ? '+' : ''}
                        {h.profitLossPercent}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stockHoldings.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              {t('stocks.noHoldings')}{' '}
              <Link to="/stocks" className="text-blue-600 dark:text-blue-400 hover:text-blue-500">
                {t('stocks.browseMarket')}
              </Link>
            </div>
          )}
        </div>
      )}

      {tab === 'indexes' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                  <th className="px-4 py-3 text-start">{t('indexes.index')}</th>
                  <th className="px-4 py-3 text-end">{t('indexes.shares')}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-end">{t('indexes.avgBuyPrice')}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-end">{t('indexes.currentPrice')}</th>
                  <th className="px-4 py-3 text-end">{t('indexes.currentValue')}</th>
                  <th className="px-4 py-3 text-end">{t('indexes.profitLoss')}</th>
                </tr>
              </thead>
              <tbody>
                {indexHoldings.map((h) => (
                  <tr
                    key={h._id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/index/${h.index?._id}`}
                        className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {h.index?.name}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{h.index?.ticker}</div>
                    </td>
                    <td className="px-4 py-3 text-end text-gray-900 dark:text-white" title={h.shares.toLocaleString()}>
                      {formatCount(h.shares)}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-end text-gray-500 dark:text-gray-400">
                      ${h.avgBuyPrice?.toFixed(2)}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-end text-gray-900 dark:text-white">
                      <span title={`$${h.index?.value?.toFixed(2)}`}>{formatPrice(h.index?.value)}</span>
                    </td>
                    <td className="px-4 py-3 text-end text-gray-900 dark:text-white">
                      <span title={formatMoneyExact(h.currentValue)}>{formatMoney(h.currentValue)}</span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <span className={h.profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {h.profitLoss >= 0 ? '+' : ''}
                        <span title={formatMoneyExact(h.profitLoss)}>{formatMoney(h.profitLoss)}</span>
                      </span>
                      <div className={`text-xs ${h.profitLossPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {h.profitLossPercent >= 0 ? '+' : ''}
                        {h.profitLossPercent}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {indexHoldings.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              {t('stocks.noHoldings')}{' '}
              <Link to="/stocks" className="text-blue-600 dark:text-blue-400 hover:text-blue-500">
                {t('stocks.browseMarket')}
              </Link>
            </div>
          )}
        </div>
      )}

      {tab === 'dividends' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {claimResult && (
            <div
              className={`px-4 py-2 text-sm ${claimResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}
            >
              {claimResult.success
                ? `${t('stocks.dividendClaimed')}: $${claimResult.totalClaimed?.toLocaleString()}`
                : claimResult.error}
            </div>
          )}
          <div className="p-4 flex flex-wrap items-center justify-between gap-y-2 gap-x-4 border-b border-gray-200 dark:border-gray-700">
            <div className="min-w-0">
              <span className="text-sm text-gray-500 dark:text-gray-400">{t('stocks.totalUnclaimed')}: </span>
              <span className="text-lg font-bold text-gray-900 dark:text-white break-words">
                ${(dividends?.totalUnclaimed || 0).toLocaleString()}
              </span>
            </div>
            <button
              onClick={handleClaimDividends}
              disabled={claiming || !dividends?.totalUnclaimed}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {claiming ? t('common.loading') : t('stocks.claimDividends')}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                  <th className="px-4 py-3 text-start">{t('stocks.company')}</th>
                  <th className="px-4 py-3 text-end">{t('stocks.shares')}</th>
                  <th className="px-4 py-3 text-end">{t('stocks.dividendPerShare')}</th>
                  <th className="px-4 py-3 text-end">{t('stocks.unclaimed')}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-end">{t('stocks.dividendYield')}</th>
                </tr>
              </thead>
              <tbody>
                {(dividends?.dividends || []).map((d, i) => (
                  <tr
                    key={d.companyId || i}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white font-medium">{d.companyName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{d.ticker}</div>
                    </td>
                    <td className="px-4 py-3 text-end text-gray-900 dark:text-white">{formatCount(d.shares)}</td>
                    <td className="px-4 py-3 text-end text-gray-900 dark:text-white">
                      ${d.dividendPerShare?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-end text-green-600 dark:text-green-400 font-medium">
                      ${d.unclaimed?.toLocaleString()}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-end text-gray-500 dark:text-gray-400">
                      {d.dividendYield?.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!dividends?.dividends || dividends.dividends.length === 0) && (
            <div className="text-center py-8 text-gray-400">{t('stocks.noDividends')}</div>
          )}
        </div>
      )}
    </div>
  );
}
