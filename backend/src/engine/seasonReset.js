import Season from '../models/Season.js';
import GameState from '../models/GameState.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import Loan from '../models/Loan.js';
import PropertyOffer from '../models/PropertyOffer.js';
import Notification from '../models/Notification.js';
import ConstructionProject from '../models/ConstructionProject.js';
import Event from '../models/Event.js';

const CITIES_DATA = [
  {
    name: 'New York',
    country: 'USA',
    coordinates: { lat: 40.7128, lng: -74.006 },
    population: 8336817,
    growthRate: 0.008,
    demandIndex: 1.8,
    supplyIndex: 0.9,
    avgPrice: 750000,
    totalCapacity: 500000,
    developmentRate: 0.025,
  },
  {
    name: 'London',
    country: 'UK',
    coordinates: { lat: 51.5074, lng: -0.1278 },
    population: 8982000,
    growthRate: 0.01,
    demandIndex: 1.6,
    supplyIndex: 0.95,
    avgPrice: 550000,
    totalCapacity: 400000,
    developmentRate: 0.022,
  },
  {
    name: 'Tokyo',
    country: 'Japan',
    coordinates: { lat: 35.6762, lng: 139.6503 },
    population: 13960000,
    growthRate: 0.005,
    demandIndex: 1.4,
    supplyIndex: 1.1,
    avgPrice: 480000,
    totalCapacity: 600000,
    developmentRate: 0.018,
  },
  {
    name: 'Tel Aviv',
    country: 'Israel',
    coordinates: { lat: 32.0853, lng: 34.7818 },
    population: 460000,
    growthRate: 0.015,
    demandIndex: 1.7,
    supplyIndex: 0.7,
    avgPrice: 520000,
    totalCapacity: 80000,
    developmentRate: 0.03,
  },
  {
    name: 'Dubai',
    country: 'UAE',
    coordinates: { lat: 25.2048, lng: 55.2708 },
    population: 3331000,
    growthRate: 0.025,
    demandIndex: 1.5,
    supplyIndex: 1.2,
    avgPrice: 380000,
    totalCapacity: 200000,
    developmentRate: 0.035,
  },
  {
    name: 'Paris',
    country: 'France',
    coordinates: { lat: 48.8566, lng: 2.3522 },
    population: 2161000,
    growthRate: 0.006,
    demandIndex: 1.5,
    supplyIndex: 0.85,
    avgPrice: 620000,
    totalCapacity: 150000,
    developmentRate: 0.02,
  },
  {
    name: 'Sydney',
    country: 'Australia',
    coordinates: { lat: -33.8688, lng: 151.2093 },
    population: 5312000,
    growthRate: 0.012,
    demandIndex: 1.3,
    supplyIndex: 1.0,
    avgPrice: 450000,
    totalCapacity: 250000,
    developmentRate: 0.024,
  },
  {
    name: 'Singapore',
    country: 'Singapore',
    coordinates: { lat: 1.3521, lng: 103.8198 },
    population: 5686000,
    growthRate: 0.018,
    demandIndex: 1.6,
    supplyIndex: 0.8,
    avgPrice: 580000,
    totalCapacity: 200000,
    developmentRate: 0.028,
  },
  {
    name: 'Berlin',
    country: 'Germany',
    coordinates: { lat: 52.52, lng: 13.405 },
    population: 3645000,
    growthRate: 0.007,
    demandIndex: 1.2,
    supplyIndex: 1.1,
    avgPrice: 350000,
    totalCapacity: 200000,
    developmentRate: 0.018,
  },
  {
    name: 'Mumbai',
    country: 'India',
    coordinates: { lat: 19.076, lng: 72.8777 },
    population: 12478447,
    growthRate: 0.02,
    demandIndex: 1.4,
    supplyIndex: 1.3,
    avgPrice: 180000,
    totalCapacity: 400000,
    developmentRate: 0.032,
  },
  {
    name: 'Sao Paulo',
    country: 'Brazil',
    coordinates: { lat: -23.5505, lng: -46.6333 },
    population: 12330000,
    growthRate: 0.011,
    demandIndex: 1.1,
    supplyIndex: 1.2,
    avgPrice: 150000,
    totalCapacity: 350000,
    developmentRate: 0.026,
  },
  {
    name: 'Toronto',
    country: 'Canada',
    coordinates: { lat: 43.6532, lng: -79.3832 },
    population: 2731000,
    growthRate: 0.014,
    demandIndex: 1.3,
    supplyIndex: 0.9,
    avgPrice: 420000,
    totalCapacity: 150000,
    developmentRate: 0.024,
  },
  {
    name: 'Hong Kong',
    country: 'China',
    coordinates: { lat: 22.3193, lng: 114.1694 },
    population: 7482000,
    growthRate: 0.004,
    demandIndex: 1.7,
    supplyIndex: 0.6,
    avgPrice: 850000,
    totalCapacity: 200000,
    developmentRate: 0.015,
  },
  {
    name: 'Barcelona',
    country: 'Spain',
    coordinates: { lat: 41.3874, lng: 2.1686 },
    population: 1620000,
    growthRate: 0.009,
    demandIndex: 1.2,
    supplyIndex: 1.0,
    avgPrice: 290000,
    totalCapacity: 120000,
    developmentRate: 0.02,
  },
  {
    name: 'Amsterdam',
    country: 'Netherlands',
    coordinates: { lat: 52.3676, lng: 4.9041 },
    population: 872000,
    growthRate: 0.013,
    demandIndex: 1.4,
    supplyIndex: 0.8,
    avgPrice: 460000,
    totalCapacity: 80000,
    developmentRate: 0.025,
  },
  {
    name: 'Seoul',
    country: 'South Korea',
    coordinates: { lat: 37.5665, lng: 126.978 },
    population: 9776000,
    growthRate: 0.006,
    demandIndex: 1.3,
    supplyIndex: 1.0,
    avgPrice: 390000,
    totalCapacity: 350000,
    developmentRate: 0.02,
  },
  {
    name: 'Los Angeles',
    country: 'USA',
    coordinates: { lat: 34.0522, lng: -118.2437 },
    population: 3898747,
    growthRate: 0.009,
    demandIndex: 1.4,
    supplyIndex: 1.1,
    avgPrice: 580000,
    totalCapacity: 250000,
    developmentRate: 0.022,
  },
  {
    name: 'Istanbul',
    country: 'Turkey',
    coordinates: { lat: 41.0082, lng: 28.9784 },
    population: 15460000,
    growthRate: 0.016,
    demandIndex: 1.2,
    supplyIndex: 1.0,
    avgPrice: 120000,
    totalCapacity: 500000,
    developmentRate: 0.03,
  },
];

