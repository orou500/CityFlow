import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import User from '../src/models/User.js';
import Property from '../src/models/Property.js';
import Transaction from '../src/models/Transaction.js';

const AI_PLAYERS = [
  { username: 'AlexRealty', displayName: 'Alex Realty', level: 12, xp: 3400, balance: 850000, creditScore: 720, propsOwned: [8, 14], devLevels: [3, 1], occupancy: [85, 60] },
  { username: 'SophiaEstates', displayName: 'Sophia Estates', level: 15, xp: 5200, balance: 1200000, creditScore: 780, propsOwned: [22, 35, 48], devLevels: [5, 2, 4], occupancy: [90, 75, 80] },
  { username: 'MarcusCapital', displayName: 'Marcus Capital', level: 9, xp: 2100, balance: 520000, creditScore: 690, propsOwned: [5], devLevels: [2], occupancy: [70] },
  { username: 'PriyaProperties', displayName: 'Priya Properties', level: 18, xp: 7800, balance: 2100000, creditScore: 810, propsOwned: [60, 72, 85, 91], devLevels: [6, 4, 3, 5], occupancy: [95, 88, 72, 91] },
  { username: 'DevBuildCo', displayName: 'DevBuild Co', level: 11, xp: 3000, balance: 680000, creditScore: 710, propsOwned: [10, 28], devLevels: [4, 6], occupancy: [65, 82] },
  { username: 'YukiHomes', displayName: 'Yuki Homes', level: 7, xp: 1500, balance: 340000, creditScore: 670, propsOwned: [15], devLevels: [1], occupancy: [55] },
  { username: 'OmarInvest', displayName: 'Omar Invest', level: 14, xp: 4600, balance: 980000, creditScore: 760, propsOwned: [30, 42, 55], devLevels: [3, 5, 2], occupancy: [88, 78, 65] },
  { username: 'ElenaVillas', displayName: 'Elena Villas', level: 10, xp: 2600, balance: 610000, creditScore: 700, propsOwned: [18, 37], devLevels: [2, 3], occupancy: [72, 80] },
  { username: 'TurboRealty', displayName: 'Turbo Realty', level: 16, xp: 6100, balance: 1500000, creditScore: 790, propsOwned: [65, 78, 88, 95, 100], devLevels: [4, 3, 5, 2, 6], occupancy: [92, 85, 78, 90, 88] },
  { username: 'ChenProperties', displayName: 'Chen Properties', level: 8, xp: 1800, balance: 420000, creditScore: 680, propsOwned: [3, 20], devLevels: [1, 2], occupancy: [50, 65] },
  { username: 'BellaHomes', displayName: 'Bella Homes', level: 13, xp: 3900, balance: 750000, creditScore: 740, propsOwned: [25, 40, 52], devLevels: [3, 4, 2], occupancy: [82, 75, 70] },
  { username: 'RajCapital', displayName: 'Raj Capital', level: 20, xp: 9500, balance: 3200000, creditScore: 830, propsOwned: [50, 62, 75, 82, 98], devLevels: [7, 5, 6, 4, 8], occupancy: [98, 92, 88, 85, 95] },
  { username: 'JakeFlips', displayName: 'Jake Flips', level: 6, xp: 1200, balance: 280000, creditScore: 660, propsOwned: [7], devLevels: [0], occupancy: [40] },
  { username: 'LunaEstates', displayName: 'Luna Estates', level: 17, xp: 6800, balance: 1800000, creditScore: 800, propsOwned: [58, 70, 83, 93], devLevels: [5, 3, 4, 6], occupancy: [90, 82, 88, 93] },
  { username: 'ViktorDevelop', displayName: 'Viktor Develop', level: 11, xp: 2800, balance: 590000, creditScore: 715, propsOwned: [12, 33], devLevels: [3, 5], occupancy: [68, 78] },
];

