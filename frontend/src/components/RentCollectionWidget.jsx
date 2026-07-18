import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { formatMoney, formatDiff } from '../utils/format';

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

export default function RentCollectionWidget({ onCollected }) {
  const { t } = useTranslation();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [status, setStatus] = useState(null);
  const [countdown, setCountdown] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/rent/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.timeRemainingMs != null) {
          setCountdown(formatCountdown(data.timeRemainingMs));
        }
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!status || status.uncollectedRent <= 0 || status.expired) return;
    const interval = setInterval(() => {
      const remaining = new Date(status.expiresAt).getTime() - Date.now();
      setCountdown(formatCountdown(Math.max(0, remaining)));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  async function handleCollect() {
    if (collecting || !status || status.uncollectedRent <= 0) return;
    setCollecting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/rent/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setResult(data);
      await fetchMe();
      if (onCollected) onCollected();
      fetchStatus();
    } catch {
      setError(t('rentCollect.error'));
    } finally {
      setCollecting(false);
    }
  }

  if (!status || status.uncollectedRent <= 0) return null;

  if (result) {
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{'\uD83D\uDCB0'}</span>
          <h3 className="text-sm font-bold text-green-700 dark:text-green-300">{t('rentCollect.collected')}</h3>
        </div>
        <p className="text-sm text-green-600 dark:text-green-400">{formatDiff(result.collected)}</p>
      </div>
    );
  }

  const urgency = status.timeRemainingMs != null && status.timeRemainingMs < 3600000;

  return (
    <div
      className={`rounded-lg p-4 border ${
        urgency
          ? 'bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-800'
          : 'bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3
            className={`text-sm font-bold ${
              urgency ? 'text-red-700 dark:text-red-300' : 'text-purple-700 dark:text-purple-300'
            }`}
          >
            {t('rentCollect.title')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {formatMoney(status.uncollectedRent)} {t('rentCollect.readyToCollect')}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status.timeRemainingMs != null && (
            <div className="text-right">
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('rentCollect.expiresIn')}</p>
              <p className="text-sm font-mono font-semibold text-gray-600 dark:text-gray-300 tabular-nums">
                {countdown}
              </p>
            </div>
          )}
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {collecting ? t('rentCollect.collecting') : t('rentCollect.collect')}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}
    </div>
  );
}
