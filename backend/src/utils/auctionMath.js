/**
 * Authoritative auction minimum-bid mathematics.
 *
 * Every amount that decides "can this bid win a reserve auction" is derived
 * here — the API responses (list / detail / featured / history / my-bids /
 * watchlist / bid result / socket payloads) AND the bid validation read the
 * SAME functions, so the UI can never display a number the backend would
 * reject, and a malicious client can never bypass the reserve by sending a
 * lower bid.
 *
 * Money is always an integer Number (values are floored at creation and
 * settlement; increments and reserves are never fractional). No floating-point
 * currency math anywhere.
 */

function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The normal next-bid rule (unchanged by this system):
 *   - no bids yet  -> startingBid
 *   - bids present -> currentBid + bidIncrement
 */
export function calculateMinimumNextBid(auction = {}) {
  const currentBid = toMoney(auction.currentBid);
  if (currentBid > 0) {
    return Math.max(0, currentBid + toMoney(auction.bidIncrement));
  }
  return Math.max(0, toMoney(auction.startingBid));
}

/**
 * Whether the current bid satisfies the reserve requirement RIGHT NOW.
 * A reserve auction counts as met when the persisted `reserveMet` flag says so
 * OR the persisted currentBid already reaches reservePrice (stale-flag safety
 * — e.g. a company bid applied before this flag was tracked). Standard
 * auctions always qualify.
 */
export function isReserveMet(auction = {}) {
  if (auction.auctionType !== 'reserve') return true;
  if (auction.reserveMet === true) return true;
  return toMoney(auction.currentBid) >= toMoney(auction.reservePrice);
}

/**
 * The smallest bid the backend will accept that is ALSO the smallest bid that
 * makes the bidder eligible to win if the auction ended right now:
 *   - reserve auction, reserve not yet met:
 *         max(nextBid rule, reservePrice)
 *   - reserve auction already met / standard auction:
 *         nextBid rule
 */
export function calculateMinimumWinningBid(auction = {}) {
  const nextBid = calculateMinimumNextBid(auction);
  if (auction.auctionType === 'reserve' && !isReserveMet(auction)) {
    return Math.max(nextBid, toMoney(auction.reservePrice));
  }
  return nextBid;
}
