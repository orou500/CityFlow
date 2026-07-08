import { Router } from 'express';
import Property from '../models/Property.js';
import User from '../models/User.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

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
          type: { $in: ['buy', 'construction', 'upgrade'] },
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
    await property.save();

    await Transaction.create({
      propertyId: property._id,
      buyerId: buyer._id,
      sellerId: sellerId && sellerId.toString() !== buyer._id.toString() ? sellerId : undefined,
      price,
      type: 'buy',
    });

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

    res.json({ property, balance: seller.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
