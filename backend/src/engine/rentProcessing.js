import Property from '../models/Property.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

export async function processRent() {
  const properties = await Property.find({ ownerId: { $ne: null } });
  const results = [];

  for (const property of properties) {
    const owner = await User.findById(property.ownerId);
    if (!owner) continue;

    let rentIncome = property.rent;
    let maintenanceCost = Math.round(property.currentPrice * 0.001);

    if (property.units && property.units.length > 0) {
      let tickOccupied = 0;
      let totalPotentialRent = 0;

      for (const unit of property.units) {
        const isOccupied = Math.random() < property.occupancy / 100;
        totalPotentialRent += unit.rentPrice;
        if (isOccupied) tickOccupied++;
      }

      const occupancyRate = property.units.length > 0 ? tickOccupied / property.units.length : 0;

      rentIncome = Math.round(totalPotentialRent * occupancyRate);
      maintenanceCost = property.maintenanceCost || Math.round(property.currentPrice * 0.001);

      const newOccupancy = Math.round(occupancyRate * 100);
      if (newOccupancy !== property.occupancy && newOccupancy >= 0 && newOccupancy <= 100) {
        property.occupancy = newOccupancy;
        await property.save();
      }

      if (rentIncome === 0 && totalPotentialRent > 0) {
        rentIncome = Math.round(totalPotentialRent * 0.3);
      }
    }

    const netIncome = rentIncome - maintenanceCost;

    owner.balance += netIncome;
    await owner.save();

    await Transaction.create({
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

  return results;
}
