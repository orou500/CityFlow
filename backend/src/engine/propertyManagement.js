import Property from '../models/Property.js';
import User from '../models/User.js';
import {
  calculateMonthlyProfit,
  calculatePropertyRentIncome,
  calculateQualityScore,
  simulateOccupancy,
  HISTORY_MAX_ENTRIES,
} from '../config/propertyManagement.js';
import { getInvestmentFactors } from './propertyValuation.js';

export async function processPropertyManagement(currentTick) {
  const properties = await Property.find({
    type: { $ne: 'land' },
    ownerId: { $ne: null },
  }).populate('cityId', 'demandIndex supplyIndex growthRate');

  const ownerIds = [...new Set(properties.map((p) => p.ownerId?.toString()).filter(Boolean))];
  let deletedOwnerIds = new Set();
  if (ownerIds.length > 0) {
    const ownerDocs = await User.find({ _id: { $in: ownerIds }, deletedAt: { $ne: null } })
      .select('_id')
      .lean();
    deletedOwnerIds = new Set(ownerDocs.map((u) => u._id.toString()));
  }

  const cityCache = new Map();

  for (const property of properties) {
    try {
      if (deletedOwnerIds.has(property.ownerId?.toString())) continue;
      const city = property.cityId;
      if (!city || typeof city === 'string') continue;

      if (!cityCache.has(city._id.toString())) {
        cityCache.set(city._id.toString(), city);
      }
      const cityData = cityCache.get(city._id.toString());

      const investmentFactors = getInvestmentFactors(property);
      property._investmentOccupancyBonus = investmentFactors.occupancyBonus;

      const newOccupancy = simulateOccupancy(property, cityData.demandIndex, cityData.supplyIndex);
      property.occupancy = newOccupancy;

      property.qualityScore = calculateQualityScore(property);

      // Effective income for display/history. property.rent is deliberately
      // NOT overwritten here — it stays the stable gross rent, so income never
      // compounds down tick after tick. Maintenance and operating expenses are
      // folded into the rent pool by processRent, so nothing is charged here.
      const actualRentIncome = calculatePropertyRentIncome(property);

      const profit = calculateMonthlyProfit(
        actualRentIncome,
        property.maintenanceLevel,
        property.currentPrice,
        property,
      );

      const historyEntry = {
        tick: currentTick,
        occupancy: newOccupancy,
        qualityScore: property.qualityScore,
        rentIncome: actualRentIncome,
        maintenanceCost: profit.maintenanceCost,
        netProfit: profit.netProfit,
      };

      if (!property.managementHistory) {
        property.managementHistory = [];
      }
      property.managementHistory.push(historyEntry);
      if (property.managementHistory.length > HISTORY_MAX_ENTRIES) {
        property.managementHistory = property.managementHistory.slice(-HISTORY_MAX_ENTRIES);
      }

      property.lastQualityTick = currentTick;

      await property.save();
    } catch (err) {
      console.error(`Management processing error for property ${property._id}:`, err.message);
    }
  }
}
