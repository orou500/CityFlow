import { useTranslation } from 'react-i18next';
import { useWorldResetCountdown } from '../hooks/useWorldResetCountdown';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Pure duration decomposition — months are fixed 30 days, so the result is a
// deterministic, timezone-independent countdown derived only from the
// server-provided absolute reset instant vs the current absolute time.
export function splitDuration(ms) {
  const total = Math.max(0, ms);
  return {
    months: Math.floor(total / MONTH_MS),
    days: Math.floor((total % MONTH_MS) / DAY_MS),
    hours: Math.floor((total % DAY_MS) / HOUR_MS),
    minutes: Math.floor((total % HOUR_MS) / MINUTE_MS),
  };
}

export default function WorldResetCountdown() {
  const { t, i18n } = useTranslation();
  const { remainingMs, loading } = useWorldResetCountdown();
  const isRtl = i18n.language?.toLowerCase().startsWith('he');

  let countdown = '';
  if (!loading) {
    const { months, days, hours, minutes } = splitDuration(remainingMs);
    // Minutes only matter when the reset is less than a day away.
    const showMinutes = months === 0 && days === 0 && hours === 0;
    const parts = [];
    if (months > 0) parts.push(t('worldReset.months', { count: months }));
    if (days > 0) parts.push(t('worldReset.days', { count: days }));
    if (hours > 0) parts.push(t('worldReset.hours', { count: hours }));
    if (showMinutes && minutes > 0) parts.push(t('worldReset.minutes', { count: minutes }));

    if (parts.length === 0) {
      countdown = t('worldReset.zero');
    } else {
      const params = { p1: parts[0], p2: parts[1], p3: parts[2], p4: parts[3] };
      countdown = t(`worldReset.join${parts.length}`, params);
    }
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 min-w-0 break-words text-center"
    >
      <span className="text-lg font-bold text-primary">{t('worldReset.title')}</span>
      <span className="text-secondary text-sm min-w-0">
        {loading ? t('worldReset.loading') : t('worldReset.label', { countdown })}
      </span>
    </div>
  );
}
