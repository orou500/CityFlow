import { Router } from 'express';
import City from '../models/City.js';
import Property from '../models/Property.js';
import Event from '../models/Event.js';
import { ECONOMIC_CONDITIONS } from '../config/demographics.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { cacheKeys, cacheTTL } from '../utils/cacheKeys.js';
import { optionalAuth } from '../middleware/auth.js';
import { recordVisit } from '../utils/visitTracking.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const cities = await cacheGetOrSet(cacheKeys.cities(), async () => City.find(), cacheTTL.standard);

    res.json(cities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const data = await cacheGetOrSet(
      cacheKeys.city(req.params.id),
      async () => {
        const city = await City.findById(req.params.id);
        if (!city) return null;

        const [properties, activeEvents] = await Promise.all([
          Property.find({ cityId: city._id }).populate('ownerId', 'username'),
          Event.find({
            _id: { $in: city.activeEvents.map((e) => e.eventId) },
            active: true,
          }),
        ]);

        const econ = ECONOMIC_CONDITIONS[city.economicCondition] || ECONOMIC_CONDITIONS.stable;

        return {
          city,
          properties,
          activeEvents,
          demographics: {
            population: city.population,
            economicCondition: city.economicCondition,
            economicLabel: econ.label,
            economicColor: econ.color,
            avgRent: city.avgRent,
            immigration: city.immigration,
            emigration: city.emigration,
            netMigration: city.immigration - city.emigration,
            demandIndex: city.demandIndex,
            supplyIndex: city.supplyIndex,
            growthRate: city.growthRate,
          },
        };
      },
      cacheTTL.medium,
    );

    if (!data) return res.status(404).json({ error: 'City not found' });
    if (req.user) recordVisit(req.user._id, 'city', data.city._id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) return res.status(404).json({ error: 'City not found' });
    const limit = Math.min(city.demographicsHistory?.length || 0, parseInt(req.query.limit) || 30);
    const history = city.demographicsHistory || [];
    res.json(history.slice(-limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
