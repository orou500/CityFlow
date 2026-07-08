import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/user/:id', authenticate, async (req, res) => {
  try {
    const transactions = await Transaction.find({
      $or: [{ buyerId: req.params.id }, { sellerId: req.params.id }],
    }).sort({ createdAt: -1 }).limit(100).populate('propertyId');
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
