import Property from '../models/Property.js';
import Auction from '../models/Auction.js';

/**
 * City property ownership rules — single source of truth.
 *
 * A player may own at most 5% of a city's property count (same rule as the
 * direct purchase route). Auction bidding additionally considers properties
 * the player is currently winning, so multiple simultaneous bids cannot
 * bypass the limit.
 */

export async function getCityPropertyLimit(city) {
  return Math.max(1, Math.floor((city?.propertyCount || 0) * 0.05));
}

/**
 * Returns { owned, potential } for a user in a city:
 * - owned: properties they currently own in the city
 * - potential: owned + properties they are currently winning at auction in
 *   the same city (active/ending auctions where they are the highest bidder)
 */
export async function getCityOwnershipStats(userId, cityId) {
  const [owned, winningAuctions] = await Promise.all([
    Property.countDocuments({ ownerId: userId, cityId }),
    Auction.find({
      currentBidderId: userId,
      status: { $in: ['active', 'ending'] },
    })
      .select('propertyId')
      .lean(),
  ]);

  let pending = 0;
  const propIds = (winningAuctions || []).map((a) => a.propertyId).filter(Boolean);
  if (propIds.length > 0) {
    pending = await Property.countDocuments({ _id: { $in: propIds }, cityId });
  }

  return { owned, potential: owned + pending };
}
