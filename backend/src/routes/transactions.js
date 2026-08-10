import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/user/:id', authenticate, async (req, res) => {
  try {
    const txFilter = { $or: [{ buyerId: req.params.id }, { sellerId: req.params.id }] };
    const user = await User.findById(req.params.id).select('companyId').lean();
    if (user?.companyId) {
      txFilter.$or.push({ companyId: user.companyId });
    }
    const transactions = await Transaction.find(txFilter).sort({ createdAt: -1 }).limit(100).populate('propertyId');
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
