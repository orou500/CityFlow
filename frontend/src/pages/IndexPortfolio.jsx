import { useEffect, useState } from 'react';
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

export default function IndexPortfolio() {
  const { t } = useTranslation();
  const [portfolio, setPortfolio] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('holdings');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [portfolioData, txData] = await Promise.all([api('/indexes/portfolio'), api('/indexes/user/transactions')]);
      setPortfolio(portfolioData);
      setTransactions(txData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  const holdings = portfolio?.holdings || [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('indexes.portfolio')}</h1>
        <Link to="/stocks" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500">
          {t('indexes.backToMarket')}
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.totalValue')}</div>
          <div
            className="text-xl font-bold text-gray-900 dark:text-white"
            title={formatMoneyExact(portfolio?.totalValue || 0)}
          >
            {formatMoney(portfolio?.totalValue || 0)}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.totalCost')}</div>
          <div
            className="text-xl font-bold text-gray-900 dark:text-white"
            title={formatMoneyExact(portfolio?.totalCost || 0)}
          >
            {formatMoney(portfolio?.totalCost || 0)}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('indexes.profitLoss')}</div>
          <div className={`text-xl font-bold ${(portfolio?.totalPL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {(portfolio?.totalPL || 0) >= 0 ? '+' : ''}
            <span title={formatMoneyExact(portfolio?.totalPL || 0)}>{formatMoney(portfolio?.totalPL || 0)}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {['holdings', 'transactions'].map((t2) => (
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

      {tab === 'holdings' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                  <th className="px-4 py-3 text-left">{t('indexes.index')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.shares')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.avgBuyPrice')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.currentPrice')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.currentValue')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.profitLoss')}</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
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
                    <td
                      className="px-4 py-3 text-right text-gray-900 dark:text-white"
                      title={h.shares.toLocaleString()}
                    >
                      {formatCount(h.shares)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">
                      ${h.avgBuyPrice?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                      <span title={`$${h.index?.value?.toFixed(2)}`}>{formatPrice(h.index?.value)}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                      <span title={formatMoneyExact(h.currentValue)}>{formatMoney(h.currentValue)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
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
          {holdings.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              {t('indexes.noHoldings')}{' '}
              <Link to="/stocks" className="text-blue-600 dark:text-blue-400 hover:text-blue-500">
                {t('indexes.browseMarket')}
              </Link>
            </div>
          )}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                  <th className="px-4 py-3 text-left">{t('indexes.date')}</th>
                  <th className="px-4 py-3 text-left">{t('indexes.index')}</th>
                  <th className="px-4 py-3 text-left">{t('indexes.type')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.shares')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.price')}</th>
                  <th className="px-4 py-3 text-right">{t('indexes.total')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx._id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{tx.indexId?.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${tx.type === 'buy' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}
                      >
                        {tx.type === 'buy' ? t('indexes.buy') : t('indexes.sell')}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-right text-gray-900 dark:text-white"
                      title={tx.shares.toLocaleString()}
                    >
                      {formatCount(tx.shares)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">${tx.price?.toFixed(2)}</td>
                    <td
                      className="px-4 py-3 text-right text-gray-900 dark:text-white"
                      title={formatMoneyExact(tx.total)}
                    >
                      {formatMoney(tx.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {transactions.length === 0 && (
            <div className="text-center py-8 text-gray-400">{t('indexes.noTransactions')}</div>
          )}
        </div>
      )}
    </div>
  );
}
