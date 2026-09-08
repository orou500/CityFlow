import 'dotenv/config';
import mongoose from 'mongoose';
import Property from '../src/models/Property.js';
import City from '../src/models/City.js';
import GameState from '../src/models/GameState.js';
import {
  RENT_SYSTEM,
  RENT_BOUNDS,
  calculateMaximumRent,
  calculateRentPotential,
} from '../src/config/propertyManagement.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';
const propertyId = process.argv[2];

if (!propertyId) {
  console.error('Usage: node scripts/auditPropertyRentCap.js <propertyId>');
  process.exit(1);
}

/**
 * READ-ONLY diagnostic for the rent-cap investigation.
 * Prints every value in the maximum-rent calculation chain with live data.
 * Never writes to the database.
 */
async function main() {
  await mongoose.connect(MONGODB_URI);

  const property = await Property.findById(propertyId).populate(
    'cityId',
    'name demandIndex supplyIndex economicCondition',
  );
  if (!property) {
    console.error(`Property not found: ${propertyId}`);
    process.exit(1);
  }

  const gameState = await GameState.findOne({ key: 'global' });

  const unitCount = property.units?.length || 1;
  const marketRate = unitCount > 0 ? property.rent / unitCount : 0;
  const maximumRent = calculateMaximumRent(property);
  const maximumRentPerUnit = unitCount > 0 ? Math.floor(maximumRent / unitCount) : maximumRent;
  const currentMaxPerUnit = marketRate > 0 ? Math.round(marketRate * RENT_BOUNDS.maxMultiplier) : maximumRentPerUnit;
  const grandfathered = Math.max(property.maxValidatedRentPerUnit || 0, property.rentPerUnit || 0);
  const effectiveMaxPerUnit = Math.min(currentMaxPerUnit, maximumRentPerUnit);
  const minPerUnit = marketRate > 0 ? Math.round(marketRate * RENT_BOUNDS.minMultiplier) : 0;

  const valueUsedByCap = Math.max(0, Number(property.currentPrice) || Number(property.basePrice) || 0);

  const rawPotential = calculateRentPotential(property, property.cityId);

  const rows = [
    ['Property id', property._id.toString()],
    ['Property name', property.name],
    ['Property type', property.type],
    ['Building type', property.buildingType || '(none)'],
    ['developmentLevel', property.developmentLevel],
    ['basePrice', property.basePrice],
    ['currentPrice', property.currentPrice],
    ['intrinsicValue', property.intrinsicValue || '(unset)'],
    ['lastPurchasePrice', property.lastPurchasePrice || '(unset)'],
    ['Value used by calculateMaximumRent()', valueUsedByCap],
    [
      'currentPrice || basePrice fallback active',
      property.currentPrice ? 'no (currentPrice used)' : 'yes (basePrice used)',
    ],
    ['Rent system yield (MAXIMUM_RENT_YIELD)', RENT_SYSTEM.MAXIMUM_RENT_YIELD],
    ['3% value cap (maximumRent, total)', maximumRent],
    ['maximumRentPerUnit (floor(cap/units))', maximumRentPerUnit],
    ['Unit count', unitCount],
    ['Current rent (total)', property.rent],
    ['rentPerUnit', property.rentPerUnit || 0],
    ['marketRate (rent/units)', marketRate],
    ['currentMaxPerUnit (round(marketRate x 2))', currentMaxPerUnit],
    ['grandfathered (maxValidatedRentPerUnit / rentPerUnit)', grandfathered],
    ['effectiveMaxPerUnit (min of the two ceilings)', effectiveMaxPerUnit],
    ['minPerUnit (round(marketRate x 0.5))', minPerUnit],
    ['rentPotential (capped by value cap)', rawPotential],
    ['currentTick', gameState?.tickNumber || 0],
    ['lastRentAdjustTick', property.lastRentAdjustTick || 0],
    ['lastRentGrowthTick', property.lastRentGrowthTick || 0],
    [
      'Rent change available',
      gameState
        ? gameState.tickNumber - (property.lastRentAdjustTick || 0) >= RENT_BOUNDS.rentChangeCooldownTicks
        : 'n/a',
    ],
    ['qualityScore', property.qualityScore],
    ['condition', property.condition],
    ['occupancy', property.occupancy],
    ['maintenanceLevel', property.maintenanceLevel],
    ['propertyRating', property.propertyRating || 'standard'],
    ['upgradeLevel', property.upgradeLevel || 0],
    ['grade', property.grade || 1],
    ['improvements count', property.improvements?.length || 0],
    [
      'invested capital (investmentHistory)',
      (property.investmentHistory || []).reduce((s, i) => s + (i.amount || 0), 0),
    ],
    [
      'units sample',
      JSON.stringify(
        (property.units || [])
          .slice(0, 3)
          .map((u) => ({ n: u.unitNumber, t: u.type, r: u.rentPrice, occ: u.occupied })),
      ),
    ],
    ['unit rentPrice total', (property.units || []).reduce((s, u) => s + (u.rentPrice || 0), 0)],
    ['priceHistory last entry', property.priceHistory?.slice(-1)?.[0] || '(none)'],
    [
      'city',
      property.cityId
        ? `${property.cityId.name} (demand=${property.cityId.demandIndex}, supply=${property.cityId.supplyIndex}, econ=${property.cityId.economicCondition})`
        : '(unset)',
    ],
  ];

  console.log('\n=== READ-ONLY RENT-CAP DIAGNOSTIC ===');
  for (const [label, value] of rows) {
    console.log(`${label.padEnd(50)} ${value}`);
  }

  console.log('\n=== WHY THE UI SHOWS WHAT IT SHOWS ===');
  console.log(`"Maximum" card row  -> maximumRent (total)     = $${maximumRent.toLocaleString()}`);
  console.log(`Rent input max attr -> effectiveMaxPerUnit     = $${effectiveMaxPerUnit.toLocaleString()}`);
  console.log(`Hint under input    -> effectiveMaxPerUnit     = $${effectiveMaxPerUnit.toLocaleString()}`);
  console.log(`RentInfoPanel row   -> effectiveMaxPerUnit     = $${effectiveMaxPerUnit.toLocaleString()}`);
  console.log(
    `POST accepted range -> min $${minPerUnit.toLocaleString()} .. max $${effectiveMaxPerUnit.toLocaleString()}`,
  );
  console.log(
    `Binding ceiling: ${currentMaxPerUnit <= maximumRentPerUnit ? 'MARKET step-limit (2x current rent/unit)' : 'VALUE cap (3% of value)'}`,
  );
  if (currentMaxPerUnit < maximumRentPerUnit) {
    console.log(
      `Note: the market step-limit binds BELOW the value cap. The property's rent must grow toward ${Math.round((maximumRentPerUnit / 2) * 100) / 100}/unit before the value cap becomes reachable.`,
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
