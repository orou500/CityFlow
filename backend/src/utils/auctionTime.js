const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function computeAuctionRemaining(auction, currentTick) {
  const tick = toNum(currentTick);
  const startTick = toNum(auction?.startTick);
  const endTick = toNum(auction?.endTick);
  const status = auction?.status || 'active';

  let remainingMonths;
  if (status === 'upcoming') {
    remainingMonths = Math.max(0, startTick - tick);
  } else if (status === 'active') {
    remainingMonths = Math.max(0, endTick - tick);
  } else {
    remainingMonths = 0;
  }

  return {
    currentTick: tick,
    startTick,
    endTick,
    status,
    remainingMonths,
    ticksRemaining: remainingMonths,
  };
}
