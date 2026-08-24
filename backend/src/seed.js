import mongoose from 'mongoose';
import { config } from './config/index.js';
import City from './models/City.js';
import Property from './models/Property.js';
import User from './models/User.js';
import { clampMonthlyRent } from './config/propertyManagement.js';
import { resetCities } from './engine/citySeeding.js';

const propertyTypes = ['apartment', 'house', 'commercial', 'land'];
const propertyNames = [
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

async function seed() {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('Connected to MongoDB');

    await Property.deleteMany({});
    await User.deleteMany({});

    const { cities, districtsCreated } = await resetCities();
    console.log(`Seeded ${cities.length} cities (${districtsCreated} districts)`);

    const propertiesToInsert = [];
    for (const city of cities) {
      const numProperties = 10 + Math.floor(Math.random() * 11);

      for (let i = 0; i < numProperties; i++) {
        const nameIndex = Math.floor(Math.random() * propertyNames.length);
        const baseP = city.avgPrice * (0.6 + Math.random() * 0.8);
        const type = propertyTypes[Math.floor(Math.random() * propertyTypes.length)];

        propertiesToInsert.push({
          cityId: city._id,
          ownerId: null,
          type,
          name: `${propertyNames[nameIndex]} - ${city.name}`,
          basePrice: Math.round(baseP),
          currentPrice: Math.round(baseP),
          rent: clampMonthlyRent(baseP * 0.004),
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

    await Property.insertMany(propertiesToInsert);
    console.log(`Seeded ${propertiesToInsert.length} bank-owned properties`);

    for (const city of cities) {
      const count = await Property.countDocuments({ cityId: city._id });
      await City.findByIdAndUpdate(city._id, { propertyCount: count });
    }

    const adminUser = await User.create({
      username: 'admin',
      email: config.adminEmail,
      password: config.adminPassword,
      balance: 500000,
      role: 'admin',
    });
    console.log(`Created admin user: ${adminUser.username} (role: ${adminUser.role})`);

    console.log('Seed completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
