import { useTranslation } from 'react-i18next';

/**
 * Countdown shown next to a building under construction.
 *
 * Pure presentation: takes the same completionPeriod/currentPeriod the caller
 * already used, never writes or mutates construction state. Preserves the
 * existing "{X} months left" display for every value > 0; only the final
 * month (remaining === 0, i.e. currentPeriod === completionPeriod) shows the
 * localized "Final Month" message.
 */
export default function ConstructionTimeRemaining({ completionPeriod, currentPeriod }) {
  const { t } = useTranslation();

  if (!completionPeriod || currentPeriod == null) return null;

  const remaining = Math.max(0, completionPeriod - currentPeriod);

  if (remaining === 0) {
    return <>{t('construction.finalMonth')}</>;
  }

  return (
    <>
      {remaining} {t('companyDevelopment.months') || 'mo'} {t('development.left') || 'left'}
    </>
  );
}
