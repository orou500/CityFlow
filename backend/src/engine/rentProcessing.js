import Property from '../models/Property.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

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
  const userBalanceUpdates = [];
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

    userBalanceUpdates.push({
      userId: owner._id,
      amount: netIncome,
    });

    transactions.push({
      propertyId: property._id,
      buyerId: owner._id,
      price: netIncome,
      type: 'rent',
    });

    results.push({
      propertyId: property._id,
      ownerId: owner._id,
      rentIncome,
      maintenanceCost,
      netIncome,
    });
  }

  if (propertyBulkOps.length > 0) {
    await Property.bulkWrite(propertyBulkOps);
  }

  if (userBalanceUpdates.length > 0) {
    const userBulkOps = [];
    const groupedBalances = new Map();
    for (const update of userBalanceUpdates) {
      const key = update.userId.toString();
      groupedBalances.set(key, (groupedBalances.get(key) || 0) + update.amount);
    }
    for (const [userIdStr, totalAmount] of groupedBalances) {
      userBulkOps.push({
        updateOne: {
          filter: { _id: userIdStr },
          update: {
            $inc: {
              balance: totalAmount,
              'lifetimeStats.totalMoneyEarned': Math.max(0, totalAmount),
            },
          },
        },
      });
    }
    const BATCH_SIZE = 500;
    for (let i = 0; i < userBulkOps.length; i += BATCH_SIZE) {
      await User.bulkWrite(userBulkOps.slice(i, i + BATCH_SIZE));
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
