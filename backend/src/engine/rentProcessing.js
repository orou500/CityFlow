import Property from '../models/Property.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { enqueueNotification, createNotification } from '../utils/notificationQueue.js';
import { onNotificationDeleted } from '../utils/cacheInvalidation.js';
import { calculatePropertyRentIncome, calculateMaintenanceCost, calculateOperatingExpenses } from '../config/propertyManagement.js';
import { MIN_RENT_READY_AMOUNT, RENT_READY_EVENT_KEY, PRIORITY } from '../config/notificationConfig.js';

const RENT_STORAGE_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Keep a single merged "rent ready to collect" notification per user.
 * Reruns upsert+merge on the same (user, eventKey) so the amount always
 * reflects the latest accrual and only ONE notification is ever shown.
 * Suppressed below MIN_RENT_READY_AMOUNT to avoid spam for tiny amounts.
 */
export async function ensureRentReadyNotification(userId, amount = 0) {
  const amountNum = Math.max(0, Number(amount) || 0);
  if (amountNum < MIN_RENT_READY_AMOUNT) return { created: false, notification: null, skipped: true };

  return createNotification(
    {
      userId,
      type: 'system',
      category: 'rent',
      title: 'Rent Ready to Collect',
      message: `You have $${amountNum.toLocaleString()} in uncollected rent. Collect it before it expires.`,
      eventKey: RENT_READY_EVENT_KEY(userId),
      route: '/dashboard',
      tab: 'rent',
      entityType: 'dashboard',
      global: false,
      // Always critical so preference gating never hides an expiring pool.
      priority: PRIORITY.CRITICAL,
    },
    { merge: true },
  );
}

/**
 * Remove the rent-ready notification once the pool is collected or forfeited.
 * Emits notification:deleted so open clients drop the record immediately.
 */
export async function clearRentReadyNotification(userId) {
  const userIdStr = userId?.toString?.() || userId;
  if (!userIdStr) return;

  const deleted = await Notification.findOneAndDelete({ userId: userIdStr, eventKey: RENT_READY_EVENT_KEY(userIdStr) });
  if (deleted) {
    await onNotificationDeleted(userIdStr, deleted._id.toString()).catch(() => {});
  }
}

export async function processRent() {
  const properties = await Property.find({ ownerId: { $ne: null }, companyId: null })
    .populate('cityId')
    .lean();
  if (properties.length === 0) return [];

  const ownerIds = [...new Set(properties.map((p) => p.ownerId?.toString()).filter(Boolean))];
  const users = await User.find({ _id: { $in: ownerIds } }).lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const results = [];
  const rentPoolUpdates = [];
  const userLifetimeUpdates = [];

  for (const property of properties) {
    const owner = userMap.get(property.ownerId?.toString());
    if (!owner) continue;

    // Effective occupancy-adjusted income — same formula used by
    // processPropertyManagement for display/history, so the accrued rent
    // always matches what the player sees.
    const rentIncome = calculatePropertyRentIncome(property);
    const maintenanceCost = calculateMaintenanceCost(property, rentIncome);
    const operatingExpenses = calculateOperatingExpenses(property, rentIncome);

    // Maintenance + operating expenses are folded INTO the rent pool (the
    // true net income), so the amount collected exactly matches the displayed
    // NET INCOME and nothing is deducted twice.
    const netIncome = Math.max(0, rentIncome - maintenanceCost - operatingExpenses);
    if (netIncome <= 0) {
      results.push({ propertyId: property._id, ownerId: owner._id, rentIncome, maintenanceCost, operatingExpenses, netIncome });
      continue;
    }

    rentPoolUpdates.push({
      userId: owner._id.toString(),
      amount: netIncome,
      setStorageStart: !owner.uncollectedRent && !owner.rentStorageStartedAt,
    });

    userLifetimeUpdates.push({
      userId: owner._id.toString(),
      earned: Math.max(0, netIncome),
    });

    results.push({ propertyId: property._id, ownerId: owner._id, rentIncome, maintenanceCost, operatingExpenses, netIncome });
  }

  if (rentPoolUpdates.length > 0) {
    const grouped = new Map();
    for (const update of rentPoolUpdates) {
      const existing = grouped.get(update.userId);
      if (existing) {
        existing.amount += update.amount;
      } else {
        grouped.set(update.userId, { ...update });
      }
    }

    const poolBulkOps = [];
    const now = new Date();
    for (const [userIdStr, { amount, setStorageStart }] of grouped) {
      const update = { $inc: { uncollectedRent: amount } };
      if (setStorageStart) {
        update.$set = { rentStorageStartedAt: now };
      }
      poolBulkOps.push({ updateOne: { filter: { _id: userIdStr }, update } });
    }
    await User.bulkWrite(poolBulkOps);

    // One merged "rent ready" notification per user whose pool crossed the
    // minimum threshold — never per property, never per tick.
    await Promise.all(
      [...grouped.entries()].map(([userIdStr, { amount }]) => {
        const user = userMap.get(userIdStr);
        const poolTotal = (user?.uncollectedRent || 0) + amount;
        return ensureRentReadyNotification(userIdStr, poolTotal);
      }),
    );
  }

  if (userLifetimeUpdates.length > 0) {
    const grouped = new Map();
    for (const u of userLifetimeUpdates) {
      grouped.set(u.userId, (grouped.get(u.userId) || 0) + u.earned);
    }
    const ops = [];
    for (const [userIdStr, earned] of grouped) {
      ops.push({
        updateOne: {
          filter: { _id: userIdStr },
          update: { $inc: { 'lifetimeStats.totalMoneyEarned': earned } },
        },
      });
    }
    const BATCH_SIZE = 500;
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      await User.bulkWrite(ops.slice(i, i + BATCH_SIZE));
    }
  }

  return results;
}

