import { Router } from 'express';
import User from '../models/User.js';
import Property from '../models/Property.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const [playersCount, propertiesCount, citiesCount, transactionsCount] = await Promise.all([
      User.countDocuments({ username: { $ne: '__system__' } }),
      Property.countDocuments(),
      City.countDocuments(),
      Transaction.countDocuments(),
    ]);

    const topPlayers = await User.aggregate([
      { $match: { username: { $ne: '__system__' } } },
      { $lookup: { from: 'properties', localField: '_id', foreignField: 'ownerId', as: 'props' } },
      { $addFields: { portfolioValue: { $sum: '$props.currentPrice' } } },
      { $addFields: { netWorth: { $add: ['$balance', '$portfolioValue'] } } },
      { $sort: { netWorth: -1 } },
      { $limit: 10 },
      { $project: { username: 1, displayName: 1, avatar: 1, netWorth: 1, balance: 1 } },
    ]);

    const recentActivity = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('propertyId', 'name cityId')
      .populate('buyerId', 'username displayName')
      .populate('sellerId', 'username displayName');

    res.json({ playersCount, propertiesCount, citiesCount, transactionsCount, topPlayers, recentActivity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
