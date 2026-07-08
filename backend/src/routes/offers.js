import { Router } from 'express';
import PropertyOffer from '../models/PropertyOffer.js';
import Notification from '../models/Notification.js';
import Property from '../models/Property.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { authenticate } from '../middleware/auth.js';

const MIN_OFFER_PERCENTAGE = 0.7;
const router = Router();

router.use(authenticate);

async function notify(userId, type, title, message, relatedId) {
  await Notification.create({ userId, type, title, message, relatedId });
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

    const seller = await User.findById(property.ownerId);
    if (!seller) return res.status(400).json({ error: 'Owner not found' });
    if (seller.username === '__system__') {
      return res.status(400).json({ error: 'Cannot make offers on bank properties — use Buy instead' });
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
    );

    res.status(201).json(offer);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    if (buyer.balance < price) {
      return res.status(400).json({ error: 'Buyer does not have sufficient funds' });
    }

    const property = await Property.findById(offer.propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== offer.sellerId.toString()) {
      return res.status(400).json({ error: 'Seller no longer owns this property' });
    }

    const seller = await User.findById(offer.sellerId);

    buyer.balance -= price;
    buyer.ownedProperties.push(property._id);
    await buyer.save();

    seller.balance += price;
    seller.ownedProperties = seller.ownedProperties.filter(
      p => p.toString() !== property._id.toString()
    );
    await seller.save();

    property.ownerId = buyer._id;
    property.forSale = false;
    property.lastPurchasePrice = price;
    property.lastPurchaseDate = new Date();
    await property.save();

    const t = await Transaction.create({
      propertyId: property._id,
      buyerId: buyer._id,
      sellerId: seller._id,
      price,
      type: 'buy',
    });

    offer.status = 'accepted';
    await offer.save();

    await notify(
      offer.buyerId,
      'offer_accepted',
      'Offer Accepted',
      `Your offer of $${price.toLocaleString()} for ${property.name} was accepted!`,
      offer._id,
    );

    res.json({ offer, transaction: t, balance: seller.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    );

    res.json(offer);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    );

    res.json(offer);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    if (buyer.balance < price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const property = await Property.findById(offer.propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== offer.sellerId.toString()) {
      return res.status(400).json({ error: 'Seller no longer owns this property' });
    }

    const seller = await User.findById(offer.sellerId);

    buyer.balance -= price;
    buyer.ownedProperties.push(property._id);
    await buyer.save();

    seller.balance += price;
    seller.ownedProperties = seller.ownedProperties.filter(
      p => p.toString() !== property._id.toString()
    );
    await seller.save();

    property.ownerId = buyer._id;
    property.forSale = false;
    property.lastPurchasePrice = price;
    property.lastPurchaseDate = new Date();
    await property.save();

    const t = await Transaction.create({
      propertyId: property._id,
      buyerId: buyer._id,
      sellerId: seller._id,
      price,
      type: 'buy',
    });

    offer.status = 'accepted';
    await offer.save();

    await notify(
      offer.sellerId,
      'offer_accepted',
      'Counter Offer Accepted',
      `Buyer accepted your counter offer of $${price.toLocaleString()} for ${property.name}`,
      offer._id,
    );

    res.json({ offer, transaction: t, balance: buyer.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
