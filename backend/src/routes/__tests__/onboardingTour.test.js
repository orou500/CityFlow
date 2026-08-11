import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';
import Notification from '../../models/Notification.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import MissionProgress from '../../models/MissionProgress.js';
import { advanceOnboarding } from '../../utils/onboardingTour.js';

const app = createApp();

async function makeUser(name, overrides = {}) {
  const { user, token } = await createAuthenticatedUser(overrides);
  user.username = name;
  return { user, token };
}

async function tourStatus(token) {
  const res = await request(app).get('/onboarding/tour/status').set(authHeader(token));
  return res;
}

async function walkToStep(token, stepId) {
  // Advance informational steps (welcome, dashboard, cities) up to stepId
  const defs = [
    'welcome',
    'dashboard',
    'cities',
    'buy_property',
    'property_page',
    'collect_rent',
    'upgrade_property',
    'missions',
    'marketplace',
    'companies',
    'complete',
  ];
  const target = defs.indexOf(stepId);
  const before = defs.slice(0, target);
  for (let i = 0; i < before.length; i++) {
    const res = await request(app).post('/onboarding/tour/advance').set(authHeader(token));
    if (res.status !== 200) break;
  }
}

beforeEach(async () => {
  await User.deleteMany({});
  await Notification.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
  await MissionProgress.deleteMany({});
});

afterAll(async () => {
  await User.deleteMany({});
  await Notification.deleteMany({});
  await Property.deleteMany({});
  await City.deleteMany({});
  await MissionProgress.deleteMany({});
});

