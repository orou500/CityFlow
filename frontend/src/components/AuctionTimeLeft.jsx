import { useTranslation } from 'react-i18next';
import { getAuctionRemainingMonths } from '../utils/auctionTime';

export default function AuctionTimeLeft({
  startTick,
  endTick,
  currentTick,
  status,
  remainingMonths,
  settledAt,
  className,
}) {
  const { t } = useTranslation();
  const months = getAuctionRemainingMonths({ startTick, endTick, currentTick, status, remainingMonths });

  // A settled auction is final: settlement has already committed the winner /
  // no-winner outcome, so "ending" is only the backend's finalization window.
  // Display it as ended instead of an open-ended "finalizing" state.
  const effectiveStatus = status === 'ending' && settledAt != null ? 'ended' : status;

  if (effectiveStatus === 'ended' || effectiveStatus === 'cancelled') {
    return <span className={className}>{t(`auctions.status.${effectiveStatus}`)}</span>;
  }
  if (effectiveStatus === 'ending') {
    return <span className={`${className} text-purple-400 font-medium`}>⏰ {t('auctions.finalizing')}</span>;
  }
  // No authoritative data yet (e.g. a payload without remainingMonths/currentTick):
  // render nothing rather than a bogus countdown.
  if (months === null) {
    return <span className={className}>{t('auctions.timeUnknown')}</span>;
  }
  if (status === 'upcoming') {
    return <span className={className}>{t('auctions.startsInMonths', { count: months })}</span>;
  }
  return (
    <span className={`${className} ${months <= 2 ? 'text-red-400 font-bold animate-pulse' : ''}`}>
      {t('auctions.monthsLeft', { count: months })}
    </span>
  );
}
