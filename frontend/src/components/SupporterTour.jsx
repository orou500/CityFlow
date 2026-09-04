import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const STEPS = [
  { id: 'username', sectionId: 'si-tour-username' },
  { id: 'profile', sectionId: 'si-tour-profile' },
  { id: 'avatar', sectionId: 'si-tour-avatar' },
  { id: 'identity', sectionId: 'si-tour-identity' },
  { id: 'save', sectionId: 'si-tour-save' },
];

/**
 * Short (5-step) guided tour for new supporters, shown on the Supporter Style
 * page. Reuses the same card style as the main onboarding tour. `open` is
 * controlled by the parent: it auto-opens when the server onboarding state is
 * 'pending' and can be replayed anytime via the "Supporter guide" button.
 * Completion/skip is reported to the parent, which persists it server-side.
 */
export default function SupporterTour({ open, onDone, onSkip }) {
  const { t, i18n } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [highlightedId, setHighlightedId] = useState(null);
  const highlightRef = useRef(null);
  const isRtl = i18n.language === 'he';

  // Reset when (re)opened.
  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setHighlightedId(null);
    }
  }, [open]);

  // Scroll the active section into view and highlight it.
  useEffect(() => {
    if (!open) return undefined;
    const step = STEPS[stepIndex];
    const el = document.getElementById(step.sectionId);
    if (!el) return undefined;
    if (typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        // scrollIntoView may be unavailable (jsdom) — the tour still works.
      }
    }
    setHighlightedId(step.sectionId);
    return () => setHighlightedId(null);
  }, [open, stepIndex]);

  if (!open) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const next = () => {
    if (isLast) {
      onDone?.();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[9999] flex items-end sm:items-center justify-center ${
        isRtl ? 'rtl' : 'ltr'
      }`}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      data-testid="supporter-tour"
    >
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative pointer-events-auto bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full sm:max-w-md p-5 sm:p-6 max-h-[80vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supporter-tour-title"
      >
        {/* Progress header */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-1.5 flex-1">
            {STEPS.map((s, idx) => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full flex-1 transition-colors ${
                  idx <= stepIndex ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
          <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {t('onboarding.tour.progress', { current: stepIndex + 1, total: STEPS.length })}
          </span>
        </div>

        <div className="text-4xl mb-3 text-center" aria-hidden="true">
          {step.id === 'username'
            ? '✏️'
            : step.id === 'profile'
              ? '🖼️'
              : step.id === 'avatar'
                ? '🖼️'
                : step.id === 'identity'
                  ? '🏅'
                  : '💾'}
        </div>
        <h2 id="supporter-tour-title" className="text-lg font-bold text-gray-900 dark:text-white mb-2 text-center">
          {t(`supporterIdentity.onboarding.step${stepIndex + 1}Title`)}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-5 text-center">
          {t(`supporterIdentity.onboarding.step${stepIndex + 1}Description`)}
        </p>

        <div className="flex gap-2 justify-center">
          <button
            onClick={next}
            className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors"
          >
            {isLast ? t('supporterIdentity.onboarding.done') : t('supporterIdentity.onboarding.next')}
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={onSkip}
            className="text-xs text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 underline"
          >
            {t('supporterIdentity.onboarding.skip')}
          </button>
        </div>
      </div>
    </div>
  );
}