const PROPERTY_TYPES = ['apartment', 'house', 'commercial', 'land'];
const PROPERTY_NAMES = [
  'Sunset Tower',
  'Harbor View',
  'Central Plaza',
  'Royal Manor',
  'Sky Residence',
  'Ocean Breeze',
  'City Heights',
  'Golden Gate',
  'Silver Lake',
  'Pinewood Estate',
  'Metro Loft',
  'Garden Villa',
  'Urban Nest',
  'Crystal Tower',
  'Heritage Home',
  'Park Avenue',
  'Riverside Flat',
  'Downtown Hub',
  'Elite Suite',
  'Grand Terrace',
];

export async function getCurrentSeason() {
  return Season.findOne({ status: 'active' });
}

export async function getActiveSeasonId() {
  const state = await GameState.findOne({ key: 'global' });
  return state?.seasonId || null;
}

export async function archiveSeason(seasonId) {
  const season = await Season.findById(seasonId);
  if (!season || season.status !== 'active') {
    throw new Error('No active season to archive');
  }

  const [playerRankings, cityStats, totalTransactions, totalVolume, totalPlayers] = await Promise.all([
    User.aggregate([
      { $lookup: { from: 'properties', localField: '_id', foreignField: 'ownerId', as: 'props' } },
      { $addFields: { portfolioValue: { $sum: '$props.currentPrice' }, propertiesOwned: { $size: '$props' } } },
      { $addFields: { netWorth: { $add: ['$balance', '$portfolioValue'] } } },
      { $sort: { netWorth: -1 } },
      { $limit: 100 },
      {
        $project: {
          userId: '$_id',
          username: 1,
          displayName: 1,
          netWorth: 1,
          balance: 1,
          portfolioValue: 1,
          propertiesOwned: 1,
        },
      },
    ]),
    City.find()
      .select('name demandIndex supplyIndex avgPrice propertyCount population')
      .lean()
      .then((cities) =>
        cities.map((c, i) => ({
          cityId: c._id,
          name: c.name,
          finalAvgPrice: c.avgPrice,
          finalDemandIndex: c.demandIndex,
          finalSupplyIndex: c.supplyIndex,
          propertyCount: c.propertyCount,
          population: c.population,
          rank: i + 1,
        })),
      ),
    Transaction.countDocuments(),
    Transaction.aggregate([{ $group: { _id: null, total: { $sum: '$price' } } }]),
    User.countDocuments(),
  ]);

  const totalVolumeValue = totalVolume.length > 0 ? totalVolume[0].total : 0;
  const totalCash = await User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
  const totalCashValue = totalCash.length > 0 ? totalCash[0].total : 0;
  const totalProperties = await Property.countDocuments();
  const totalActiveLoans = await Loan.countDocuments({ active: true });
  const totalConstruction = await ConstructionProject.countDocuments({ status: 'under_construction' });

  const gameState = await GameState.findOne({ key: 'global' });
  const tickCount = gameState ? gameState.tickNumber : 0;

  const winner = playerRankings.length > 0 ? playerRankings[0] : null;

  const playerRankingsWithRank = playerRankings.map((p, i) => ({ ...p, rank: i + 1 }));

  season.archive = {
    playerRankings: playerRankingsWithRank,
    cityStatistics: cityStats,
    marketStatistics: {
      totalTransactions,
      totalVolume: totalVolumeValue,
      totalPropertiesTraded: totalTransactions,
      avgPropertyPrice: totalProperties > 0 ? Math.round(totalVolumeValue / Math.max(totalTransactions, 1)) : 0,
    },
    economicStatistics: {
      totalCashInCirculation: totalCashValue,
      totalProperties,
      totalActiveLoans,
      totalConstructionProjects: totalConstruction,
      tickCount,
    },
    winner: winner ? winner.userId : null,
    totalPlayers,
    totalTransactions,
    summary: `Season ${season.number} lasted ${tickCount} months with ${totalPlayers} players.`,
  };

  season.endDate = new Date();
  season.status = 'completed';
  await season.save();

  console.log(`[SEASON] Archived season ${season.number}: ${totalPlayers} players, ${totalTransactions} transactions`);

  return season;
}

