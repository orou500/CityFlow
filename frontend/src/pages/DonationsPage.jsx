import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../utils/capacitor';
import { useAuthStore } from '../store/useAuthStore';

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

const DONATION_AMOUNTS = [5, 10, 25, 50, 100, 500];

export default function DonationsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [config, setConfig] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api('/donations/config')
      .then(setConfig)
      .catch(() => {});
    if (user) {
      api('/donations/history')
        .then((d) => setHistory(d.donations))
        .catch(() => {});
    }
  }, [user]);

  const getAmount = () => (useCustom ? parseFloat(customAmount) || 0 : selectedAmount);

  const handleDonate = async () => {
    const amount = getAmount();
    if (amount < 5) {
      setMessage({ type: 'error', text: t('donations.minimumError') });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { orderId } = await api('/donations/create', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });

      const paypalWindow = window.open(
        `https://www.paypal.com/checkoutnow?token=${orderId}`,
        'paypal',
        'width=600,height=700',
      );

      const pollInterval = setInterval(async () => {
        try {
          if (paypalWindow?.closed) {
            clearInterval(pollInterval);
            const result = await api('/donations/capture', {
              method: 'POST',
              body: JSON.stringify({ orderId, isAnonymous }),
            });
            if (result.success) {
              setMessage({ type: 'success', text: t('donations.success') });
              const d = await api('/donations/history');
              setHistory(d.donations);
              useAuthStore.getState().fetchMe();
            }
          }
        } catch (err) {
          clearInterval(pollInterval);
          setMessage({ type: 'error', text: err.message });
        }
      }, 2000);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-white mb-2">{t('donations.title')}</h1>
      <p className="text-gray-400 mb-6">{t('donations.subtitle')}</p>

      {message && (
        <div
          className={`p-3 rounded mb-4 text-sm ${message.type === 'success' ? 'bg-green-900/50 text-green-300 border border-green-800' : 'bg-red-900/50 text-red-300 border border-red-800'}`}
        >
          {message.text}
        </div>
      )}

      {!config?.enabled && (
        <div className="bg-yellow-900/30 border border-yellow-800 rounded p-4 mb-6 text-yellow-300 text-sm">
          {t('donations.notConfigured')}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">{t('donations.whyDonate')}</h2>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">{'\u{2022}'}</span>
              <span>{t('donations.serverHosting')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">{'\u{2022}'}</span>
              <span>{t('donations.databaseCosts')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">{'\u{2022}'}</span>
              <span>{t('donations.developmentTime')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">{'\u{2022}'}</span>
              <span>{t('donations.infrastructure')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">{'\u{2022}'}</span>
              <span>{t('donations.communityFeatures')}</span>
            </li>
          </ul>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">{t('donations.rewards')}</h2>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">{'\u{2B50}'}</span>
              <span>{t('donations.rewardBadge')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">{'\u{1F3C6}'}</span>
              <span>{t('donations.rewardTitle')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">{'\u{1F464}'}</span>
              <span>{t('donations.rewardProfile')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">{'\u{1F30D}'}</span>
              <span>{t('donations.rewardRecognition')}</span>
            </li>
          </ul>
          <div className="mt-3 text-xs text-gray-500">{t('donations.noPayToWin')}</div>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4">{t('donations.selectAmount')}</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {DONATION_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onClick={() => {
                setSelectedAmount(amt);
                setUseCustom(false);
              }}
              className={`px-4 py-2 rounded font-semibold text-sm transition ${!useCustom && selectedAmount === amt ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              ${amt}
            </button>
          ))}
          <button
            onClick={() => setUseCustom(true)}
            className={`px-4 py-2 rounded font-semibold text-sm transition ${useCustom ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            {t('donations.custom')}
          </button>
        </div>

        {useCustom && (
          <input
            type="number"
            min="5"
            step="1"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="$10"
            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white mb-4"
          />
        )}

        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            id="anonymous"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="anonymous" className="text-sm text-gray-400">
            {t('donations.anonymousDonation')}
          </label>
        </div>

        <button
          onClick={handleDonate}
          disabled={loading || !config?.enabled}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg transition disabled:opacity-50"
        >
          {loading ? t('donations.processing') : `${t('donations.donate')} $${getAmount()}`}
        </button>

        <p className="text-xs text-gray-500 mt-3">{t('donations.terms')}</p>
      </div>

      {history.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">{t('donations.history')}</h2>
          <div className="space-y-2">
            {history.map((d, i) => (
              <div key={i} className="flex justify-between items-center text-sm bg-gray-900 rounded p-3">
                <span className="text-white">${d.amount} USD</span>
                <span
                  className={`px-2 py-0.5 rounded text-xs ${d.status === 'completed' ? 'bg-green-900 text-green-300' : d.status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}`}
                >
                  {t(`donations.status${d.status.charAt(0).toUpperCase() + d.status.slice(1)}`)}
                </span>
                <span className="text-gray-500 text-xs">{new Date(d.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
