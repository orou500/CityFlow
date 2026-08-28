/**
 * Resolve and judge the property object attached to an auction payload.
 *
 * The backend guarantees every auction response carries a `property` (list) or
 * `propertyId` (detail/featured/my-bids/watchlist/history) object:
 *   - the live property when the document still exists,
 *   - an immutable snapshot object (fromSnapshot) when the property was
 *     recycled but a snapshot was captured before deletion,
 *   - a controlled placeholder (`unavailable: true`, name null) for legacy
 *     auctions whose property AND snapshot are both gone.
 *
 * A payload must therefore NEVER fall back to the raw id or an "Unknown
 * Property" label; the only case that is genuinely unknown is the legacy
 * placeholder, which renders a localized "property no longer available" note.
 */
export function getAuctionProperty(auction = {}) {
  const p = auction.property || auction.propertyId;
  if (!p || typeof p !== 'object') return null;
  return p;
}

export function isAuctionPropertyKnown(auction = {}) {
  const p = getAuctionProperty(auction);
  if (!p) return false;
  // Legacy placeholder (property gone AND no snapshot): never present a name.
  if (p.unavailable) return false;
  if (auction.propertyAvailable === false && !p.name) return false;
  return Boolean(p.name || p._id);
}
