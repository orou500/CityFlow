import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { config } from '../src/config/index.js';
import User from '../src/models/User.js';
import Property from '../src/models/Property.js';
import City from '../src/models/City.js';

/**
 * One-off E2E fixture: creates a disposable user with a portfolio of
 * properties (long names + very large values) and prints a JWT for login.
 * The spec deletes the user + properties afterwards.
 */
const USERNAME = 'e2e_portfolio';
const SECRET = 'cityflow-e2e-secret';

const PORTFOLIO = [
  { name: 'Luxury Commercial Tower Downtown International Business District Office Complex', type: 'commercial', currentPrice: 125000000, rent: 12500000 },
  { name: 'Sunset Boulevard Penthouse Residence With Panoramic Sea View', type: 'apartment', currentPrice: 8750000, rent: 950000 },
  { name: 'Historic Warehouse Converted Into Creative Studios Complex', type: 'commercial', currentPrice: 4200000, rent: 380000 },
  { name: 'Family Suburban House With Large Private Garden', type: 'house', currentPrice: 1250000, rent: 150000 },
  { name: 'Greenfield Agricultural Land Plot Near The New Highway Interchange', type: 'land', currentPrice: 950000, rent: 0 },
  { name: 'Downtown Boutique Hotel And Rooftop Lounge Complex', type: 'commercial', currentPrice: 54000000, rent: 5200000 },
  { name: 'Modern Residential Apartment In The Financial District', type: 'apartment', currentPrice: 2750000, rent: 260000 },
  { name: 'Industrial Logistics Center And Distribution Hub', type: 'commercial', currentPrice: 31500000, rent: 2900000 },
];

async function run() {
  await mongoose.connect(config.mongodbUri);
  await User.deleteMany({ username: USERNAME });
  await Property.deleteMany({ ownerId: { $in: (await User.find({ username: USERNAME })).map((u) => u._id) } });

  let city = await City.findOne({ name: 'E2E City' }).lean();
  if (!city) {
    city = await City.create({
      name: 'E2E City',
      country: 'E2E',
      coordinates: { lat: 32.08, lng: 34.78 },
    });
    city = city.toObject();
  }
  const user = await User.create({
    username: USERNAME,
    normalizedUsername: USERNAME,
    email: `${USERNAME}@e2e.local`,
    password: 'Password123',
    emailVerified: true,
    emailVerifiedAt: new Date(),
    acceptedTerms: true,
    acceptedTermsAt: new Date(),
    acceptedPrivacy: true,
    acceptedPrivacyAt: new Date(),
    displayName: 'E2E Portfolio',
    balance: 5000000,
  });

  for (const p of PORTFOLIO) {
    await Property.create({
      name: p.name,
      type: p.type,
      currentPrice: p.currentPrice,
      basePrice: p.currentPrice,
      rent: p.rent,
      ownerId: user._id,
      cityId: city._id,
      districtId: null,
      condition: 90,
      occupancy: 100,
    });
  }

  const token = jwt.sign({ userId: user._id.toString() }, SECRET, { expiresIn: '7d' });
  console.log(JSON.stringify({ userId: user._id.toString(), token, cityId: city._id.toString() }));
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('SEED FAILED:', e.message);
  process.exit(1);
});