function pickAvatar(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function seed() {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  const existingCount = await User.countDocuments({ role: 'user' });
  if (existingCount > 1) {
    console.log(`There are already ${existingCount} real users. Skipping seed to avoid duplicates.`);
    await mongoose.disconnect();
    return;
  }

  const availableProperties = await Property.find({ ownerId: null }).sort({ currentPrice: -1 }).lean();
  console.log(`Available unowned properties: ${availableProperties.length}`);

  const createdUsers = [];

  for (const ai of AI_PLAYERS) {
    const passwordHash = await mongoose.model('User').schema.methods.comparePassword
      ? undefined
      : undefined;

    const user = await User.create({
      username: ai.username,
      email: `${ai.username.toLowerCase()}@ai.cityflow.dev`,
      displayName: ai.displayName,
      balance: ai.balance,
      level: ai.level,
      xp: ai.xp,
      xpToNextLevel: ai.level * 200,
      creditScore: ai.creditScore,
      creditScoreUpdatedTick: 50,
      avatar: pickAvatar(ai.displayName),
      bio: `AI player - ${ai.displayName}`,
      role: 'user',
      onboarding: { completed: true, completedAt: new Date() },
      acceptedTerms: true,
      acceptedTermsAt: new Date(),
      acceptedPrivacy: true,
      acceptedPrivacyAt: new Date(),
      emailVerified: true,
      emailVerifiedAt: new Date(),
      lifetimeStats: {
        totalTransactions: ai.propsOwned.length * 2,
        totalPropertiesOwned: ai.propsOwned.length,
        totalMoneyEarned: Math.round(ai.balance * 0.3),
        totalMoneySpent: Math.round(ai.balance * 0.2),
        totalLoansTaken: Math.random() > 0.5 ? 1 : 0,
        totalUpgrades: ai.devLevels.reduce((s, l) => s + l, 0),
      },
    });

    createdUsers.push({ user, ai });
    console.log(`Created AI player: ${ai.username} (level ${ai.level})`);
  }

  let transactionCount = 0;

  for (const { user, ai } of createdUsers) {
    const propIndices = ai.propsOwned.filter((i) => i < availableProperties.length);
    const ownedPropIds = [];

    for (let i = 0; i < propIndices.length; i++) {
      const propData = availableProperties[propIndices[i]];
      if (!propData) continue;

      const devLevel = ai.devLevels[i] || 0;
      const occ = ai.occupancy[i] || 0;

      const updated = await Property.findByIdAndUpdate(
        propData._id,
        {
          ownerId: user._id,
          forSale: false,
          developmentLevel: devLevel,
          occupancy: occ,
          lastPurchasePrice: propData.currentPrice,
          lastPurchaseDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          rent: Math.round(propData.currentPrice * 0.003 * (1 + devLevel * 0.15)),
          maintenanceCost: Math.round(propData.currentPrice * 0.001 * (1 + devLevel * 0.1)),
        },
        { new: true },
      );

      ownedPropIds.push(updated._id);

      await Transaction.create({
        propertyId: updated._id,
        buyerId: user._id,
        price: propData.currentPrice,
        type: 'buy',
      });
      transactionCount++;

      if (Math.random() > 0.6 && transactionCount < 100) {
        await Transaction.create({
          propertyId: updated._id,
          sellerId: user._id,
          buyerId: new mongoose.Types.ObjectId(),
          price: Math.round(propData.currentPrice * (0.9 + Math.random() * 0.3)),
          type: 'sell',
        });
        transactionCount++;
      }
    }

    await User.findByIdAndUpdate(user._id, { $set: { ownedProperties: ownedPropIds } });
  }

  for (const { user } of createdUsers) {
    for (const other of createdUsers) {
      if (user._id.equals(other.user._id)) continue;
      if (Math.random() > 0.3) continue;
      await User.findByIdAndUpdate(user._id, { $addToSet: { friends: other.user._id } });
    }
  }

  console.log(`\nSeed complete!`);
  console.log(`  AI players created: ${createdUsers.length}`);
  console.log(`  Total users now: ${await User.countDocuments()}`);
  console.log(`  Transactions created: ${transactionCount}`);
  console.log(`  Properties claimed: ${await Property.countDocuments({ ownerId: { $ne: null } })}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
