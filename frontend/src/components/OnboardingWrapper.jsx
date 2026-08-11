import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
 * Progressive, level-based onboarding.
 *
 * Each gameplay system unlocks at a specific player level. When a system is
 * unlocked and not yet completed, a contextual modal explains it once and can
 * navigate straight to the feature. Completion state lives on the backend
 * (`User.completedOnboarding`), so onboarding never repeats.
 *
 * While the guided tour (OnboardingTour) is active for a new player, unlock
 * modals are suppressed so the two systems never stack.
 */
export default function OnboardingWrapper({ children }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [visible, setVisible] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const isRtl = i18n.language === 'he';

  useEffect(() => {
    if (!user) {
      setQueue([]);
      setVisible(false);
      setTourActive(false);
      return;
    }
    let cancelled = false;
    api('/onboarding/tour/status')
      .then((data) => {
        if (cancelled) return;
        setTourActive(data.status === 'active');
        if (data.status === 'active') return;
        return api('/onboarding/status').then((unlocks) => {
          if (cancelled) return;
          const pending = unlocks.pending || [];
          setQueue(pending);
          setVisible(pending.length > 0);
        });
      })
      .catch(() => {
        // fall back to unlock status alone
        api('/onboarding/status')
          .then((data) => {
            if (cancelled) return;
            const pending = data.pending || [];
            setQueue(pending);
            setVisible(pending.length > 0);
          })
          .catch(() => {});
      });
    return () => {
      cancelled = true;
    };
  }, [user, user?.level]);

  const current = queue[0];

  async function completeCurrent() {
    if (!current) return;
    try {
      await api('/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({ id: current.id }),
      });
    } catch {
      // completion is best-effort — still advance the queue
    }
    const next = queue.slice(1);
    setQueue(next);
    if (next.length === 0) setVisible(false);
  }

  function handleExplore() {
    if (!current) return;
    navigate(current.route);
    completeCurrent();
  }

  if (!visible || !current || tourActive) {
    return <>{children}</>;
  }

  return (
    <>
      {children}

      <div
        className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[9999] p-0 sm:p-4"
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      >
        <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-orange-500 uppercase tracking-wide">
              {t('onboarding.progressive.unlocked')}
            </span>
            <button
              onClick={completeCurrent}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
              aria-label={t('onboarding.progressive.close')}
            >
              {'\u00D7'}
            </button>
          </div>

          <div className="text-5xl mb-4 text-center">🎉</div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
            {t(current.titleKey)}
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 text-center">
            {t('onboarding.progressive.levelReached', { level: current.requiredLevel })}
          </p>
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line mb-5 text-center">
            {t(current.descriptionKey)}
          </p>

          {current.stepsKeys?.length > 0 && (
            <ul className="space-y-2 mb-6">
              {current.stepsKeys.map((key) => (
                <li
                  key={key}
                  className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"
                >
                  <span className="text-orange-500 mt-0.5 shrink-0">•</span>
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleExplore}
              className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors"
            >
              {t('onboarding.progressive.explore')}
            </button>
            <button
              onClick={completeCurrent}
              className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-6 py-2.5 rounded-lg font-semibold transition-colors"
            >
              {t('onboarding.progressive.gotIt')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
