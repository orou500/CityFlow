import { Router } from 'express';
import Property from '../models/Property.js';
import User from '../models/User.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import { authenticate } from '../middleware/auth.js';
import { awardXp } from '../utils/leveling.js';
import {
  GRADE_NAMES,
  MAX_GRADE,
  GRADE_VALUE_BONUS,
  GRADE_RENT_BONUS,
  GRADE_UPGRADE_COOLDOWN_MS,
  getGradeUpgradeCost,
  getGradeRentMultiplier,
} from '../config/propertyGrades.js';

const router = Router();
const PROPERTY_XP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

router.get('/', async (req, res) => {
  try {
    const {
      search,
      minPrice,
      maxPrice,
      city,
      country,
      type,
      seller,
      sort,
      page = '1',
      limit = '21',
      forSale,
    } = req.query;

    const filter = {};

    if (forSale === 'true') filter.forSale = true;
    else if (forSale === 'false') filter.forSale = false;

    if (minPrice || maxPrice) {
      filter.currentPrice = {};
      if (minPrice) filter.currentPrice.$gte = parseFloat(minPrice);
      if (maxPrice) filter.currentPrice.$lte = parseFloat(maxPrice);
    }

    if (type && ['apartment', 'house', 'commercial', 'land'].includes(type)) {
      filter.type = type;
    }

    if (seller === 'bank') {
      filter.ownerId = null;
    } else if (seller === 'player') {
      filter.ownerId = { $exists: true, $ne: null };
    }

    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (city || country) {
      const cityQuery = {};
      if (city) cityQuery.name = { $regex: `^${esc(city)}$`, $options: 'i' };
      if (country) cityQuery.country = { $regex: `^${esc(country)}$`, $options: 'i' };
      const found = await City.find(cityQuery).select('_id').lean();
      filter.cityId = { $in: found.length ? found.map((c) => c._id) : [null] };
    }

    if (search) {
      const searchRegex = new RegExp(esc(search), 'i');
      const nameCond = { name: searchRegex };
      const searchedCities = await City.find({ name: searchRegex }).select('_id').lean();
      if (searchedCities.length) {
        const cityCond = { cityId: { $in: searchedCities.map((c) => c._id) } };
        filter.$or = [nameCond, cityCond];
      } else {
        filter.name = searchRegex;
      }
    }

    let sortOption = { createdAt: -1 };
    switch (sort) {
      case 'price_asc':
        sortOption = { currentPrice: 1 };
        break;
      case 'price_desc':
        sortOption = { currentPrice: -1 };
        break;
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'return':
        sortOption = { rent: -1 };
        break;
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 21));
    const skip = (pageNum - 1) * limitNum;

    const [total, properties] = await Promise.all([
      Property.countDocuments(filter),
      Property.find(filter)
        .populate('ownerId', 'username')
        .populate('cityId', 'name country')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    res.json({ properties, total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/detail', authenticate, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).populate('ownerId', 'username').populate('cityId');
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const rentTransactions = await Transaction.find({
      propertyId: property._id,
      type: 'rent',
    });
    const totalRentEarned = rentTransactions.reduce((sum, t) => sum + t.price, 0);

    const ownerId = property.ownerId?._id || property.ownerId;
    const investmentTransactions = ownerId
      ? await Transaction.find({
          propertyId: property._id,
          type: { $in: ['buy', 'construction', 'upgrade', 'grade_upgrade'] },
          buyerId: ownerId,
        })
      : [];
    const totalInvestment = investmentTransactions.reduce((sum, t) => sum + t.price, 0);

    res.json({ property, totalRentEarned, totalInvestment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).populate('ownerId', 'username');
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/buy', authenticate, async (req, res) => {
  try {
    const { propertyId } = req.body;
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.forSale) return res.status(400).json({ error: 'Property not for sale' });

    if (property.type === 'land' && property.developmentLevel > 0) {
      return res.status(400).json({ error: 'This land is under development and cannot be bought directly' });
    }

    const buyer = await User.findById(req.user._id);
    if (!buyer) return res.status(404).json({ error: 'User not found' });

    if (property.ownerId && property.ownerId.toString() === buyer._id.toString()) {
      return res.status(400).json({ error: 'You already own this property' });
    }

    const city = await City.findById(property.cityId);
    if (!city) return res.status(404).json({ error: 'City not found' });

    const ownedInCity = await Property.countDocuments({ ownerId: buyer._id, cityId: city._id });
    const maxAllowed = Math.max(1, Math.floor(city.propertyCount * 0.05));
    if (ownedInCity >= maxAllowed) {
      return res.status(400).json({
        error: `City ownership limit reached. You can own at most ${maxAllowed} properties in ${city.name}`,
        limit: maxAllowed,
        owned: ownedInCity,
      });
    }

    const price = property.currentPrice;
    if (buyer.balance < price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const sellerId = property.ownerId;
    if (sellerId) {
      const seller = await User.findById(sellerId);
      if (seller) {
        seller.balance += price;
        seller.ownedProperties = seller.ownedProperties.filter((p) => p.toString() !== propertyId);
        await seller.save();
      }
    }

    buyer.balance -= price;
    buyer.ownedProperties.push(property._id);
    await buyer.save();

    property.ownerId = buyer._id;
    property.forSale = false;
    property.lastPurchasePrice = price;
    property.lastPurchaseDate = new Date();
    property.activeImprovement = undefined;
    await property.save();

    const lastBuyTx = await Transaction.findOne({
      buyerId: buyer._id,
      type: 'buy',
    }).sort({ createdAt: -1 });
    const boughtRecently = lastBuyTx && new Date() - new Date(lastBuyTx.createdAt) < PROPERTY_XP_COOLDOWN_MS;

    await Transaction.create({
      propertyId: property._id,
      buyerId: buyer._id,
      sellerId: sellerId && sellerId.toString() !== buyer._id.toString() ? sellerId : undefined,
      price,
      type: 'buy',
    });

    if (!boughtRecently) {
      await awardXp(buyer, 10, 'property_buy');
    }
    buyer.lifetimeStats.totalTransactions += 1;
    buyer.lifetimeStats.totalPropertiesOwned += 1;
    buyer.lifetimeStats.totalMoneySpent += price;
    await buyer.save();

    res.json({ property, balance: buyer.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sell', authenticate, async (req, res) => {
  try {
    const { propertyId } = req.body;
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(400).json({ error: 'You do not own this property' });
    }
    if (property.forSale) {
      return res.status(400).json({ error: 'Property is already listed for sale' });
    }

    if (property.developmentLevel === 1) {
      return res.status(400).json({ error: 'Property is under construction and cannot be sold yet' });
    }

    const seller = await User.findById(req.user._id);
    const salePrice = property.currentPrice;
    const purchasedAt = property.lastPurchaseDate;

    seller.balance += salePrice;
    seller.ownedProperties = seller.ownedProperties.filter((p) => p.toString() !== propertyId);
    await seller.save();

    property.ownerId = null;
    property.forSale = true;
    property.lastPurchasePrice = salePrice;
    property.lastPurchaseDate = new Date();
    await property.save();

    await Transaction.create({
      propertyId: property._id,
      sellerId: req.user._id,
      price: salePrice,
      type: 'sell',
    });

    const heldLongEnough = purchasedAt && new Date() - new Date(purchasedAt) >= PROPERTY_XP_COOLDOWN_MS;
    if (heldLongEnough) {
      await awardXp(seller, 5, 'property_sell');
    }
    seller.lifetimeStats.totalTransactions += 1;
    seller.lifetimeStats.totalMoneyEarned += salePrice;
    await seller.save();

    res.json({ property, balance: seller.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/grade', authenticate, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You do not own this property' });
    }

    const grade = property.grade || 1;
    const nextGrade = grade < MAX_GRADE ? grade + 1 : null;
    const upgradeCost = getGradeUpgradeCost(grade, property.currentPrice);

    const now = new Date();
    const lastUpgrade = property.lastGradeUpgradeAt;
    const cooldownRemaining = lastUpgrade
      ? Math.max(0, GRADE_UPGRADE_COOLDOWN_MS - (now.getTime() - new Date(lastUpgrade).getTime()))
      : 0;
    const nextAvailableAt = cooldownRemaining > 0 ? new Date(now.getTime() + cooldownRemaining) : null;

    res.json({
      grade,
      gradeName: GRADE_NAMES[grade - 1],
      nextGrade,
      nextGradeName: nextGrade ? GRADE_NAMES[nextGrade - 1] : null,
      upgradeCost,
      valueBonus: GRADE_VALUE_BONUS[grade - 1],
      rentBonus: GRADE_RENT_BONUS[grade - 1],
      nextValueBonus: nextGrade ? GRADE_VALUE_BONUS[nextGrade - 1] : null,
      nextRentBonus: nextGrade ? GRADE_RENT_BONUS[nextGrade - 1] : null,
      lastUpgradeAt: lastUpgrade ? new Date(lastUpgrade).toISOString() : null,
      cooldownRemaining,
      nextAvailableAt: nextAvailableAt ? nextAvailableAt.toISOString() : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/grade/upgrade', authenticate, async (req, res) => {
  try {
    const { propertyId } = req.body;
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You do not own this property' });
    }

    const currentGrade = property.grade || 1;
    if (currentGrade >= MAX_GRADE) {
      return res.status(400).json({ error: 'Property is already at maximum grade' });
    }

    const now = new Date();
    if (property.lastGradeUpgradeAt) {
      const elapsed = now.getTime() - new Date(property.lastGradeUpgradeAt).getTime();
      if (elapsed < GRADE_UPGRADE_COOLDOWN_MS) {
        const remainingMs = GRADE_UPGRADE_COOLDOWN_MS - elapsed;
        const remainingH = Math.ceil(remainingMs / (60 * 60 * 1000));
        return res.status(429).json({
          error: `Upgrade cooldown active. Try again in ${remainingH} hour${remainingH > 1 ? 's' : ''}.`,
          cooldownRemaining: remainingMs,
          nextAvailableAt: new Date(now.getTime() + remainingMs).toISOString(),
        });
      }
    }

    const cost = getGradeUpgradeCost(currentGrade, property.currentPrice);
    if (cost === null) {
      return res.status(400).json({ error: 'Property is already at maximum grade' });
    }

    const user = await User.findById(req.user._id);
    if (user.balance < cost) {
      return res.status(400).json({ error: `Insufficient funds. Required: $${cost.toLocaleString()}` });
    }

    user.balance -= cost;
    await user.save();

    const newGrade = currentGrade + 1;
    const oneTimeBoost = 0.01;
    const prevPrice = property.currentPrice;
    const prevRent = property.rent || 0;
    property.currentPrice = Math.round(property.currentPrice * (1 + oneTimeBoost));
    property.grade = newGrade;
    const gradeRentFactor = getGradeRentMultiplier(newGrade);
    property.rent = Math.round(property.currentPrice * 0.004 * 0.75 * gradeRentFactor);
    property.gradeHistory = property.gradeHistory || [];
    property.gradeHistory.push({ grade: newGrade, upgradedAt: new Date(), cost });
    property.lastGradeUpgradeAt = new Date();
    await property.save();

    await Transaction.create({
      propertyId: property._id,
      buyerId: user._id,
      price: cost,
      type: 'grade_upgrade',
    });

    await Notification.create({
      userId: user._id,
      type: 'system',
      title: 'Property Grade Upgraded',
      message: `"${property.name}" upgraded to Grade ${GRADE_NAMES[newGrade - 1]}. Value: $${prevPrice.toLocaleString()} → $${property.currentPrice.toLocaleString()}. Rent: $${prevRent.toLocaleString()} → $${property.rent.toLocaleString()}.`,
      relatedId: property._id,
      global: false,
    });

    await awardXp(user, 15, 'property_grade_upgrade');
    user.lifetimeStats.totalTransactions += 1;
    user.lifetimeStats.totalMoneySpent += cost;
    await user.save();

    res.json({ property, balance: user.balance, grade: newGrade, upgradeCost: cost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
