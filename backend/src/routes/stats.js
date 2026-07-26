import { Router } from 'express';
import User from '../models/User.js';
import Property from '../models/Property.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import { cacheGetOrSet } from '../utils/cache.js';

const router = Router();

const STATS_TTL = 60;

router.get('/', async (req, res) => {
  try {
    const data = await cacheGetOrSet(
      'stats:global',
      async () => {
        const [playersCount, propertiesCount, citiesCount, transactionsCount] = await Promise.all([
          User.countDocuments(),
          Property.countDocuments(),
          City.countDocuments(),
          Transaction.countDocuments(),
        ]);

        const topPlayers = await User.aggregate([
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

        return { playersCount, propertiesCount, citiesCount, transactionsCount, topPlayers, recentActivity };
      },
      STATS_TTL,
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
