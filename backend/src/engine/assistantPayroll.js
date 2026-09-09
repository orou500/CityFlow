import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { PERSONAL_ASSISTANT } from '../config/personalAssistant.js';
import { createNotification } from '../utils/notificationQueue.js';

const BATCH_SIZE = 500;

/**
 * Monthly payroll for active Personal Assistants.
 *
 * Runs once per tick from the tick engine. The assistant's first month is
 * prepaid at hire (paidThroughMonth = hire month); every later tick charges
 * the salary exactly once per month for still-active assistants.
 *
 * Idempotency: the atomic update carries `paidThroughMonth: { $lt: tick }`,
 * so a retried or re-run tick can never charge the same month twice.
 *
 * Insufficient funds: mirroring the company payroll convention (layoffs on
 * empty treasury), the assistant is fired immediately — no partial state, no
 * debt accumulation, and no future salary obligations.
 */
export async function processPersonalAssistantPayroll(tickNumber) {
  const users = await User.find({ 'personalAssistant.status': 'active' }).select('_id personalAssistant');

  const results = [];
  const ops = [];
  for (const u of users) {
    const pa = u.personalAssistant || {};
    if (!pa || (pa.paidThroughMonth || 0) >= tickNumber) continue;
    const salary = pa.salary || PERSONAL_ASSISTANT.salary;
    if (salary <= 0) continue;

    // Atomic debit + month stamp. Fails when already paid, no longer active,
    // or the available balance cannot cover the salary.
    const paid = await User.findOneAndUpdate(
      {
        _id: u._id,
        'personalAssistant.status': 'active',
        'personalAssistant.paidThroughMonth': { $lt: tickNumber },
        $expr: {
          $gte: [{ $subtract: ['$balance', { $ifNull: ['$reservedAuctionFunds', 0] }] }, salary],
        },
      },
      {
        $inc: { balance: -salary },
        $set: { 'personalAssistant.paidThroughMonth': tickNumber },
      },
      { new: true },
    );

    if (!paid) {
      // Race guard: another worker may have already processed this month.
      const current = await User.findById(u._id).select('personalAssistant').lean();
      if (!current || current.personalAssistant?.paidThroughMonth >= tickNumber) continue;

      // Insufficient funds → immediate termination (company payroll analog).
      await User.updateOne(
        { _id: u._id, 'personalAssistant.status': 'active' },
        {
          $set: {
            'personalAssistant.status': 'fired',
            'personalAssistant.firedAt': new Date(),
            'personalAssistant.firedMonth': tickNumber,
            'personalAssistant.paidThroughMonth': tickNumber,
          },
        },
      );
      await createNotification({
        userId: u._id,
        type: 'system',
        title: 'Personal Assistant Left',
        message:
          'Your Personal Assistant could not be paid this month and is no longer employed. Rental Income is locked until you hire again next month.',
        eventKey: `assistant:${u._id}:auto_fired:${tickNumber}`,
        route: '/dashboard',
        entityType: 'dashboard',
        global: false,
      }).catch(() => {});
      results.push({ userId: u._id, paid: 0, autoFired: true, tickNumber });
      continue;
    }

    ops.push({ userId: u._id, salary, tickNumber });
    results.push({ userId: u._id, paid: salary, tickNumber });
  }

  if (ops.length > 0) {
    const txOps = ops.map((o) => ({
      insertOne: {
        document: {
          buyerId: o.userId,
          price: o.salary,
          type: PERSONAL_ASSISTANT.salaryTransactionType,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    }));
    for (let i = 0; i < txOps.length; i += BATCH_SIZE) {
      await Transaction.bulkWrite(txOps.slice(i, i + BATCH_SIZE), { ordered: false }).catch((err) => {
        console.error('[ASSISTANT] Payroll ledger write failed:', err.message);
      });
    }

    await Promise.all(
      ops.map((o) =>
        createNotification({
          userId: o.userId,
          type: 'system',
          title: 'Personal Assistant Salary Paid',
          message: `Your Personal Assistant was paid $${o.salary.toLocaleString()} for this month.`,
          eventKey: `assistant:${o.userId}:salary:${o.tickNumber}`,
          route: '/dashboard',
          entityType: 'dashboard',
          global: false,
        }).catch(() => {}),
      ),
    );
  }

  return results;
}
