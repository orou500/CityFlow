import { Router } from 'express';
import City from '../models/City.js';
import Property from '../models/Property.js';
import Event from '../models/Event.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const cities = await City.find();
    res.json(cities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) return res.status(404).json({ error: 'City not found' });
    const properties = await Property.find({ cityId: city._id }).populate('ownerId', 'username');
    const activeEvents = await Event.find({
      _id: { $in: city.activeEvents.map(e => e.eventId) },
      active: true,
    });
    res.json({ city, properties, activeEvents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
