import { useState, useEffect, useCallback } from 'react';
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

const POLL_MS = 5000;

/**
 * Guided onboarding tour for new players.
 *
 * State lives server-side (User.onboardingV2): refreshing, re-logging in or
 * reconnecting never resets it. Informational steps advance via the Next
 * button; hands-on steps (buy first property, collect rent, upgrade,
 * complete a mission) only advance when the actual gameplay event fires
 * server-side — the client polls while waiting and can never claim them.
 */
export default function OnboardingTour() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [buyAvailability, setBuyAvailability] = useState(null);
  const isRtl = i18n.language === 'he';

  const loadStatus = useCallback(async () => {
    try {
      const data = await api('/onboarding/tour/status');
      setState(data);
      return data;
    } catch {
      setState(null);
      return null;
    }
  }, []);

  // The buy_property step must not send a player to an empty market: check
  // whether inventory priced at or under $100k actually exists, and offer a
  // fallback (browse / continue / wait / refresh) when it does not.
  const checkBuyAvailability = useCallback(async () => {
    try {
      const data = await api('/onboarding/tour/buy-property-availability');
      setBuyAvailability(data);
    } catch {
      setBuyAvailability(null);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setState(null);
      return;
    }
    setConfirmSkip(false);
    setActionError(null);
    loadStatus();
  }, [user, user?.level, loadStatus]);

  useEffect(() => {
    if (state?.currentStep === 'buy_property') {
      checkBuyAvailability();
    } else {
      setBuyAvailability(null);
    }
  }, [state?.currentStep, checkBuyAvailability]);

  // While an event-gated step is current, poll so the tour advances the
  // moment the real action happens server-side.
  useEffect(() => {
    if (!state || state.status !== 'active' || !state.eventGated) return undefined;
    const interval = setInterval(loadStatus, POLL_MS);
    return () => clearInterval(interval);
  }, [state, loadStatus]);

  // Any step change clears stale error state (e.g. the poll advanced past
  // a step that briefly failed to advance).
  useEffect(() => {
    setActionError(null);
  }, [state?.currentStep]);

  // On phones, event-step cards start minimized so they never cover the
  // button the player needs to press (e.g. Buy / Collect Rent). Tapping the
  // pill expands the card.
  useEffect(() => {
    if (!state || state.status !== 'active' || !state.eventGated) return undefined;
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setMinimized(true);
    } else {
      setMinimized(false);
    }
  }, [state?.currentStep, state?.eventGated, state?.status]);

  if (!user || !state || state.status !== 'active') return null;

  const step = (state.steps || []).find((s) => s.id === state.currentStep);
  if (!step) return null;

  const stepKey = `onboarding.tour.steps.${step.id}`;
  const isEventStep = step.eventGated;
  const isCompleteStep = step.id === 'complete';
  const isWelcome = step.id === 'welcome';

  // Event steps can be minimized so the card never covers the UI the player
  // needs to interact with (e.g. the marketplace Buy button).
  if (minimized && isEventStep) {
    return (
      <div
        className={`pointer-events-none fixed inset-0 z-[9999] flex items-end sm:items-start justify-center sm:justify-start ${
          isRtl ? 'rtl' : 'ltr'
        }`}
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      >
        <button
          onClick={() => setMinimized(false)}
          className="pointer-events-auto mb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:mb-0 sm:mt-4 sm:ms-4 bg-white dark:bg-gray-900 border border-orange-500 text-orange-600 dark:text-orange-400 text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg hover:bg-orange-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0" />
          <span className="max-w-[60vw] truncate">{t(`${stepKey}.title`)}</span>
          <span aria-hidden="true">⌃</span>
        </button>
      </div>
    );
  }

  function resolveRoute() {
    if (step.route.includes(':id')) {
      if (state.lastPropertyId) return step.route.replace(':id', state.lastPropertyId);
      return '/marketplace';
    }
    // Deep-link the upgrade modal on the development page when possible so
    // "Go There" lands the player directly on the upgrade action.
    if (step.id === 'upgrade_property' && state.lastPropertyId) {
      return `${step.route}${step.route.includes('?') ? '&' : '?'}propertyId=${state.lastPropertyId}`;
    }
    return step.route;
  }

  async function advanceStep() {
    try {
      const data = await api('/onboarding/tour/advance', { method: 'POST' });
      setActionError(null);
      setState(data);
      return;
    } catch (err) {
      console.error('[ONBOARDING] advance failed:', err?.message);
    }
    // The advance request failed — but the server may have advanced anyway
    // (e.g. a double-click raced ahead, or the server moved on first).
    // Refetch before showing an error so a stale failure never appears.
    const fresh = await loadStatus();
    if (!fresh || fresh.currentStep === step.id) {
      setActionError(err?.message || 'advance failed');
    }
  }

  async function handleNext() {
    if (isEventStep || isCompleteStep) return;
    await advanceStep();
  }

  function handleExplore() {
    // Exploring an informational step completes it (same behavior as the
    // unlock modals) so the modal never lingers over the destination page.
    if (!isEventStep && !isCompleteStep) {
      advanceStep();
    }
    navigate(resolveRoute());
  }

  async function handleComplete() {
    await advanceStep();
  }

  async function handleSkip() {
    try {
      const data = await api('/onboarding/tour/skip', { method: 'POST' });
      setState({ ...state, status: data.status });
    } catch {
      // best-effort — fall through to hiding
    }
    setState(null);
  }

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[9999] flex ${isRtl ? 'rtl' : 'ltr'} ${
        isEventStep ? 'items-end sm:items-start sm:justify-start' : 'items-end sm:items-center justify-center'
      }`}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
    >
      {/* Backdrop and container never block clicks — players must be able to
          play while an event step is active (e.g. actually buy the property).
          Only the card itself is interactive. */}
      <div className={`absolute inset-0 ${isEventStep ? 'bg-black/40' : 'bg-black/70'}`} />

      <div
        className={`relative pointer-events-auto bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full ${
          isEventStep ? 'sm:max-w-sm sm:m-4' : 'sm:max-w-lg'
        } p-5 sm:p-7 max-h-[80vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]`}
        style={{ maxHeight: '85dvh' }}
      >
        {/* Progress header */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-1.5 flex-1">
            {(state.steps || []).map((s, idx) => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full flex-1 transition-colors ${
                  idx <= state.currentIndex ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isWelcome && !isCompleteStep && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {t('onboarding.tour.progress', { current: (state.currentIndex || 0) + 1, total: state.totalSteps })}
              </span>
            )}
            {isEventStep && (
              <button
                onClick={() => setMinimized(true)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none px-1"
                aria-label={t('onboarding.tour.minimize')}
                title={t('onboarding.tour.minimize')}
              >
                ⌄
              </button>
            )}
          </div>
        </div>

        <div className="text-4xl mb-3 text-center">{isWelcome ? '🏙️' : isCompleteStep ? '🎉' : '📖'}</div>
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">
          {t(`${stepKey}.title`)}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line mb-4 text-center">
          {t(`${stepKey}.description`)}
        </p>

        {isEventStep && (
          <div className="flex items-center justify-center gap-2 mb-4 text-xs font-medium text-orange-600 dark:text-orange-400">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span>{t('onboarding.tour.waitingAction')}</span>
          </div>
        )}

        {isEventStep && step.id === 'buy_property' && buyAvailability && !buyAvailability.eligible && (
          <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">
              {t('onboarding.tour.noCheapProperty')}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
              {t('onboarding.tour.noCheapPropertyHint')}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => navigate('/marketplace')}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs rounded transition-colors"
              >
                {t('onboarding.tour.browseProperties')}
              </button>
              <button
                onClick={() => checkBuyAvailability()}
                className="px-3 py-1.5 border border-amber-400 text-amber-700 dark:text-amber-300 text-xs rounded transition-colors"
              >
                {t('onboarding.tour.refreshInventory')}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {isCompleteStep ? (
            <button
              onClick={handleComplete}
              className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors"
            >
              {t('onboarding.tour.buttons.startPlaying')}
            </button>
          ) : isEventStep ? (
            <button
              onClick={handleExplore}
              className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors"
            >
              {t('onboarding.tour.buttons.goThere')}
            </button>
          ) : isWelcome ? (
            <button
              onClick={handleNext}
              className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors"
            >
              {t('onboarding.tour.buttons.getStarted')}
            </button>
          ) : (
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleExplore}
                className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors"
              >
                {t('onboarding.tour.buttons.explore')}
              </button>
              <button
                onClick={handleNext}
                className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-6 py-2.5 rounded-lg font-semibold transition-colors"
              >
                {t('onboarding.tour.buttons.next')}
              </button>
            </div>
          )}
        </div>

        {/* Explicit skip */}
        {!isWelcome && !isCompleteStep && (
          <div className="mt-4 text-center">
            {confirmSkip ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('onboarding.tour.skipConfirm')}</span>
                <button onClick={handleSkip} className="text-red-500 hover:text-red-400 font-semibold">
                  {t('onboarding.tour.skipYes')}
                </button>
                <button
                  onClick={() => setConfirmSkip(false)}
                  className="text-gray-400 hover:text-gray-300 font-semibold"
                >
                  {t('onboarding.tour.skipNo')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmSkip(true)}
                className="text-xs text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 underline"
              >
                {t('onboarding.tour.skip')}
              </button>
            )}
          </div>
        )}

        {actionError && (
          <p className="mt-3 text-xs text-red-500 text-center" role="alert">
            {t('onboarding.tour.advanceError')}
          </p>
        )}
      </div>
    </div>
  );
}
