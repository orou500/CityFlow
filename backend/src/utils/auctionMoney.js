import User from '../models/User.js';
import AuctionReservation from '../models/AuctionReservation.js';

/**
 * Auction bid money reservation helpers.
 *
 * Available balance = user.balance - user.reservedAuctionFunds. Reservations
 * are tracked per (user, auction) so funds are always released by exactly the
 * amount that was reserved for that auction.
 */

export function getAvailableBalance(user) {
  return Math.max(0, (user?.balance || 0) - (user?.reservedAuctionFunds || 0));
}

/**
 * Atomically reserve `amount` for the user if their available balance allows
 * it. The single-document $expr guard prevents double-spending even under
 * concurrent bids. Returns the updated user, or null when funds are
 * insufficient.
 */
export async function reserveAuctionFunds(userId, amount) {
  return User.findOneAndUpdate(
    {
      _id: userId,
      $expr: { $lte: [{ $add: ['$reservedAuctionFunds', amount] }, '$balance'] },
    },
    { $inc: { reservedAuctionFunds: amount } },
    { new: true },
  );
}

/**
 * Release `amount` of reserved funds back to available. Clamps at zero so a
 * release can never make the reservation negative.
 */
export async function releaseAuctionFunds(userId, amount) {
  if (!userId || !amount || amount <= 0) return;
  try {
    await User.updateOne(
      { _id: userId, reservedAuctionFunds: { $gte: amount } },
      { $inc: { reservedAuctionFunds: -amount } },
    );
  } catch (err) {
    console.error('[AUCTION-MONEY] Release error:', err.message);
  }
}

/**
 * Release every reservation held on an auction (used on cancellation and after
 * settlement). Returns the number of reservations released.
 */
export async function releaseAuctionReservations(auctionId) {
  const reservations = await AuctionReservation.find({ auctionId }).lean();
  if (reservations.length === 0) return 0;

  for (const r of reservations) {
    await releaseAuctionFunds(r.userId, r.amount);
  }
  await AuctionReservation.deleteMany({ auctionId });

  return reservations.length;
}

/**
 * Upsert the reservation amount for (user, auction).
 */
export async function setAuctionReservation(userId, auctionId, amount) {
  await AuctionReservation.findOneAndUpdate(
    { userId, auctionId },
    { amount, $setOnInsert: { userId, auctionId } },
    { upsert: true, new: true },
  );
}
