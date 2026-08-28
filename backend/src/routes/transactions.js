import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/user/:id', authenticate, async (req, res) => {
  try {
    // IDOR guard: players may only read their own ledger (incl. their own
    // company's transactions). Another user's id never reveals whether a
    // history exists.
    if (req.params.id !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const txFilter = { $or: [{ buyerId: req.params.id }, { sellerId: req.params.id }] };
    const user = await User.findById(req.params.id).select('companyId').lean();
    if (user?.companyId) {
      txFilter.$or.push({ companyId: user.companyId });
    }
    const transactions = await Transaction.find(txFilter).sort({ createdAt: -1 }).limit(100).populate('propertyId');
    res.json(transactions);
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
