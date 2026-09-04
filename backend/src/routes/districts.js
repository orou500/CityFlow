import { Router } from 'express';
import District from '../models/District.js';
import Property from '../models/Property.js';
import { optionalAuth } from '../middleware/auth.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { cacheKeys, cacheTTL } from '../utils/cacheKeys.js';
import { recordVisit } from '../utils/visitTracking.js';
import { resolveCurrentUsers } from '../utils/userIdentity.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { cityId } = req.query;
    const filter = cityId ? { cityId } : {};
    const districts = await cacheGetOrSet(
      cityId ? cacheKeys.districtByCity(cityId) : cacheKeys.districtByCity('all'),
      async () => District.find(filter).populate('cityId', 'name country').sort({ avgPrice: -1 }),
      cacheTTL.standard,
    );
    res.json(districts);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/leaderboard/top', async (req, res) => {
  try {
    const { cityId, sortBy } = req.query;
    const filter = cityId ? { cityId } : {};
    const sortField = sortBy === 'demand' ? 'demandIndex' : sortBy === 'growth' ? 'growthRate' : 'avgPrice';
    const districts = await District.find(filter)
      .populate('cityId', 'name country')
      .sort({ [sortField]: -1 })
      .limit(20);
    res.json(districts);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/city/:cityId', async (req, res) => {
  try {
    const districts = await cacheGetOrSet(
      cacheKeys.districtByCity(req.params.cityId),
      async () =>
        District.find({ cityId: req.params.cityId }).populate('cityId', 'name country').sort({ avgPrice: -1 }),
      cacheTTL.standard,
    );
    res.json(districts);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const district = await cacheGetOrSet(
      cacheKeys.district(req.params.id),
      async () => District.findById(req.params.id).populate('cityId', 'name country coordinates'),
      cacheTTL.standard,
    );
    if (!district) return res.status(404).json({ error: 'District not found' });

    const topInvestors = await resolveCurrentUsers(
      district.influence.slice(0, 10).map((inf) => ({
        ...(typeof inf.toObject === 'function' ? inf.toObject() : inf),
        userId: inf.userId?.toString?.() || inf.userId,
      })),
      'userId',
    );

    const properties = await Property.find({ districtId: district._id })
      .select('name type currentPrice rent forSale condition occupancy ownerId companyId')
      .populate('ownerId', 'username displayName')
      .sort({ currentPrice: -1 })
      .limit(50);

    const propertyCount = await Property.countDocuments({ districtId: district._id });
    const stats = await Property.aggregate([
      { $match: { districtId: district._id } },
      {
        $group: {
          _id: null,
          totalValue: { $sum: '$currentPrice' },
          avgRent: { $avg: '$rent' },
          avgOccupancy: { $avg: '$occupancy' },
          forSaleCount: { $sum: { $cond: ['$forSale', 1, 0] } },
          ownedCount: { $sum: { $cond: [{ $ne: ['$ownerId', null] }, 1, 0] } },
          companyOwnedCount: { $sum: { $cond: [{ $ne: ['$companyId', null] }, 1, 0] } },
        },
      },
    ]);

    const districtStats = stats[0] || {
      totalValue: 0,
      avgRent: 0,
      avgOccupancy: 0,
      forSaleCount: 0,
      ownedCount: 0,
      companyOwnedCount: 0,
    };

    if (req.user) recordVisit(req.user._id, 'district', district._id);

    res.json({
      district,
      topInvestors,
      recentProperties: properties,
      stats: {
        ...districtStats,
        propertyCount,
        occupancyRate: propertyCount > 0 ? Math.round(districtStats.avgOccupancy || 0) : 0,
      },
    });
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const district = await cacheGetOrSet(
      cacheKeys.districtHistory(req.params.id),
      async () => District.findById(req.params.id).select('history name'),
      cacheTTL.standard,
    );
    if (!district) return res.status(404).json({ error: 'District not found' });

    res.json({ history: district.history, name: district.name });
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/:id/influence', async (req, res) => {
  try {
    const district = await District.findById(req.params.id).select('name influence totalInfluencePoints');
    if (!district) return res.status(404).json({ error: 'District not found' });

    const enriched = await resolveCurrentUsers(
      district.influence.map((inf) => ({
        ...(typeof inf.toObject === 'function' ? inf.toObject() : inf),
        userId: inf.userId?.toString?.() || inf.userId,
      })),
      'userId',
    );

    res.json({
      districtName: district.name,
      totalInfluencePoints: district.totalInfluencePoints,
      rankings: enriched,
    });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
