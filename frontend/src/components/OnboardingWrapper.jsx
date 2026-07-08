import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';

const API = '/api';

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function getTarget(selector) {
  if (selector === 'body') return document.body;
  return document.querySelector(selector);
}

function getTooltipPosition(targetRect, tooltipWidth, tooltipHeight, vw, vh) {
  let top = targetRect.bottom + 14;
  let left = targetRect.left + (targetRect.width - tooltipWidth) / 2;

  if (left < 12) left = 12;
  if (left + tooltipWidth > vw - 12) left = vw - tooltipWidth - 12;
  if (top + tooltipHeight > vh - 12) {
    top = targetRect.top - tooltipHeight - 14;
  }
  if (top < 12) top = 12;

  return { top, left };
}

export default function OnboardingWrapper({ children }) {
  const { t, i18n } = useTranslation();
  const { user, fetchMe } = useAuthStore();
  const [showWelcome, setShowWelcome] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const [spotlight, setSpotlight] = useState(null);

  const tooltipRef = useRef(null);
  const isRtl = i18n.language === 'he';

  const steps = useMemo(() => [
    { target: '[data-tour="map"]', title: t('onboarding.step1.title'), content: t('onboarding.step1.content') },
    { target: '[data-tour="marketplace"]', title: t('onboarding.step2.title'), content: t('onboarding.step2.content') },
    { target: 'body', title: t('onboarding.step3.title'), content: t('onboarding.step3.content') },
    { target: '[data-tour="bank"]', title: t('onboarding.step4.title'), content: t('onboarding.step4.content') },
    { target: '[data-tour="dashboard"]', title: t('onboarding.step5.title'), content: t('onboarding.step5.content') },
    { target: 'body', title: t('onboarding.step6.title'), content: t('onboarding.step6.content') },
  ], [t, i18n.language]);

  useEffect(() => {
    if (!user) {
      setShowWelcome(false);
      return;
    }
    if (!user.onboarding || !user.onboarding.completed) {
      setShowWelcome(true);
    }
  }, [user]);

  async function completeOnboarding() {
    await api('/users/onboarding', {
      method: 'PUT',
      body: JSON.stringify({ completed: true }),
    });
    fetchMe();
    setShowWelcome(false);
    setTourRunning(false);
    setStepIndex(0);
  }

  function startTour() {
    setShowWelcome(false);
    setTourRunning(true);
  }

  const scrollToTarget = useCallback((selector) => {
    const el = getTarget(selector);
    if (el && el !== document.body) {
      const rect = el.getBoundingClientRect();
      const scrollY = window.scrollY + rect.top - 100;
      window.scrollTo({ top: Math.max(0, scrollY), behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!tourRunning) return;
    const currentStep = steps[stepIndex];
    const target = getTarget(currentStep.target);

    if (target === document.body || !target) {
      setSpotlight(null);
    } else {
      const rect = target.getBoundingClientRect();
      setSpotlight({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      });
      scrollToTarget(currentStep.target);
    }
  }, [tourRunning, stepIndex, scrollToTarget, steps]);

  useLayoutEffect(() => {
    if (!tourRunning || !tooltipRef.current) return;

    const currentStep = steps[stepIndex];
    const tooltip = tooltipRef.current;
    const tooltipWidth = tooltip.offsetWidth || 380;
    const tooltipHeight = tooltip.offsetHeight || 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (currentStep.target === 'body') {
      setTooltipPos({
        top: Math.max(12, (vh - tooltipHeight) / 2),
        left: Math.max(12, (vw - tooltipWidth) / 2),
      });
      return;
    }

    const target = getTarget(currentStep.target);
    if (!target) {
      setTooltipPos({ top: vh / 3, left: (vw - tooltipWidth) / 2 });
      return;
    }

    setTooltipPos(getTooltipPosition(target.getBoundingClientRect(), tooltipWidth, tooltipHeight, vw, vh));
  }, [tourRunning, stepIndex, isRtl, steps]);

  useEffect(() => {
    if (!tourRunning) return;
    function handleKey(e) { if (e.key === 'Escape') completeOnboarding(); }
    function handleResize() {
      if (!tooltipRef.current) return;
      const currentStep = steps[stepIndex];
      const target = getTarget(currentStep.target);
      if (target && target !== document.body) {
        const rect = target.getBoundingClientRect();
        setSpotlight({
          top: rect.top, left: rect.left, width: rect.width, height: rect.height,
          bottom: rect.bottom, right: rect.right,
        });
      }
      const tooltip = tooltipRef.current;
      const tw = tooltip.offsetWidth || 380;
      const th = tooltip.offsetHeight || 200;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (currentStep.target === 'body') {
        setTooltipPos({ top: Math.max(12, (vh - th) / 2), left: Math.max(12, (vw - tw) / 2) });
      } else if (target && target !== document.body) {
        setTooltipPos(getTooltipPosition(target.getBoundingClientRect(), tw, th, vw, vh));
      }
    }
    window.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleResize);
    };
  }, [tourRunning, stepIndex, steps]);

  function handleNext() {
    if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1);
    else completeOnboarding();
  }

  const currentStep = steps[stepIndex];

  return (
    <>
      {children}

      {showWelcome && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 max-w-md w-full text-center shadow-2xl">
            <div className="text-5xl mb-4">🌍</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t('onboarding.welcome.title')}</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed whitespace-pre-line">{t('onboarding.welcome.description')}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={startTour}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors"
              >
                {t('onboarding.welcome.startTour')}
              </button>
              <button
                onClick={completeOnboarding}
                className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-6 py-2.5 rounded-lg font-semibold transition-colors"
              >
                {t('onboarding.welcome.skip')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tourRunning && createPortal(
        <div className="fixed inset-0 z-[10000]" style={{ pointerEvents: 'none' }}>
          {spotlight ? (
            <>
              <div className="fixed bg-black/60" style={{ top: 0, left: 0, right: 0, height: spotlight.top, pointerEvents: 'auto' }} />
              <div className="fixed bg-black/60" style={{ top: spotlight.bottom, left: 0, right: 0, bottom: 0, pointerEvents: 'auto' }} />
              <div className="fixed bg-black/60" style={{ top: spotlight.top, height: spotlight.height, left: 0, width: spotlight.left, pointerEvents: 'auto' }} />
              <div className="fixed bg-black/60" style={{ top: spotlight.top, height: spotlight.height, left: spotlight.right, right: 0, pointerEvents: 'auto' }} />
            </>
          ) : (
            <div className="fixed inset-0 bg-black/60" style={{ pointerEvents: 'auto' }} />
          )}

          <div
            ref={tooltipRef}
            className="fixed bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl p-5"
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
              width: 380,
              maxWidth: 'calc(100vw - 24px)',
              direction: isRtl ? 'rtl' : 'ltr',
              pointerEvents: 'auto',
            }}
          >
            <div className="text-gray-400 dark:text-gray-500 text-xs mb-2 text-center">
              {stepIndex + 1} / {steps.length}
            </div>
            <h3 className="text-gray-900 dark:text-white text-lg font-bold mb-2">{currentStep.title}</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line mb-5">{currentStep.content}</p>
            <div className="flex items-center justify-between gap-2" style={{ flexDirection: isRtl ? 'row-reverse' : 'row' }}>
              <div>
                {stepIndex > 0 && (
                  <button
                    onClick={() => setStepIndex((i) => i - 1)}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white text-sm px-3 py-1.5 rounded transition-colors cursor-pointer"
                  >
                    {t('onboarding.controls.back')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2" style={{ flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                <button
                  onClick={completeOnboarding}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm px-3 py-1.5 rounded transition-colors cursor-pointer"
                >
                  {t('onboarding.controls.skip')}
                </button>
                {stepIndex < steps.length - 1 ? (
                  <button
                    onClick={handleNext}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer"
                  >
                    {t('onboarding.controls.next')}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer"
                  >
                    {t('onboarding.controls.last')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
