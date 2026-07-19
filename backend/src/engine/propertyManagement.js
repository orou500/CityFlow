import Property from '../models/Property.js';
import User from '../models/User.js';
import {
  calculateMonthlyProfit,
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

  const cityCache = new Map();

  for (const property of properties) {
    try {
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

      const unitCount = property.units?.length || 1;
      const perUnitRent = property.rentPerUnit || property.rent / Math.max(1, unitCount);
      const actualRentIncome = Math.round(perUnitRent * unitCount * (newOccupancy / 100));

      const profit = calculateMonthlyProfit(actualRentIncome, property.maintenanceLevel, property.currentPrice);

      property.rent = actualRentIncome;

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

      if (profit.maintenanceCost > 0 && property.ownerId) {
        const owner = await User.findById(property.ownerId);
        if (owner) {
          owner.balance -= profit.maintenanceCost;
          if (owner.balance < 0) owner.balance = 0;
          await owner.save();
        }
      }
    } catch (err) {
      console.error(`Management processing error for property ${property._id}:`, err.message);
    }
  }
}