export async function resetWorld() {
  console.log('[SEASON] Resetting world...');

  const activeLoans = await Loan.find({ active: true }).lean();
  if (activeLoans.length > 0) {
    const loanBulkOps = [];
    for (const loan of activeLoans) {
      if (loan.remainingBalance > 0) {
        loanBulkOps.push({
          updateOne: {
            filter: { _id: loan.userId },
            update: { $inc: { balance: -loan.remainingBalance } },
          },
        });
      }
    }
    if (loanBulkOps.length > 0) {
      await User.bulkWrite(loanBulkOps);
    }
    console.log(`[SEASON] Deducted outstanding loan balances from ${loanBulkOps.length} users`);
  }

  await User.updateMany({}, { $inc: { balance: 100000, 'lifetimeStats.totalSeasonsCompleted': 1 } });

  await Promise.all([
    User.updateMany({}, { $set: { ownedProperties: [] } }),
    Property.deleteMany({}),
    Transaction.deleteMany({}),
    Loan.deleteMany({}),
    PropertyOffer.deleteMany({}),
    Notification.deleteMany({ type: { $ne: 'system' } }),
    ConstructionProject.deleteMany({}),
    Event.deleteMany({}),
    City.deleteMany({}),
  ]);

  console.log('[SEASON] Cleared all game data');

  const cities = await City.insertMany(CITIES_DATA);
  console.log(`[SEASON] Created ${cities.length} fresh cities`);

  const propertiesToInsert = [];
  for (const city of cities) {
    const numProperties = 10 + Math.floor(Math.random() * 11);
    for (let i = 0; i < numProperties; i++) {
      const nameIndex = Math.floor(Math.random() * PROPERTY_NAMES.length);
      const baseP = city.avgPrice * (0.6 + Math.random() * 0.8);
      const type = PROPERTY_TYPES[Math.floor(Math.random() * PROPERTY_TYPES.length)];

      propertiesToInsert.push({
        cityId: city._id,
        ownerId: null,
        type,
        name: `${PROPERTY_NAMES[nameIndex]} - ${city.name}`,
        basePrice: Math.round(baseP),
        currentPrice: Math.round(baseP),
        rent: Math.round(baseP * 0.004),
        volatility: 0.05 + Math.random() * 0.15,
        forSale: true,
        ...(type === 'land'
          ? {
              size: [2000, 3000, 4000, 5000, 6000, 7500, 8000, 10000][Math.floor(Math.random() * 8)],
              developmentLevel: 0,
            }
          : {}),
      });
    }
  }

  const inserted = await Property.insertMany(propertiesToInsert);
  console.log(`[SEASON] Created ${inserted.length} bank-owned properties`);

  for (const city of cities) {
    const count = inserted.filter((p) => p.cityId.toString() === city._id.toString()).length;
    await City.findByIdAndUpdate(city._id, { propertyCount: count });
  }

  await GameState.findOneAndUpdate(
    { key: 'global' },
    { $set: { tickNumber: 0, lastTickAt: null, tickLock: null, tickLockedAt: null } },
    { upsert: true },
  );

  console.log('[SEASON] GameState reset to tick 0');
}

export async function createNewSeason() {
  const lastSeason = await Season.findOne().sort({ number: -1 });
  const nextNumber = lastSeason ? lastSeason.number + 1 : 1;

  const season = await Season.create({
    number: nextNumber,
    name: `Season ${nextNumber}`,
    status: 'active',
    startDate: new Date(),
  });

  await GameState.findOneAndUpdate({ key: 'global' }, { $set: { seasonId: season._id } }, { upsert: true });

  console.log(`[SEASON] Created season ${nextNumber}`);

  return season;
}

export async function endCurrentSeasonAndStartNew() {
  const activeSeason = await getCurrentSeason();

  if (activeSeason) {
    await archiveSeason(activeSeason._id);
  }

  await resetWorld();

  const newSeason = await createNewSeason();

  console.log(`[SEASON] Season ${newSeason.number} started`);

  return newSeason;
}
