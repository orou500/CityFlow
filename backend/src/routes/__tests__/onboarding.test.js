import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';
import Notification from '../../models/Notification.js';
import { getXpForLevel, awardXp } from '../../utils/leveling.js';

const app = createApp();

async function makeUser(name, overrides = {}) {
  const { user, token } = await createAuthenticatedUser(overrides);
  user.username = name;
  return { user, token };
}

beforeEach(async () => {
  await User.deleteMany({});
  await Notification.deleteMany({});
});

afterAll(async () => {
  await User.deleteMany({});
  await Notification.deleteMany({});
});

describe('Progressive onboarding', () => {
  it('shows Level-1 systems as pending for a brand-new player', async () => {
    const { token } = await makeUser('fresh');
    const res = await request(app).get('/onboarding/status').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.level).toBe(1);
    const ids = res.body.pending.map((p) => p.id);
    expect(ids).toContain('properties');
    expect(ids).not.toContain('auctions');
    expect(res.body.completed).toEqual([]);
  });

  it('marks a step complete and never shows it again', async () => {
    const { token } = await makeUser('completer');
    await request(app).get('/onboarding/status').set(authHeader(token));

    const res = await request(app).post('/onboarding/complete').set(authHeader(token)).send({ id: 'properties' });
    expect(res.status).toBe(200);
    expect(res.body.completed).toContain('properties');
    expect(res.body.pending.map((p) => p.id)).not.toContain('properties');

    const again = await request(app).get('/onboarding/status').set(authHeader(token));
    expect(again.body.completed).toContain('properties');
    expect(again.body.pending.map((p) => p.id)).not.toContain('properties');
  });

  it('rejects unknown step ids', async () => {
    const { token } = await makeUser('badstep');
    const res = await request(app).post('/onboarding/complete').set(authHeader(token)).send({ id: 'not_a_system' });
    expect(res.status).toBe(400);
  });

  it('unlocks new systems when the player levels up', async () => {
    const { user, token } = await makeUser('leveler', { level: 1, xp: 0, xpToNextLevel: getXpForLevel(1) });
    await request(app).get('/onboarding/status').set(authHeader(token));
    await request(app).post('/onboarding/complete').set(authHeader(token)).send({ id: 'properties' });

    // level up 1 → 3 (100 + 150 XP)
    await awardXp(await User.findById(user._id), getXpForLevel(1) + getXpForLevel(2));

    const res = await request(app).get('/onboarding/status').set(authHeader(token));
    const ids = res.body.pending.map((p) => p.id);
    expect(ids).toContain('management'); // level 2
    expect(ids).toContain('development'); // level 3
    expect(ids).not.toContain('properties');
  });

  it('creates a navigation notification for a newly unlocked system on level-up', async () => {
    const { user, token } = await makeUser('notified', { level: 2, xp: 0, xpToNextLevel: getXpForLevel(2) });
    await request(app).get('/onboarding/status').set(authHeader(token));
    await request(app).post('/onboarding/complete').set(authHeader(token)).send({ id: 'properties' });
    await request(app).post('/onboarding/complete').set(authHeader(token)).send({ id: 'management' });

    await awardXp(await User.findById(user._id), getXpForLevel(2)); // 2 → 3

    const notifs = await Notification.find({ userId: user._id }).lean();
    const devNotif = notifs.find((n) => n.title === 'Development Unlocked');
    expect(devNotif).toBeDefined();
    expect(devNotif.route).toBe('/development');
    expect(devNotif.message).toMatch(/develop/i);
  });

  it('does not duplicate unlock notifications across repeated level-ups', async () => {
    const { user, token } = await makeUser('dedupe', { level: 2, xp: 0, xpToNextLevel: getXpForLevel(2) });
    await request(app).get('/onboarding/status').set(authHeader(token));
    await request(app).post('/onboarding/complete').set(authHeader(token)).send({ id: 'properties' });
    await request(app).post('/onboarding/complete').set(authHeader(token)).send({ id: 'management' });

    await awardXp(await User.findById(user._id), getXpForLevel(2));
    await awardXp(await User.findById(user._id), 5); // no level-up
    await awardXp(await User.findById(user._id), 5); // no level-up

    const notifs = await Notification.find({ userId: user._id, title: 'Development Unlocked' }).lean();
    expect(notifs.length).toBe(1);
  });

  it('safely migrates existing high-level players with no tutorial backlog', async () => {
    const { user, token } = await makeUser('veteran', {
      level: 20,
      xp: 0,
      xpToNextLevel: getXpForLevel(20),
      onboarding: { completed: true, completedAt: new Date() },
    });

    const res = await request(app).get('/onboarding/status').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.pending).toEqual([]);
    expect(res.body.completed).toContain('properties');
    expect(res.body.completed).toContain('auctions');
    expect(res.body.completed).toContain('ipo');

    const persisted = await User.findById(user._id);
    expect(persisted.onboardingV2Seen).toBe(true);
  });

  it('migrates high-level players who never finished the old onboarding', async () => {
    const { user, token } = await makeUser('nolessons', {
      level: 12,
      xp: 0,
      xpToNextLevel: getXpForLevel(12),
      onboarding: { completed: false, completedAt: null },
    });

    const res = await request(app).get('/onboarding/status').set(authHeader(token));
    expect(res.body.pending).toEqual([]);
    expect(res.body.completed).toContain('stocks'); // level 12
    expect(res.body.completed).not.toContain('ipo'); // level 20
  });
});
