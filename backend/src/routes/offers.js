import { Router } from 'express';
import PropertyOffer from '../models/PropertyOffer.js';
import Property from '../models/Property.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { authenticate } from '../middleware/auth.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { onPropertyPurchased } from '../utils/cacheInvalidation.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import { trackEvent, EVENTS } from '../utils/analytics.js';
import { getAvailableBalance } from '../utils/auctionMoney.js';
import { debitUserBalance, creditUserBalance, addOwnedProperty, removeOwnedProperty } from '../utils/atomicBalance.js';
import { withUserLock } from '../utils/userMutex.js';

const MIN_OFFER_PERCENTAGE = 0.7;
const router = Router();

router.use(authenticate);

/**
 * Execute an accepted offer (accept or accept-counter). Atomic:
 * 1. Claim the offer transition (pending|countered → accepted) — exactly one
 *    request can win.
 * 2. Debit the buyer with an available-balance guard; refund + revert on any
 *    later failure so money is conserved.
 * 3. Transfer the property with an owner-guarded CAS.
 * 4. Atomic balance/ownership writes + exactly one ledger entry.
 */
async function executeOfferSale({ offer, _actorUserId, fromStatus }) {
  const price = offer.counterOffer || offer.offerAmount;
  // The route populates propertyId; normalize to the raw id for DB casts.
  const propertyId = offer.propertyId?._id || offer.propertyId;

  // ── 1. Atomic claim of the offer status transition ────────────────────
  const claimed = await PropertyOffer.findOneAndUpdate(
    { _id: offer._id, status: fromStatus },
    { $set: { status: 'accepted' } },
    { new: true },
  );
  if (!claimed) {
    const err = new Error('This offer is no longer available');
    err.status = 409;
    throw err;
  }

  // ── 2. Atomic buyer debit (available-balance guard) ───────────────────
  const debited = await debitUserBalance(offer.buyerId, price);
  if (!debited) {
    await PropertyOffer.updateOne({ _id: offer._id }, { $set: { status: fromStatus } });
    const err = new Error('Insufficient balance');
    err.status = 400;
    throw err;
  }

  // ── 3. Property transfer (owner-guarded CAS) ──────────────────────────
  const property = await Property.findOneAndUpdate(
    {
      _id: propertyId,
      ownerId: offer.sellerId,
    },
    {
      $set: {
        ownerId: offer.buyerId,
        forSale: false,
        lastPurchasePrice: price,
        lastPurchaseDate: new Date(),
        activeImprovement: undefined,
      },
      $push: {
        investmentHistory: {
          type: 'purchase',
          amount: price,
          description: 'Purchased via offer',
        },
      },
    },
    { new: true },
  );
  if (!property) {
    // Revert the claim and refund the buyer — money conserved.
    await Promise.all([
      PropertyOffer.updateOne({ _id: offer._id }, { $set: { status: fromStatus } }),
      creditUserBalance(offer.buyerId, price),
    ]);
    const err = new Error('Seller no longer owns this property');
    err.status = 400;
    throw err;
  }

  // ── 4. Atomic balances + ownership ────────────────────────────────────
  await Promise.all([
    creditUserBalance(offer.sellerId, price),
    removeOwnedProperty(offer.sellerId, propertyId),
    addOwnedProperty(offer.buyerId, propertyId),
  ]);

  const t = await Transaction.create({
    propertyId: property._id,
    buyerId: offer.buyerId,
    sellerId: offer.sellerId,
    price,
    type: 'buy',
  });

  await onPropertyPurchased(offer.buyerId, offer.sellerId, property._id, property.cityId);

  await processPlayerProgress(offer.buyerId, 'property_buy');
  await processPlayerProgress(offer.sellerId, 'property_sell');

  return { offer: claimed, transaction: t, property, balance: debited.balance };
}

async function notify(userId, type, title, message, relatedId, propertyId) {
  await enqueueNotification({
    userId,
    type,
    title,
    message,
    eventKey: `offer:${relatedId}:${type}:${userId}`,
    relatedId,
    // Offers always deep-link to the property's Offers section so both the
    // seller (review/accept/reject) and the buyer (status) land on the
    // relevant entity with the section open.
    route: `/property/${propertyId}?section=offers`,
    tab: 'offers',
    entityType: 'property',
    entityId: propertyId,
  });
}

