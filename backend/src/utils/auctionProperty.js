/**
 * Auction property resolution helpers.
 *
 * The Auction stores only a `propertyId` reference (plus an immutable
 * `propertySnapshot` — see Auction.js). A live Property document is the normal
 * resolution source, but bank properties are recycled after no-winner /
 * cancelled settlements, so an ended/cancelled auction can legitimately point
 * at a deleted document. These helpers turn that into a READABLE historical
 * record instead of an "Unknown Property" blank:
 *
 *   1. live property             -> the property object as-is (propertyAvailable)
 *   2. live missing + snapshot   -> display object rebuilt from the snapshot
 *   3. live missing, no snapshot -> controlled placeholder (name null, marked
 *                                   unavailable) — never the raw propertyId
 *
 * Every auction endpoint must pass its serialized auction through one of these
 * before returning, so list/detail/featured/my-bids/watchlist/history all
 * resolve the same property.
 */

/**
 * Build the immutable snapshot for an auction from a live Property document.
 * Safe to call with a lean or populated doc.
 */
export function buildPropertySnapshot(property) {
  if (!property) return null;
  return {
    propertyId: property._id ?? null,
    name: typeof property.name === 'string' ? property.name : null,
    type: property.type ?? null,
    propertyRating: property.propertyRating ?? null,
    condition: typeof property.condition === 'number' ? property.condition : null,
    currentPrice: property.currentPrice ?? property.basePrice ?? null,
    basePrice: property.basePrice ?? null,
    cityId: property.cityId ?? null,
    location: typeof property.location === 'string' ? property.location : null,
  };
}

function toId(value) {
  if (value == null) return null;
  return typeof value === 'object' ? String(value._id || value.toString?.() || value) : String(value);
}

/**
 * Build a display property object purely from `propertySnapshot`.
 * Returns null when no snapshot exists.
 */
export function propertyFromSnapshot(auction) {
  const snap = auction?.propertySnapshot;
  if (!snap) return null;
  const pid = toId(auction?.propertyId) || toId(snap.propertyId);
  return {
    _id: pid,
    name: snap.name ?? null,
    type: snap.type ?? null,
    propertyRating: snap.propertyRating ?? 'standard',
    condition: snap.condition ?? null,
    currentPrice: snap.currentPrice ?? snap.basePrice ?? null,
    basePrice: snap.basePrice ?? null,
    cityId: toId(snap.cityId),
    location: snap.location ?? null,
    fromSnapshot: true,
  };
}

/**
 * Controlled placeholder for legacy auctions whose property AND snapshot are
 * both gone (pre-snapshot deletions). Readable, never the raw id.
 */
export function propertyPlaceholder(auction) {
  const pid = toId(auction?.propertyId);
  return {
    _id: pid,
    name: null,
    type: null,
    propertyRating: 'standard',
    condition: null,
    currentPrice: null,
    basePrice: null,
    cityId: null,
    location: null,
    unavailable: true,
  };
}

/**
 * Resolve the property object for a serialized auction that carries the live
 * property under `property.property` (aggregate/$lookup shape) or
 * `property.propertyId` (populate shape, already an object or null).
 *
 * Returns { property, propertyAvailable }.
 */
export function resolveAuctionProperty(auction) {
  if (!auction) return { property: null, propertyAvailable: false };

  const live =
    (Array.isArray(auction.property) ? auction.property[0] : auction.property) ??
    (auction.propertyId && typeof auction.propertyId === 'object' ? auction.propertyId : null);

  if (live && (live._id || live.name)) {
    return { property: live, propertyAvailable: true };
  }

  const fromSnapshot = propertyFromSnapshot(auction);
  if (fromSnapshot) return { property: fromSnapshot, propertyAvailable: false };

  if (auction.propertyId) return { property: propertyPlaceholder(auction), propertyAvailable: false };

  return { property: null, propertyAvailable: false };
}

/**
 * Ensure a serialized auction (populate shape, e.g. detail/featured/my-bids)
 * exposes the resolved property under `property` and stamps `propertyAvailable`.
 * The live populated `propertyId` stays untouched (ROI/valueToBid enrich it);
 * when the live property is gone, `property` is filled from the snapshot or a
 * controlled placeholder so the record never reads as "Unknown Property".
 * Mutates and returns the object.
 */
export function ensureAuctionProperty(auctionObj, auction) {
  const source = auction || auctionObj;
  if (auctionObj.propertyId && typeof auctionObj.propertyId === 'object') {
    auctionObj.property = auctionObj.propertyId;
    auctionObj.propertyAvailable = true;
    return auctionObj;
  }
  const fallback = propertyFromSnapshot(source) || propertyPlaceholder(source);
  auctionObj.property = fallback;
  // A snapshot/placeholder is a historical record, never a live purchasable
  // property — propertyAvailable means a live property is attached.
  auctionObj.propertyAvailable = false;
  return auctionObj;
}

/**
 * Ensure a $lookup-style row (list endpoint) exposes a property object:
 * preserves the live `property` when present, otherwise falls back to the
 * snapshot or a controlled placeholder. Mutates and returns the row.
 */
export function ensureLookupProperty(row) {
  if (row.property && (row.property._id || row.property.name)) {
    row.propertyAvailable = true;
    return row;
  }
  const property = propertyFromSnapshot(row) || propertyPlaceholder(row);
  row.property = property;
  row.propertyAvailable = false;
  return row;
}
