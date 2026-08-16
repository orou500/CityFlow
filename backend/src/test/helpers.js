import User from '../models/User.js';
import Property from '../models/Property.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import GameState from '../models/GameState.js';
import { cacheDel } from '../utils/cache.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

// The authoritative tick source is MongoDB (GameState), not process memory.
// Tests must set the DB tick so every replica-consistent code path (routes,
// engine) sees the same value. The tick cache is invalidated the same way
// incrementTick() does in production.
export async function setTestTick(n) {
  await GameState.findOneAndUpdate({ key: 'global' }, { tickNumber: n, lastTickAt: new Date() }, { upsert: true });
  await cacheDel('cf:tick:state');
}

export function generateToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '7d' });
}

export function generateExpiredToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '0s' });
}

export function generateTokenWithBadSecret(userId) {
  return jwt.sign({ userId }, 'wrong-secret', { expiresIn: '7d' });
}

export async function createTestUser(overrides = {}) {
  const data = {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'Password123',
    emailVerified: true,
    emailVerifiedAt: new Date(),
    ...overrides,
  };
  const user = await User.create(data);
  return user;
}

export async function createAuthenticatedUser(overrides = {}) {
  const user = await createTestUser(overrides);
  const token = generateToken(user._id);
  return { user, token };
}

export async function createAdminUser(overrides = {}) {
  return createTestUser({ role: 'admin', ...overrides });
}

export async function createAuthenticatedAdmin(overrides = {}) {
  const user = await createAdminUser(overrides);
  const token = generateToken(user._id);
  return { user, token };
}

export async function createTestCity(overrides = {}) {
  const data = {
    name: `TestCity_${Date.now()}`,
    country: 'Testland',
    coordinates: { lat: 0, lng: 0 },
    description: 'A test city',
    ...overrides,
  };
  return City.create(data);
}

export async function createTestProperty(overrides = {}) {
  const city = overrides.cityId || (await createTestCity());
  const data = {
    name: `TestProp_${Date.now()}`,
    type: 'apartment',
    currentPrice: 100000,
    ...overrides,
    cityId: overrides.cityId || city._id,
  };
  return Property.create(data);
}

export async function createTestTransaction(overrides = {}) {
  const data = {
    type: 'buy',
    amount: 100000,
    ...overrides,
  };
  return Transaction.create(data);
}

export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}
