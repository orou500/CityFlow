import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import User from '../../models/User.js';
import Season from '../../models/Season.js';
import GameState from '../../models/GameState.js';
import { generateToken } from '../../test/helpers.js';

const app = createApp();

async function createAdmin() {
  return User.create({
    username: 'seasonadmin',
    normalizedUsername: 'seasonadmin',
    email: 'seasonadmin@test.com',
    password: 'password123',
    role: 'admin',
  });
}

async function createUser(name) {
  return User.create({
    username: name,
    normalizedUsername: name.toLowerCase(),
    email: `${name}@test.com`,
    password: 'password123',
    role: 'user',
  });
}

describe('Season endpoints', () => {
  let adminToken;

  beforeEach(async () => {
    await User.deleteMany({});
    await Season.deleteMany({});
    await GameState.deleteMany({});

    const admin = await createAdmin();
    adminToken = generateToken(admin._id);

    await GameState.findOneAndUpdate({ key: 'global' }, { $set: { tickNumber: 10 } }, { upsert: true, new: true });
  });

  describe('GET /admin/seasons', () => {
    it('returns seasons list for admin', async () => {
      await Season.create({ number: 1, status: 'completed', startDate: new Date('2026-01-01'), endDate: new Date('2026-06-01') });
      const res = await request(app).get('/admin/seasons').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].number).toBe(1);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/admin/seasons');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /admin/seasons/current', () => {
    it('returns null when no active season', async () => {
      const res = await request(app).get('/admin/seasons/current').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it('returns active season', async () => {
      await Season.create({ number: 1, status: 'active' });
      const res = await request(app).get('/admin/seasons/current').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect(res.body.number).toBe(1);
    });
  });

  describe('GET /admin/seasons/preview', () => {
    it('returns preview of what will be reset', async () => {
      await createUser('previewuser');
      const res = await request(app).get('/admin/seasons/preview').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.willReset).toHaveProperty('users');
      expect(res.body.willReset).toHaveProperty('properties');
      expect(res.body.willReset).toHaveProperty('transactions');
      expect(res.body.willReset.users).toBeGreaterThanOrEqual(2);
    });
  });

  describe('POST /admin/seasons/end', () => {
    it('rejects without confirm flag', async () => {
      const res = await request(app).post('/admin/seasons/end').set('Authorization', `Bearer ${adminToken}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/confirm/);
    });

    it('rejects when no active season', async () => {
      const res = await request(app)
        .post('/admin/seasons/end')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/No active season/);
    });

    it('ends season and starts new one', async () => {
      await Season.create({ number: 1, status: 'active' });
      const res = await request(app)
        .post('/admin/seasons/end')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });
      expect(res.status).toBe(200);
      expect(res.body.endedSeason).toBe(1);
      expect(res.body.newSeason).toBe(2);

      const seasons = await Season.find().sort({ number: 1 });
      expect(seasons.length).toBe(2);
      expect(seasons[0].status).toBe('completed');
      expect(seasons[1].status).toBe('active');

      const state = await GameState.findOne({ key: 'global' });
      expect(state.tickNumber).toBe(0);
    });
  });
});

describe('GET /seasons (public)', () => {
  it('returns active and completed seasons', async () => {
    await Season.deleteMany({});
    await Season.create({ number: 1, status: 'completed', startDate: new Date('2026-01-01'), endDate: new Date('2026-06-01') });
    await Season.create({ number: 2, status: 'active' });
    const res = await request(app).get('/seasons');
    expect(res.status).toBe(200);
    expect(res.body.activeSeason.number).toBe(2);
    expect(res.body.completedSeasons.length).toBe(1);
  });

  it('returns empty when no seasons exist', async () => {
    await Season.deleteMany({});
    const res = await request(app).get('/seasons');
    expect(res.status).toBe(200);
    expect(res.body.activeSeason).toBeNull();
    expect(res.body.completedSeasons).toEqual([]);
  });
});
