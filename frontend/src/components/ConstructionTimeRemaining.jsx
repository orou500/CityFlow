import { useTranslation } from 'react-i18next';

/**
 * Countdown shown next to a building under construction.
 *
 * Pure presentation: takes the same completionPeriod/currentPeriod the caller
 * already used, never writes or mutates construction state. Renders a
 * localized, plural-aware "{N} months left" countdown for every value > 0
 * (companyDevelopment.monthsLeft), and the localized "Final Month" message
 * when remaining === 0 (i.e. currentPeriod === completionPeriod).
 */
export default function ConstructionTimeRemaining({ completionPeriod, currentPeriod }) {
  const { t } = useTranslation();

  if (!completionPeriod || currentPeriod == null) return null;

  const remaining = Math.max(0, completionPeriod - currentPeriod);

  if (remaining === 0) {
    return <>{t('construction.finalMonth')}</>;
  }

  return <>{t('companyDevelopment.monthsLeft', { count: remaining })}</>;
}
