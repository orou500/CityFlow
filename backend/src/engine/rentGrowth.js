import Property from '../models/Property.js';
import { calculateMonthlyRentGrowth, RENT_SYSTEM } from '../config/propertyManagement.js';

const BATCH_SIZE = 500;

/**
 * Applies one month of rent growth per property. Runs once per tick (1 tick =
 * 1 in-game month). Guarded by lastRentGrowthTick so re-runs, server restarts
 * or multiple ticks in the same month can never grow rent more than once.
 */
export async function processRentGrowth(tickNumber) {
  const properties = await Property.find({
    $or: [{ type: { $ne: 'land' } }, { type: 'land', developmentLevel: { $gt: 0 } }],
  })
    .populate('cityId', 'demandIndex supplyIndex economicCondition')
    .lean();

  if (properties.length === 0) return [];

  const ops = [];
  const results = [];

  for (const property of properties) {
    if (property.lastRentGrowthTick === tickNumber) continue;

    // Skip properties with no rent baseline and no units (e.g. undeveloped land).
    if ((property.rent || 0) <= 0 && (!property.units || property.units.length === 0)) continue;

    const city = property.cityId && typeof property.cityId === 'object' ? property.cityId : null;
    const growth = calculateMonthlyRentGrowth(property, city);

    const rentHistory = [...(property.rentHistory || []), { tick: tickNumber, rent: growth.newRent, potential: growth.rentPotential }].slice(
      -RENT_SYSTEM.RENT_HISTORY_MAX_ENTRIES,
    );

    ops.push({
      updateOne: {
        filter: { _id: property._id },
        update: {
          $set: {
            rent: growth.newRent,
            rentPotential: growth.rentPotential,
            previousMonthRent: growth.previousMonthRent,
            lastRentGrowthTick: tickNumber,
            rentHistory,
          },
        },
      },
    });

    results.push({
      propertyId: property._id,
      tick: tickNumber,
      previousMonthRent: growth.previousMonthRent,
      rent: growth.newRent,
      rentPotential: growth.rentPotential,
      increase: growth.increase,
      increasePct: growth.increasePct,
      growthRate: growth.growthRate,
      isLegacyFirstMonth: growth.isLegacyFirstMonth,
    });
  }

  if (ops.length > 0) {
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      await Property.bulkWrite(ops.slice(i, i + BATCH_SIZE));
    }
  }

  return results;
}