describe('Guided onboarding tour', () => {
  it('a brand-new player starts at the welcome step with active status', async () => {
    const { token } = await makeUser('newbie');
    const res = await tourStatus(token);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.currentStep).toBe('welcome');
    expect(res.body.eventGated).toBe(false);
    expect(res.body.totalSteps).toBe(11);
    expect(res.body.completedSteps).toEqual([]);
  });

  it('informational steps advance via Next; state persists across fetches', async () => {
    const { token } = await makeUser('clicker');

    await request(app).post('/onboarding/tour/advance').set(authHeader(token));
    const step2 = await tourStatus(token);
    expect(step2.body.currentStep).toBe('dashboard');

    await request(app).post('/onboarding/tour/advance').set(authHeader(token));
    const step3 = await tourStatus(token);
    expect(step3.body.currentStep).toBe('cities');

    // Refresh-safe: state comes from the server, not the client
    const again = await tourStatus(token);
    expect(again.body.currentStep).toBe('cities');
    expect(again.body.completedSteps).toEqual(['welcome', 'dashboard']);
  });

  it('event-gated steps reject client advancement (cannot be clicked through)', async () => {
    const { token } = await makeUser('impatient');
    await walkToStep(token, 'buy_property');
    const res = await tourStatus(token);
    expect(res.body.currentStep).toBe('buy_property');
    expect(res.body.eventGated).toBe(true);

    const advance = await request(app).post('/onboarding/tour/advance').set(authHeader(token));
    expect(advance.status).toBe(400);
    expect(advance.body.error).toMatch(/complete the current onboarding action/i);
  });

  it('buying a property advances buy_property → property_page', async () => {
    const { user, token } = await makeUser('buyer');
    await walkToStep(token, 'buy_property');

    await advanceOnboarding(user._id, 'property_buy');

    const res = await tourStatus(token);
    expect(res.body.currentStep).toBe('property_page');
    expect(res.body.completedSteps).toContain('buy_property');
  });

  it('collecting rent advances collect_rent', async () => {
    const { user, token } = await makeUser('renter');
    await walkToStep(token, 'buy_property');
    await advanceOnboarding(user._id, 'property_buy');
    await request(app).post('/onboarding/tour/advance').set(authHeader(token)); // property_page → collect_rent

    const res = await tourStatus(token);
    expect(res.body.currentStep).toBe('collect_rent');

    await advanceOnboarding(user._id, 'rent_collect');
    const after = await tourStatus(token);
    expect(after.body.currentStep).toBe('upgrade_property');
  });

  it('upgrading a property advances upgrade_property', async () => {
    const { user, token } = await makeUser('upgrader');
    await walkToStep(token, 'buy_property');
    await advanceOnboarding(user._id, 'property_buy');
    await request(app).post('/onboarding/tour/advance').set(authHeader(token));
    await advanceOnboarding(user._id, 'rent_collect');

    await advanceOnboarding(user._id, 'property_upgrade');
    const res = await tourStatus(token);
    expect(res.body.currentStep).toBe('missions');
    expect(res.body.completedSteps).toContain('upgrade_property');
  });

  it('collecting a mission reward advances missions (completing alone does not)', async () => {
    const { user, token } = await makeUser('missioner');
    await walkToStep(token, 'buy_property');
    await advanceOnboarding(user._id, 'property_buy');
    await request(app).post('/onboarding/tour/advance').set(authHeader(token));
    await advanceOnboarding(user._id, 'rent_collect');
    await advanceOnboarding(user._id, 'property_upgrade');

    // Mission completion alone must NOT advance the step
    await advanceOnboarding(user._id, 'mission_complete');
    const stillWaiting = await tourStatus(token);
    expect(stillWaiting.body.currentStep).toBe('missions');
    expect(stillWaiting.body.completedSteps).not.toContain('missions');

    // Claiming the reward advances it
    await advanceOnboarding(user._id, 'mission_claimed');
    const res = await tourStatus(token);
    expect(res.body.currentStep).toBe('marketplace');
    expect(res.body.completedSteps).toContain('missions');
  });

  it('completing the tour marks status completed and creates exactly one notification', async () => {
    const { user, token } = await makeUser('finisher');
    await walkToStep(token, 'buy_property');
    await advanceOnboarding(user._id, 'property_buy');
    await request(app).post('/onboarding/tour/advance').set(authHeader(token)); // property_page
    await advanceOnboarding(user._id, 'rent_collect');
    await advanceOnboarding(user._id, 'property_upgrade');
    await advanceOnboarding(user._id, 'mission_claimed');
    await request(app).post('/onboarding/tour/advance').set(authHeader(token)); // marketplace → companies
    await request(app).post('/onboarding/tour/advance').set(authHeader(token)); // companies → complete
    await request(app).post('/onboarding/tour/advance').set(authHeader(token)); // complete → finished

    const res = await tourStatus(token);
    expect(res.body.status).toBe('completed');
    expect(res.body.completedSteps).toHaveLength(11);

    const notifs = await Notification.find({ userId: user._id, eventKey: `onboarding:${user._id}:completed` }).lean();
    expect(notifs.length).toBe(1);

    // Idempotent: re-running completion produces nothing new
    await advanceOnboarding(user._id, 'rent_collect');
    const notifs2 = await Notification.find({ userId: user._id, eventKey: `onboarding:${user._id}:completed` }).lean();
    expect(notifs2.length).toBe(1);
  });

  it('skip persists and suppresses the tour', async () => {
    const { token } = await makeUser('skipper');

    const res = await request(app).post('/onboarding/tour/skip').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('skipped');

    const again = await tourStatus(token);
    expect(again.body.status).toBe('skipped');

    // Advancing after skip is a no-op
    await request(app).post('/onboarding/tour/advance').set(authHeader(token));
    const after = await tourStatus(token);
    expect(after.body.status).toBe('skipped');
  });

  it('experienced players are not forced through first-time steps', async () => {
    const city = await City.create({ name: 'Vet City', country: 'Testland', coordinates: { lat: 0, lng: 0 } });
    const { user, token } = await makeUser('vet', {
      level: 6,
      ownedProperties: [new mongoose.Types.ObjectId()],
      lastRentCollectedAt: new Date(),
      lifetimeStats: { totalUpgrades: 2, totalTransactions: 8, totalRentCollected: 50000 },
    });
    await Property.create({
      cityId: city._id,
      name: 'Vet House',
      type: 'house',
      basePrice: 1,
      currentPrice: 1,
      rent: 1,
      forSale: false,
    });
    await MissionProgress.create({ userId: user._id, missionId: 'first_property', status: 'completed', target: 1 });

    const res = await tourStatus(token);
    expect(res.body.status).toBe('completed');
    expect(res.body.completedSteps).toHaveLength(11);
    expect(user._id).toBeTruthy();
  });

  it('a player with a property but no rent skips buy steps and resumes at collect_rent', async () => {
    const city = await City.create({ name: 'Mid City', country: 'Testland', coordinates: { lat: 0, lng: 0 } });
    const { token } = await makeUser('mid', {
      ownedProperties: [new mongoose.Types.ObjectId()],
    });
    await Property.create({
      cityId: city._id,
      name: 'Mid House',
      type: 'house',
      basePrice: 1,
      currentPrice: 1,
      rent: 1,
      forSale: false,
    });

    const res = await tourStatus(token);
    expect(res.body.status).toBe('active');
    expect(res.body.completedSteps).toEqual(['welcome', 'dashboard', 'cities', 'buy_property', 'property_page']);
    expect(res.body.currentStep).toBe('collect_rent');
  });
});