export async function expireUncollectedRent() {
  const expiryThreshold = new Date(Date.now() - RENT_STORAGE_DURATION_MS);
  const expired = await User.find({
    uncollectedRent: { $gt: 0 },
    rentStorageStartedAt: { $lte: expiryThreshold },
    deletedAt: null,
  }).select('_id username uncollectedRent rentStorageStartedAt');

  if (expired.length === 0) return 0;

  const ops = expired.map((u) => ({
    updateOne: {
      filter: { _id: u._id },
      update: { $set: { uncollectedRent: 0, rentStorageStartedAt: null } },
    },
  }));
  await User.bulkWrite(ops);

  // Remove the merged rent-ready notification — the pool is now forfeited.
  await Promise.all(expired.map((u) => clearRentReadyNotification(u._id)));

  await Promise.all(
    expired.map((u) =>
      enqueueNotification({
        userId: u._id,
        type: 'system',
        title: 'Rent Expired',
        message: `You failed to collect $${u.uncollectedRent.toLocaleString()} in rent within 24 hours. The rent has been forfeited.`,
        eventKey: `rent:expired:${u._id}:${(u.rentStorageStartedAt || new Date(0)).toISOString()}`,
        route: '/dashboard',
        entityType: 'dashboard',
        global: false,
      }),
    ),
  );

  console.log(`[RENT] Expired uncollected rent for ${expired.length} users`);
  return expired.length;
}

export async function sendRentExpiryWarnings() {
  const warningThreshold = new Date(Date.now() - (RENT_STORAGE_DURATION_MS * 5) / 6);
  const expiryThreshold = new Date(Date.now() - RENT_STORAGE_DURATION_MS);

  const users = await User.find({
    uncollectedRent: { $gt: 0 },
    rentStorageStartedAt: { $lte: warningThreshold, $gt: expiryThreshold },
    deletedAt: null,
  }).select('_id username uncollectedRent rentStorageStartedAt');

  if (users.length === 0) return 0;

  // Idempotency by eventKey prefix, not fragile title text — message wording
  // may drift between versions without ever creating duplicates.
  const existingNotifications = await Notification.find({
    userId: { $in: users.map((u) => u._id) },
    eventKey: { $regex: '^rent:warning:' },
  }).select('userId');

  const warnedUserIds = new Set(existingNotifications.map((n) => n.userId.toString()));
  const toWarn = users.filter((u) => !warnedUserIds.has(u._id.toString()));

  if (toWarn.length === 0) return 0;

  await Promise.all(
    toWarn.map((u) =>
      enqueueNotification({
        userId: u._id,
        type: 'system',
        category: 'rent',
        title: 'Rent Collection Warning',
        message: `You have $${u.uncollectedRent.toLocaleString()} in uncollected rent. Collect it within the next hour or it will be forfeited!`,
        eventKey: `rent:warning:${u._id}:${(u.rentStorageStartedAt || new Date(0)).toISOString()}`,
        route: '/dashboard',
        entityType: 'dashboard',
        global: false,
      }),
    ),
  );

  console.log(`[RENT] Sent rent expiry warnings to ${toWarn.length} users`);
  return toWarn.length;
}
