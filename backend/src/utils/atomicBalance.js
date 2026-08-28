import User from '../models/User.js';

/**
 * Atomic balance helpers. Database atomicity is the final protection against
 * concurrent requests (multi-replica): every debit carries a single-document
 * $expr guard so the available balance (balance minus auction reservations)
 * can never go negative, and every write is a targeted $inc — never a
 * read-modify-write save() that can lose concurrent updates.
 */

/**
 * Atomically debit `amount` from the user's available balance
 * (balance - reservedAuctionFunds). Returns the updated user doc, or null
 * when the funds are insufficient.
 */
export async function debitUserBalance(userId, amount) {
  if (!userId || !amount || amount <= 0) return null;
  return User.findOneAndUpdate(
    {
      _id: userId,
      $expr: {
        $gte: [{ $subtract: ['$balance', { $ifNull: ['$reservedAuctionFunds', 0] }] }, amount],
      },
    },
    { $inc: { balance: -amount } },
    { new: true },
  );
}

/** Atomically credit `amount` to the user's balance. */
export async function creditUserBalance(userId, amount) {
  if (!userId || !amount || amount <= 0) return null;
  return User.updateOne({ _id: userId }, { $inc: { balance: amount } });
}

/** Atomically append a property id to the user's ownedProperties. */
export async function addOwnedProperty(userId, propertyId) {
  return User.updateOne({ _id: userId }, { $addToSet: { ownedProperties: propertyId } });
}

/** Atomically remove a property id from the user's ownedProperties. */
export async function removeOwnedProperty(userId, propertyId) {
  return User.updateOne({ _id: userId }, { $pull: { ownedProperties: propertyId } });
}
