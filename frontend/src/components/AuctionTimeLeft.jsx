import { useTranslation } from 'react-i18next';
import { getAuctionRemainingMonths } from '../utils/auctionTime';

export default function AuctionTimeLeft({ startTick, endTick, currentTick, status, remainingMonths, className }) {
  const { t } = useTranslation();
  const months = getAuctionRemainingMonths({ startTick, endTick, currentTick, status, remainingMonths });

  if (status === 'ended' || status === 'cancelled') {
    return <span className={className}>{t(`auctions.status.${status}`)}</span>;
  }
  if (status === 'ending') {
    return <span className={`${className} text-purple-400 font-medium`}>⏰ {t('auctions.finalizing')}</span>;
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
