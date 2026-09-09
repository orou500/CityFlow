import { Router } from 'express';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { getTickNumber } from '../models/GameState.js';
import { authenticate } from '../middleware/auth.js';
import { PERSONAL_ASSISTANT } from '../config/personalAssistant.js';
import { createNotification } from '../utils/notificationQueue.js';
import { onAssistantChanged } from '../utils/cacheInvalidation.js';

const router = Router();

/**
 * Resolve the assistant's employment state for the requesting user.
 * Never reads anything client-provided; the server computes eligibility.
 */
export function resolveAssistantState(user, currentTick) {
  const pa = user?.personalAssistant || {};
  const status = pa.status || 'none';
  const active = status === 'active';
  const firedThisMonth = status === 'fired' && (pa.firedMonth ?? null) === currentTick;
  const canHire = !active && !firedThisMonth;
  const canFire = active;
  return {
    status,
    salary: active ? pa.salary || PERSONAL_ASSISTANT.salary : PERSONAL_ASSISTANT.salary,
    hiredAt: pa.hiredAt || null,
    hiredMonth: pa.hiredMonth ?? null,
    firedAt: pa.firedAt || null,
    firedMonth: pa.firedMonth ?? null,
    canHire,
    canFire,
    // Rental Income is unlocked exactly while the assistant is employed.
    rentalIncomeUnlocked: active,
  };
}

router.get('/status', authenticate, async (req, res) => {
  try {
    const currentTick = await getTickNumber();
    const user = await User.findById(req.user._id).select('personalAssistant balance').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(resolveAssistantState(user, currentTick));
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/hire', authenticate, async (req, res) => {
  try {
    const currentTick = await getTickNumber();
    const salary = PERSONAL_ASSISTANT.salary;

    // Atomic single-document transition: hire only succeeds when the user is
    // not currently employed AND was not fired this month AND can afford the
    // first month's salary (available balance guard). Concurrent/double-click
    // hires can never produce two assistants or two charges.
    const updated = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        $and: [
          { 'personalAssistant.status': { $ne: 'active' } },
          {
            $or: [
              { 'personalAssistant.status': 'none' },
              { 'personalAssistant.firedMonth': { $ne: currentTick } },
              { 'personalAssistant.firedMonth': null },
            ],
          },
          {
            $expr: {
              $gte: [{ $subtract: ['$balance', { $ifNull: ['$reservedAuctionFunds', 0] }] }, salary],
            },
          },
        ],
      },
      {
        $inc: { balance: -salary },
        $set: {
          'personalAssistant.status': 'active',
          'personalAssistant.hiredAt': new Date(),
          'personalAssistant.hiredMonth': currentTick,
          'personalAssistant.firedAt': null,
          'personalAssistant.firedMonth': null,
          'personalAssistant.salary': salary,
          'personalAssistant.paidThroughMonth': currentTick, // first month prepaid
        },
      },
      { new: true },
    );

    if (!updated) {
      const user = await User.findById(req.user._id).select('personalAssistant balance reservedAuctionFunds').lean();
      const pa = user?.personalAssistant || {};
      if (pa.status === 'active') {
        return res.status(400).json({ error: 'You already employ a Personal Assistant' });
      }
      if (pa.status === 'fired' && pa.firedMonth === currentTick) {
        return res.status(400).json({ error: 'You cannot hire a Personal Assistant again until next month' });
      }
      return res.status(400).json({ error: 'Insufficient funds to hire a Personal Assistant' });
    }

    await Transaction.create({
      buyerId: req.user._id,
      price: salary,
      type: PERSONAL_ASSISTANT.salaryTransactionType,
    }).catch((err) => {
      console.error(`[ASSISTANT] Failed to record hire salary transaction for ${req.user._id}:`, err.message);
    });

    await createNotification({
      userId: req.user._id,
      type: 'system',
      title: 'Personal Assistant Hired',
      message: `Your Personal Assistant started today. Salary: $${salary.toLocaleString()}/month. Rental Income is now unlocked.`,
      eventKey: `assistant:${req.user._id}:hired:${currentTick}`,
      route: '/dashboard',
      entityType: 'dashboard',
      global: false,
    }).catch(() => {});

    await onAssistantChanged(req.user._id).catch(() => {});
    res.json(resolveAssistantState(updated, currentTick));
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/fire', authenticate, async (req, res) => {
  try {
    const currentTick = await getTickNumber();

    // Atomic: only an ACTIVE assistant can be fired; concurrent fire requests
    // can never produce inconsistent state (one succeeds, the rest 400).
    const updated = await User.findOneAndUpdate(
      { _id: req.user._id, 'personalAssistant.status': 'active' },
      {
        $set: {
          'personalAssistant.status': 'fired',
          'personalAssistant.firedAt': new Date(),
          'personalAssistant.firedMonth': currentTick,
        },
      },
      { new: true },
    );

    if (!updated) {
      return res.status(400).json({ error: 'You do not currently employ a Personal Assistant' });
    }

    await createNotification({
      userId: req.user._id,
      type: 'system',
      title: 'Personal Assistant Fired',
      message:
        'Your Personal Assistant is no longer employed. Rental Income is now locked until you hire again next month.',
      eventKey: `assistant:${req.user._id}:fired:${currentTick}`,
      route: '/dashboard',
      entityType: 'dashboard',
      global: false,
    }).catch(() => {});

    await onAssistantChanged(req.user._id).catch(() => {});
    res.json(resolveAssistantState(updated, currentTick));
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
