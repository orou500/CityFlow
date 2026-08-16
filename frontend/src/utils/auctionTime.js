const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Returns the remaining months for an auction.
 *
 * The backend is authoritative: whenever the server provides `remainingMonths`
 * (it always does for every auction response), that value is used as-is.
 * The local fallback below only exists for legacy payloads and REQUIRES a valid
 * `currentTick` — without one it returns null instead of computing against 0,
 * so a stale/missing tick can never produce a bogus countdown (e.g. the whole
 * auction length in months).
 *
 * Boundary handling mirrors the backend: an 'upcoming' auction whose startTick
 * has passed behaves as active; an 'active' auction whose endTick has passed
 * behaves as ending (0 remaining).
 */
export function getAuctionRemainingMonths(auction = {}) {
  const { remainingMonths, status } = auction;
  if (typeof remainingMonths === 'number' && Number.isFinite(remainingMonths)) {
    return Math.max(0, Math.round(remainingMonths));
  }

  const currentTick = toNum(auction.currentTick);
  if (currentTick <= 0) return null;

  const startTick = toNum(auction.startTick);
  const endTick = toNum(auction.endTick);

  if (status === 'upcoming' && startTick > currentTick) {
    return Math.max(0, Math.round(startTick - currentTick));
  }
  // upcoming at/past its startTick, or active/ending: count down to endTick.
  if (endTick > 0) {
    return Math.max(0, Math.round(endTick - currentTick));
  }
  return 0;
}