router.post('/create', async (req, res) => {
  try {
    const { propertyId, amount } = req.body;
    if (!propertyId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid offer data' });
    }

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId) return res.status(400).json({ error: 'Property has no owner' });
    if (property.ownerId.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot offer on your own property' });
    }

    if (!property.ownerId) {
      return res.status(400).json({ error: 'Cannot make offers on bank properties â€” use Buy instead' });
    }

    const minOffer = Math.round(property.currentPrice * MIN_OFFER_PERCENTAGE);
    if (amount < minOffer) {
      return res.status(400).json({
        error: `Minimum offer is $${minOffer.toLocaleString()} (70% of market value)`,
        minOffer,
      });
    }

    const activeOffer = await PropertyOffer.findOne({
      propertyId,
      buyerId: req.user._id,
      status: 'pending',
    });
    if (activeOffer) {
      return res.status(400).json({ error: 'You already have a pending offer on this property' });
    }

    const offer = await PropertyOffer.create({
      propertyId,
      sellerId: property.ownerId,
      buyerId: req.user._id,
      offerAmount: amount,
    });

    await notify(
      property.ownerId,
      'property_offer',
      'New Property Offer',
      `Player ${req.user.username} offered $${amount.toLocaleString()} for ${property.name}`,
      offer._id,
      property._id,
    );

    trackEvent(EVENTS.OFFER_CREATED, { userId: req.user._id, propertyId, amount });

    await processPlayerProgress(req.user._id, 'offer_create');

    res.status(201).json(offer);
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/accept/:id', async (req, res) => {
  try {
    const offer = await PropertyOffer.findById(req.params.id).populate('propertyId');
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.sellerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the seller can accept this offer' });
    }
    if (offer.status !== 'pending') {
      return res.status(400).json({ error: `Offer is already ${offer.status}` });
    }

    if (new Date() > offer.expiresAt) {
      offer.status = 'expired';
      await offer.save();
      return res.status(400).json({ error: 'Offer has expired' });
    }

    const buyer = await User.findById(offer.buyerId);
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });

    const price = offer.counterOffer || offer.offerAmount;
    if (getAvailableBalance(buyer) < price) {
      return res.status(400).json({ error: 'Buyer does not have sufficient funds' });
    }

    const property = await Property.findById(offer.propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== offer.sellerId.toString()) {
      return res.status(400).json({ error: 'Seller no longer owns this property' });
    }

    let result;
    await withUserLock(`offer:${offer._id}`, async () => {
      result = await executeOfferSale({ offer, actorUserId: req.user._id, fromStatus: 'pending' });
    });

    trackEvent(EVENTS.OFFER_ACCEPTED, {
      userId: req.user._id,
      propertyId: offer.propertyId?._id || offer.propertyId,
      price,
    });

    await notify(
      offer.buyerId,
      'offer_accepted',
      'Offer Accepted',
      `Your offer of $${price.toLocaleString()} for ${offer.propertyId?.name || 'a property'} was accepted!`,
      offer._id,
      offer.propertyId?._id,
    );

    res.json({ offer: result.offer, transaction: result.transaction, balance: result.balance });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.serverError(err);
  }
});

router.post('/reject/:id', async (req, res) => {
  try {
    const offer = await PropertyOffer.findById(req.params.id).populate('propertyId');
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.sellerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the seller can reject this offer' });
    }
    if (offer.status !== 'pending') {
      return res.status(400).json({ error: `Offer is already ${offer.status}` });
    }

    offer.status = 'rejected';
    await offer.save();

    await notify(
      offer.buyerId,
      'offer_rejected',
      'Offer Rejected',
      `Your offer of $${(offer.counterOffer || offer.offerAmount).toLocaleString()} for ${offer.propertyId?.name || 'a property'} was rejected`,
      offer._id,
      offer.propertyId?._id,
    );

    res.json(offer);
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/counter/:id', async (req, res) => {
  try {
    const { counterAmount } = req.body;
    if (!counterAmount || counterAmount <= 0) {
      return res.status(400).json({ error: 'Invalid counter amount' });
    }

    const offer = await PropertyOffer.findById(req.params.id).populate('propertyId');
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.sellerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the seller can counter this offer' });
    }
    if (offer.status !== 'pending') {
      return res.status(400).json({ error: `Offer is already ${offer.status}` });
    }

    if (new Date() > offer.expiresAt) {
      offer.status = 'expired';
      await offer.save();
      return res.status(400).json({ error: 'Offer has expired' });
    }

    const minOffer = Math.round(offer.propertyId?.currentPrice * MIN_OFFER_PERCENTAGE || 0);
    if (counterAmount < minOffer) {
      return res.status(400).json({
        error: `Minimum counter offer is $${minOffer.toLocaleString()}`,
        minOffer,
      });
    }

    offer.counterOffer = counterAmount;
    offer.counterBy = req.user._id;
    offer.status = 'countered';
    await offer.save();

    await notify(
      offer.buyerId,
      'offer_countered',
      'Counter Offer Received',
      `Seller countered with $${counterAmount.toLocaleString()} for ${offer.propertyId?.name || 'a property'}`,
      offer._id,
      offer.propertyId?._id,
    );

    res.json(offer);
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/accept-counter/:id', async (req, res) => {
  try {
    const offer = await PropertyOffer.findById(req.params.id).populate('propertyId');
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.buyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the buyer can accept a counter offer' });
    }
    if (offer.status !== 'countered') {
      return res.status(400).json({ error: 'No active counter offer to accept' });
    }

    if (new Date() > offer.expiresAt) {
      offer.status = 'expired';
      await offer.save();
      return res.status(400).json({ error: 'Offer has expired' });
    }

    const price = offer.counterOffer;
    const buyer = await User.findById(offer.buyerId);
    if (getAvailableBalance(buyer) < price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const property = await Property.findById(offer.propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== offer.sellerId.toString()) {
      return res.status(400).json({ error: 'Seller no longer owns this property' });
    }

    let result;
    await withUserLock(`offer:${offer._id}`, async () => {
      result = await executeOfferSale({ offer, actorUserId: req.user._id, fromStatus: 'countered' });
    });

    await notify(
      offer.sellerId,
      'offer_accepted',
      'Counter Offer Accepted',
      `Buyer accepted your counter offer of $${price.toLocaleString()} for ${property.name}`,
      offer._id,
      property._id,
    );

    res.json({ offer: result.offer, transaction: result.transaction, balance: result.balance });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.serverError(err);
  }
});

router.get('/sent', async (req, res) => {
  try {
    const offers = await PropertyOffer.find({ buyerId: req.user._id })
      .populate('propertyId', 'name currentPrice')
      .populate('sellerId', 'username')
      .sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/received', async (req, res) => {
  try {
    const offers = await PropertyOffer.find({ sellerId: req.user._id })
      .populate('propertyId', 'name currentPrice')
      .populate('buyerId', 'username')
      .sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/property/:propertyId', async (req, res) => {
  try {
    const offers = await PropertyOffer.find({ propertyId: req.params.propertyId, sellerId: req.user._id })
      .populate('propertyId', 'name currentPrice')
      .populate('buyerId', 'username')
      .sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
