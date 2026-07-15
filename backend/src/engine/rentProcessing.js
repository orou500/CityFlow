import Property from '../models/Property.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';

const RENT_STORAGE_DURATION_MS = 24 * 60 * 60 * 1000;

export async function processRent() {
  const properties = await Property.find({ ownerId: { $ne: null } })
    .populate('cityId')
    .lean();
  if (properties.length === 0) return [];

  const cityMap = new Map();
  for (const prop of properties) {
    if (prop.cityId && typeof prop.cityId === 'object' && !cityMap.has(prop.cityId._id?.toString())) {
      cityMap.set(prop.cityId._id.toString(), prop.cityId);
    }
  }

  const ownerIds = [...new Set(properties.map((p) => p.ownerId?.toString()).filter(Boolean))];
  const users = await User.find({ _id: { $in: ownerIds } }).lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const results = [];
  const propertyBulkOps = [];
  const rentPoolUpdates = [];
  const userLifetimeUpdates = [];
  const transactions = [];

  for (const property of properties) {
    const owner = userMap.get(property.ownerId?.toString());
    if (!owner) continue;

    let rentIncome = property.rent || 0;
    let maintenanceCost = Math.round((property.currentPrice || 0) * 0.001);

    const city = cityMap.get(property.cityId?._id?.toString() || property.cityId?.toString());
    const demandIndex = city?.demandIndex || 1.0;
    const supplyIndex = city?.supplyIndex || 1.0;
    const rentModifier = Math.min(1.4, Math.max(0.6, 0.7 + 0.3 * (demandIndex / supplyIndex)));

    if (property.units && property.units.length > 0) {
      let tickOccupied = 0;
      let totalPotentialRent = 0;

      for (const unit of property.units) {
        const isOccupied = Math.random() < (property.occupancy || 0) / 100;
        totalPotentialRent += unit.rentPrice || 0;
        if (isOccupied) tickOccupied++;
      }

      const occupancyRate = property.units.length > 0 ? tickOccupied / property.units.length : 0;
      rentIncome = Math.round(totalPotentialRent * occupancyRate * rentModifier);
      maintenanceCost = property.maintenanceCost || Math.round((property.currentPrice || 0) * 0.001);

      const newOccupancy = Math.round(occupancyRate * 100);
      if (
        newOccupancy !== property.occupancy &&
        newOccupancy >= 0 &&
        newOccupancy <= 100 &&
        property.occupancy !== undefined
      ) {
        propertyBulkOps.push({
          updateOne: {
            filter: { _id: property._id },
            update: { $set: { occupancy: newOccupancy } },
          },
        });
      }

      if (rentIncome === 0 && totalPotentialRent > 0) {
        rentIncome = Math.round(totalPotentialRent * 0.3 * rentModifier);
      }
    } else {
      rentIncome = Math.round(rentIncome * rentModifier);
    }

    const netIncome = rentIncome - maintenanceCost;
    if (netIncome <= 0) {
      results.push({ propertyId: property._id, ownerId: owner._id, rentIncome, maintenanceCost, netIncome });
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

    transactions.push({
      propertyId: property._id,
      buyerId: owner._id,
      price: netIncome,
      type: 'rent',
    });

    results.push({ propertyId: property._id, ownerId: owner._id, rentIncome, maintenanceCost, netIncome });
  }

  if (propertyBulkOps.length > 0) {
    await Property.bulkWrite(propertyBulkOps);
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

  if (transactions.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      await Transaction.insertMany(transactions.slice(i, i + BATCH_SIZE));
    }
  }

  return results;
}

export async function expireUncollectedRent() {
  const expiryThreshold = new Date(Date.now() - RENT_STORAGE_DURATION_MS);
  const expired = await User.find({
    uncollectedRent: { $gt: 0 },
    rentStorageStartedAt: { $lte: expiryThreshold },
  }).select('_id username uncollectedRent rentStorageStartedAt');

  if (expired.length === 0) return 0;

  const ops = expired.map((u) => ({
    updateOne: {
      filter: { _id: u._id },
      update: { $set: { uncollectedRent: 0, rentStorageStartedAt: null } },
    },
  }));
  await User.bulkWrite(ops);

  const notifications = expired.map((u) => ({
    userId: u._id,
    type: 'system',
    title: 'Rent Expired',
    message: `You failed to collect $${u.uncollectedRent.toLocaleString()} in rent within 24 hours. The rent has been forfeited.`,
    global: false,
  }));
  await Notification.insertMany(notifications);

  console.log(`[RENT] Expired uncollected rent for ${expired.length} users`);
  return expired.length;
}

export async function sendRentExpiryWarnings() {
  const warningThreshold = new Date(Date.now() - (RENT_STORAGE_DURATION_MS * 5) / 6);
  const expiryThreshold = new Date(Date.now() - RENT_STORAGE_DURATION_MS);

  const users = await User.find({
    uncollectedRent: { $gt: 0 },
    rentStorageStartedAt: { $lte: warningThreshold, $gt: expiryThreshold },
  }).select('_id username uncollectedRent rentStorageStartedAt');

  if (users.length === 0) return 0;

  const existingNotifications = await Notification.find({
    userId: { $in: users.map((u) => u._id) },
    type: 'system',
    title: 'Rent Collection Warning',
  }).select('userId');

  const warnedUserIds = new Set(existingNotifications.map((n) => n.userId.toString()));
  const toWarn = users.filter((u) => !warnedUserIds.has(u._id.toString()));

  if (toWarn.length === 0) return 0;

  const notifications = toWarn.map((u) => ({
    userId: u._id,
    type: 'system',
    title: 'Rent Collection Warning',
    message: `You have $${u.uncollectedRent.toLocaleString()} in uncollected rent. Collect it within the next hour or it will be forfeited!`,
    global: false,
  }));
  await Notification.insertMany(notifications);

  console.log(`[RENT] Sent rent expiry warnings to ${toWarn.length} users`);
  return toWarn.length;
}
