import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
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

/**
 * Post-donation supporter welcome. Shows ONLY when the server reports the
 * one-time onboarding state as 'pending' (armed server-side when a donation
 * is CONFIRMED — never at payment initiation, never by client input) AND the
 * user actually holds supporter status.
 *
 * On the Supporter Style page the 5-step tour takes over; everywhere else a
 * compact welcome card offers "Customize My Profile" (→ /supporter-style) or
 * "Not now" (persisted as skipped server-side, shown exactly once).
 */
export default function SupporterOnboarding() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const isSupporter = !!(user?.supporter?.badge && user.supporter.badge !== 'none');

  useEffect(() => {
    if (!isSupporter || !user) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    api('/supporter-identity/onboarding')
      .then((data) => {
        if (!cancelled) setStatus(data.status || 'none');
      })
      .catch(() => {
        if (!cancelled) setStatus('none');
      });
    return () => {
      cancelled = true;
    };
  }, [isSupporter, user?._id]);

  const onSupporterStylePage = location.pathname === '/supporter-style';
  const show = isSupporter && status === 'pending' && !dismissed && !onSupporterStylePage;
  if (!show) return null;

  async function handleCustomize() {
    setDismissed(true);
    navigate('/supporter-style');
  }

  async function handleNotNow() {
    setDismissed(true);
    try {
      await api('/supporter-identity/onboarding/skip', { method: 'POST' });
    } catch {
      // best-effort — the welcome must never block gameplay
    }
    setStatus('skipped');
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      data-testid="supporter-welcome"
    >
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative pointer-events-auto bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full sm:max-w-md p-6 sm:p-8 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        <div className="text-5xl mb-4 text-center" aria-hidden="true">
          🎉
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3 text-center">
          {t('supporterIdentity.onboarding.welcomeTitle')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-6 text-center">
          {t('supporterIdentity.onboarding.welcomeDescription')}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleCustomize}
            className="w-full bg-orange-500 hover:bg-orange-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            {t('supporterIdentity.onboarding.welcomeCta')}
          </button>
          <button
            onClick={handleNotNow}
            className="w-full text-xs text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 py-1 transition-colors"
          >
            {t('supporterIdentity.onboarding.notNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
