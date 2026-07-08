import crypto from 'crypto';
import mongoose from 'mongoose';
import { config } from './config/index.js';
import City from './models/City.js';
import Property from './models/Property.js';
import User from './models/User.js';

const citiesData = [
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
    name: 'São Paulo',
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

    await City.deleteMany({});
    await Property.deleteMany({});
    await User.deleteMany({});

    const cities = await City.insertMany(citiesData);
    console.log(`Seeded ${cities.length} cities`);

    const systemUser = await User.create({
      username: '__system__',
      email: 'system@cityflow.internal',
      password: crypto.randomUUID(),
      balance: 0,
      role: 'user',
    });
    console.log(`Created system user: ${systemUser.username}`);

    const propertiesToInsert = [];
    for (const city of cities) {
      const numProperties = 10 + Math.floor(Math.random() * 11);

      for (let i = 0; i < numProperties; i++) {
        const nameIndex = Math.floor(Math.random() * propertyNames.length);
        const baseP = city.avgPrice * (0.6 + Math.random() * 0.8);
        const type = propertyTypes[Math.floor(Math.random() * propertyTypes.length)];

        propertiesToInsert.push({
          cityId: city._id,
          ownerId: systemUser._id,
          type,
          name: `${propertyNames[nameIndex]} - ${city.name}`,
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
