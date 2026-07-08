import { Router } from 'express';
import Event from '../models/Event.js';

const router = Router();

router.get('/active', async (req, res) => {
  try {
    const events = await Event.find({ active: true }).populate('affectedCities', 'name country coordinates population');
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
