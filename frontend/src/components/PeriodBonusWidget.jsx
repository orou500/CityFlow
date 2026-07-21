import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { formatDiff } from '../utils/format';
import { getApiBaseUrl } from '../utils/capacitor';

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

export default function PeriodBonusWidget({ onClaimed }) {
  const { t } = useTranslation();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const API = getApiBaseUrl();
  const [status, setStatus] = useState(null);
  const [countdown, setCountdown] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/bonus/status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setCountdown(formatCountdown(data.nextInMs));
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!status || status.available) return;
    const interval = setInterval(() => {
      const remaining = new Date(status.nextPeriodAt).getTime() - Date.now();
      setCountdown(formatCountdown(Math.max(0, remaining)));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  async function handleClaim() {
    if (claiming || !status?.available) return;
    setClaiming(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API}/bonus/claim`, {
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
      if (onClaimed) onClaimed();
      fetchStatus();
    } catch {
      setError(t('periodBonus.error'));
    } finally {
      setClaiming(false);
    }
  }

  if (!status) return null;

  if (result) {
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{'\uD83C\uDF89'}</span>
          <h3 className="text-sm font-bold text-green-700 dark:text-green-300">{t('periodBonus.claimed')}</h3>
        </div>
        <div className="flex gap-4 mb-3">
          <span className="text-sm text-green-600 dark:text-green-400">{formatDiff(result.money)}</span>
          <span className="text-sm text-blue-600 dark:text-blue-400">+{result.xp} XP</span>
          {result.levelUps > 0 && (
            <span className="text-sm text-yellow-600 dark:text-yellow-400">
              {'\u2B50'} {t('periodBonus.levelUp')}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('periodBonus.nextIn')} {formatCountdown(result.nextInMs)}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg p-4 border ${
        status.available
          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-200 dark:border-yellow-800'
          : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3
            className={`text-sm font-bold ${
              status.available ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {status.available ? t('periodBonus.available') : t('periodBonus.claimedNext')}
          </h3>
          {status.available && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('periodBonus.rewardRange')}</p>
          )}
        </div>
        {status.available ? (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
          >
            {claiming ? t('periodBonus.claiming') : t('periodBonus.claim')}
          </button>
        ) : (
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('periodBonus.nextIn')}</p>
            <p className="text-sm font-mono font-semibold text-gray-600 dark:text-gray-300 tabular-nums">{countdown}</p>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}
    </div>
  );
}
