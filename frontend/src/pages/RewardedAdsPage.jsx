import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../utils/capacitor';
import { useAuthStore } from '../store/useAuthStore';
import { formatMoney } from '../utils/format';
import RewardedAdPlayer from '../components/RewardedAdPlayer';

const API = getApiBaseUrl();

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export default function RewardedAdsPage() {
  const { t } = useTranslation();
  const refreshUser = useAuthStore((s) => s.fetchMe);
  const [enabled, setEnabled] = useState(null);
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | loading | playing | done | error
  const [message, setMessage] = useState(null);
  const [history, setHistory] = useState([]);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [lastReward, setLastReward] = useState(null);
  const cooldownTimer = useRef(null);
  const startInFlightRef = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api('/rewarded-ads/status');
      setStatus(data);
      setCooldownLeft(data.cooldownRemainingMs || 0);
    } catch {
      // backend offline / feature disabled — config fetch will surface it
    }
  }, []);

  useEffect(() => {
    api('/rewarded-ads/config')
      .then((cfg) => setEnabled(cfg.enabled))
      .catch(() => setEnabled(false));
    loadStatus();
    api('/rewarded-ads/history')
      .then((h) => setHistory(h.sessions || []))
      .catch(() => {});
  }, [loadStatus]);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setInterval(() => setCooldownLeft((prev) => Math.max(0, prev - 1000)), 1000);
    cooldownTimer.current = timer;
    return () => clearInterval(timer);
  }, [cooldownLeft]);

  const cooldownSeconds = useMemo(() => Math.ceil((cooldownLeft || 0) / 1000), [cooldownLeft]);
  const dailyLeft = status != null ? Math.max(0, status.dailyLimit - (status.dailyUsed || 0)) : null;

  const handleStart = async () => {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    setMessage(null);
    setPhase('loading');
    try {
      const started = await api('/rewarded-ads/start', { method: 'POST' });
      setSession(started);
      setPhase('playing');
    } catch (err) {
      setPhase('error');
      if (err.body?.cooldownRemainingMs) {
        setCooldownLeft(err.body.cooldownRemainingMs);
      }
      setMessage({ type: 'error', text: err.message });
    } finally {
      startInFlightRef.current = false;
    }
  };

  const handleComplete = useCallback(async () => {
    setPhase('loading');
    setMessage(null);
    try {
      const result = await api(`/rewarded-ads/${session.sessionId}/complete`, { method: 'POST' });
      setPhase('done');
      setLastReward(result.rewardAmount);
      setSession(null);
      setMessage({ type: 'success', text: t('rewardedAds.earned', { amount: formatMoney(result.rewardAmount) }) });
      refreshUser?.().catch(() => {});
      loadStatus();
      api('/rewarded-ads/history')
        .then((h) => setHistory(h.sessions || []))
        .catch(() => {});
    } catch (err) {
      if (err.status === 200 && err.body?.alreadyCompleted) {
        setPhase('done');
        setSession(null);
        setMessage({ type: 'success', text: t('rewardedAds.alreadyClaimed') });
        return;
      }
      setPhase('error');
      if (err.body?.cooldownRemainingMs) setCooldownLeft(err.body.cooldownRemainingMs);
      if (err.status === 409 && err.body?.alreadyCompleted) {
        setSession(null);
        setMessage({ type: 'success', text: t('rewardedAds.alreadyClaimed') });
        return;
      }
      setMessage({ type: 'error', text: err.message });
    }
  }, [session, refreshUser, loadStatus, t]);

  const handleAbort = useCallback(
    (reason) => {
      const known = {
        NO_MEDIA: 'rewardedAds.errorNoMedia',
        NO_AD: 'rewardedAds.errorNoAd',
        MEDIA_ERROR: 'rewardedAds.errorMedia',
      };
      let text = null;
      if (typeof reason === 'string') {
        text = known[reason] ? t(known[reason]) : reason;
      }
      setPhase('idle');
      setSession(null);
      setMessage(text ? { type: 'error', text } : null);
    },
    [t],
  );

  if (enabled === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center dark:text-gray-200">
        <p>{t('rewardedAds.loading')}</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <h1 className="mb-3 text-2xl font-bold dark:text-gray-100">{t('rewardedAds.title')}</h1>
        <p className="text-muted">{t('rewardedAds.unavailable')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold dark:text-gray-100">{t('rewardedAds.title')}</h1>
      <p className="mb-6 text-sm text-muted">{t('rewardedAds.subtitle')}</p>

      {dailyLeft != null && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-muted">{t('rewardedAds.dailyRemaining')}</p>
            <p className="text-lg font-semibold dark:text-gray-100">
              {dailyLeft} / {status.dailyLimit}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-muted">{t('rewardedAds.reward')}</p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {formatMoney(status.rewardAmount)}
            </p>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
              : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
          }`}
          data-testid="page-message"
        >
          {message.text}
          {cooldownSeconds > 0 && message.type === 'error' && (
            <span className="ms-2">({t('rewardedAds.cooldownCountdown', { seconds: cooldownSeconds })})</span>
          )}
        </div>
      )}

      {lastReward != null && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-center dark:border-green-700 dark:bg-green-900/20">
          <p className="text-xl font-bold text-green-700 dark:text-green-300">
            {t('rewardedAds.earnedBanner', { amount: formatMoney(lastReward) })}
          </p>
          <button type="button" className="mt-1 text-xs underline" onClick={() => setLastReward(null)}>
            {t('rewardedAds.dismiss')}
          </button>
        </div>
      )}

      {phase === 'playing' && session && (
        <div data-testid="player-slot">
          <RewardedAdPlayer sessionId={session.sessionId} onComplete={handleComplete} onError={handleAbort} />
          <p className="mt-2 text-center text-xs text-muted">{t('rewardedAds.completeHint')}</p>
        </div>
      )}

      {phase === 'loading' && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 py-3 text-sm text-muted dark:bg-gray-800">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
          {t('rewardedAds.loading')}
        </div>
      )}

      {(phase === 'idle' || phase === 'done' || phase === 'error') && (
        <button
          type="button"
          onClick={handleStart}
          data-testid="start-ad-button"
          disabled={!!cooldownSeconds || (dailyLeft != null && dailyLeft === 0)}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
        >
          {cooldownSeconds > 0
            ? t('rewardedAds.cooldown', { seconds: cooldownSeconds })
            : dailyLeft === 0
              ? t('rewardedAds.dailyLimitReached')
              : t('rewardedAds.watchAd')}
        </button>
      )}

      <div className="mt-8">
        <h2 className="mb-2 text-lg font-semibold dark:text-gray-100">{t('rewardedAds.history')}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{t('rewardedAds.noHistory')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {history.map((h) => (
              <li key={h._id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-secondary">
                  {new Date(h.createdAt).toLocaleString()} · {formatMoney(h.rewardAmount)}
                </span>
                <span className="text-xs uppercase text-muted">{h.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
