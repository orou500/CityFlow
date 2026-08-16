const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The single authoritative auction countdown calculation.
 *
 * Every auction response (list, detail, featured, my-bids, watchlist, bid,
 * create, socket payloads) must be derived from this function so the displayed
 * remaining time is identical everywhere. `currentTick` must come from the
 * database (getTickNumber) — never from per-process memory — so every server
 * replica produces the same snapshot.
 *
 * Boundary handling: during the tick-transition window the stored status may
 * briefly lag the tick number (an 'upcoming' auction whose startTick just
 * passed, or an 'active' auction whose endTick just passed). We resolve the
 * EFFECTIVE status so the snapshot never reports a misleading countdown:
 *   upcoming + startTick <= tick  -> behaves as active
 *   active   + endTick   <= tick  -> behaves as ending (0 remaining)
 */
export function computeAuctionRemaining(auction, currentTick) {
  const tick = toNum(currentTick);
  const startTick = toNum(auction?.startTick);
  const endTick = toNum(auction?.endTick);
  const status = auction?.status || 'active';

  let effectiveStatus = status;
  if (status === 'upcoming' && startTick > 0 && startTick <= tick) effectiveStatus = 'active';
  else if (status === 'active' && endTick > 0 && endTick <= tick) effectiveStatus = 'ending';

  let remainingMonths;
  if (effectiveStatus === 'upcoming') {
    remainingMonths = Math.max(0, startTick - tick);
  } else if (effectiveStatus === 'active') {
    remainingMonths = Math.max(0, endTick - tick);
  } else {
    remainingMonths = 0;
  }

  return {
    currentTick: tick,
    startTick,
    endTick,
    status: effectiveStatus,
    remainingMonths,
    ticksRemaining: remainingMonths,
  };
}
