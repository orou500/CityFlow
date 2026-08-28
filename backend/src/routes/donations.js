import { Router } from 'express';
import Donation from '../models/Donation.js';
import User from '../models/User.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { createOrder, captureOrder, verifyOrder, isPayPalConfigured } from '../utils/paypal.js';

const router = Router();

router.get('/config', (req, res) => {
  res.json({
    enabled: isPayPalConfigured(),
    minDonation: 5,
    currency: 'USD',
  });
});

router.post('/create', authenticate, async (req, res) => {
  try {
    const { amount } = req.body;
    const numAmount = parseFloat(amount);

    if (!numAmount || numAmount < 5) {
      return res.status(400).json({ error: 'Minimum donation is $5 USD' });
    }

    if (!isPayPalConfigured()) {
      return res.status(503).json({ error: 'PayPal is not configured' });
    }

    const order = await createOrder(numAmount);
    const existing = await Donation.findOne({ paypalOrderId: order.id });
    if (existing) {
      return res.status(400).json({ error: 'Duplicate order' });
    }

    await Donation.create({
      userId: req.user._id,
      amount: numAmount,
      paypalOrderId: order.id,
      status: 'pending',
    });

    res.json({ orderId: order.id, amount: numAmount });
  } catch (err) {
    console.error('[DONATIONS] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create donation' });
  }
});

router.post('/capture', authenticate, async (req, res) => {
  try {
    const { orderId, isAnonymous } = req.body;
    if (!orderId) return res.status(400).json({ error: 'Order ID required' });

    const donation = await Donation.findOne({ paypalOrderId: orderId, userId: req.user._id });
    if (!donation) return res.status(404).json({ error: 'Donation not found' });
    if (donation.status !== 'pending') {
      return res.status(400).json({ error: 'Donation already processed' });
    }

    const verification = await verifyOrder(orderId);
    if (!verification || verification.status !== 'APPROVED') {
      donation.status = 'failed';
      await donation.save();
      return res.status(400).json({ error: 'Payment not approved' });
    }

    const capture = await captureOrder(orderId);
    const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || capture.id;

    if (capture.status !== 'COMPLETED') {
      donation.status = 'failed';
      await donation.save();
      return res.status(400).json({ error: 'Payment capture failed' });
    }

    donation.status = 'completed';
    donation.paypalCaptureId = captureId;
    donation.isAnonymous = !!isAnonymous;
    donation.supporterSince = donation.supporterSince || new Date();
    await donation.save();

    const user = await User.findById(req.user._id);
    const totalDonated = (user.donationStats?.totalDonated || 0) + donation.amount;
    const donationCount = (user.donationStats?.donationCount || 0) + 1;

    let badge = 'supporter';
    if (totalDonated >= 100) badge = 'founding_supporter';
    else if (totalDonated >= 25) badge = 'early_supporter';

    let title = '';
    if (totalDonated >= 100) title = 'Founder Supporter';
    else if (totalDonated >= 50) title = 'CityFlow Patron';
    else if (totalDonated >= 25) title = 'Real Estate Backer';
    else title = 'Community Supporter';

    user.supporter = { badge, title, isAnonymous: !!isAnonymous };
    user.donationStats = { totalDonated, donorSince: user.donationStats?.donorSince || new Date(), donationCount };
    await user.save();

    res.json({
      success: true,
      donation: { amount: donation.amount, status: donation.status },
      supporter: { badge, title },
    });
  } catch (err) {
    console.error('[DONATIONS] Capture error:', err.message);
    res.status(500).json({ error: 'Failed to process donation' });
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const donations = await Donation.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('amount status paypalOrderId createdAt isAnonymous');

    res.json({ donations });
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/top-supporters', optionalAuth, async (req, res) => {
  try {
    const supporters = await User.find({
      'supporter.badge': { $ne: 'none' },
      'supporter.isAnonymous': false,
    })
      .sort({ 'donationStats.totalDonated': -1 })
      .limit(20)
      .select('username displayName avatar supporter donationStats.totalDonated donationStats.donorSince');

    const total = await getTotalDonations();

    res.json({
      supporters: supporters.map((s) => ({
        username: s.username,
        displayName: s.displayName,
        avatar: s.avatar,
        badge: s.supporter?.badge || 'supporter',
        title: s.supporter?.title || '',
        totalDonated: s.donationStats?.totalDonated || 0,
        supporterSince: s.donationStats?.donorSince,
      })),
      totalDonations: total,
    });
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/admin/stats', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const [totalResult, countResult, recentDonations, supporterCount] = await Promise.all([
      Donation.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Donation.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, count: { $sum: 1 } } }]),
      Donation.find().sort({ createdAt: -1 }).limit(50).populate('userId', 'username'),
      User.countDocuments({ 'supporter.badge': { $ne: 'none' } }),
    ]);

    res.json({
      totalDonated: totalResult[0]?.total || 0,
      totalDonations: countResult[0]?.count || 0,
      supporterCount,
      recentDonations: recentDonations.map((d) => ({
        username: d.userId?.username || 'Unknown',
        amount: d.amount,
        status: d.status,
        createdAt: d.createdAt,
        isAnonymous: d.isAnonymous,
      })),
    });
  } catch (err) {
    res.serverError(err);
  }
});

async function getTotalDonations() {
  const result = await Donation.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return result[0]?.total || 0;
}

export async function reconcilePendingDonations() {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const pending = await Donation.find({
    status: 'pending',
    createdAt: { $lt: cutoff },
  }).limit(20);

  if (!pending.length) return 0;

  let reconciled = 0;
  for (const donation of pending) {
    try {
      const order = await verifyOrder(donation.paypalOrderId);
      if (!order) continue;

      if (order.status === 'COMPLETED') {
        const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
        donation.status = 'completed';
        donation.paypalCaptureId = capture?.id;
        await donation.save();
        await updateUserSupporterTier(donation.userId, donation.amount, donation.isAnonymous);
        reconciled++;
      } else if (order.status === 'VOIDED' || order.status === 'PAYER_ACTION_REQUIRED') {
        donation.status = 'failed';
        await donation.save();
      }
    } catch (err) {
      console.error(`[DONATIONS] Reconciliation failed for ${donation.paypalOrderId}:`, err.message);
    }
  }

  if (reconciled > 0) {
    console.log(`[DONATIONS] Reconciled ${reconciled} pending donations`);
  }
  return reconciled;
}

async function updateUserSupporterTier(userId, donationAmount, isAnonymous) {
  const user = await User.findById(userId);
  if (!user) return;

  const totalDonated = (user.donationStats?.totalDonated || 0) + donationAmount;
  const donationCount = (user.donationStats?.donationCount || 0) + 1;

  let badge = 'supporter';
  if (totalDonated >= 100) badge = 'founding_supporter';
  else if (totalDonated >= 25) badge = 'early_supporter';

  let title;
  if (totalDonated >= 100) title = 'Founder Supporter';
  else if (totalDonated >= 50) title = 'CityFlow Patron';
  else if (totalDonated >= 25) title = 'Real Estate Backer';
  else title = 'Community Supporter';

  user.supporter = { badge, title, isAnonymous: !!isAnonymous };
  user.donationStats = { totalDonated, donorSince: user.donationStats?.donorSince || new Date(), donationCount };
  await user.save();
}

export default router;
