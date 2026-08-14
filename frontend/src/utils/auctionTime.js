const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function getAuctionRemainingMonths(auction = {}) {
  const { remainingMonths, status } = auction;
  if (typeof remainingMonths === 'number' && Number.isFinite(remainingMonths)) {
    return Math.max(0, Math.round(remainingMonths));
  }
  const currentTick = Math.max(0, toNum(auction.currentTick));
  const startTick = toNum(auction.startTick);
  const endTick = toNum(auction.endTick);
  if (status === 'upcoming') {
    return Math.max(0, Math.round(startTick - currentTick));
  }
  return Math.max(0, Math.round(endTick - currentTick));
}
