import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, createTestCity, authHeader } from '../../test/helpers.js';
import Property from '../../models/Property.js';
import Transaction from '../../models/Transaction.js';
import Notification from '../../models/Notification.js';

const app = createApp();

describe('Property Improvement endpoints', () => {
  let owner, ownerToken, property, city;

  beforeEach(async () => {
    await Property.deleteMany({});
    await Transaction.deleteMany({});
    await Notification.deleteMany({});

    const result = await createAuthenticatedUser({ balance: 1000000 });
    owner = result.user;
    ownerToken = result.token;

    city = await createTestCity();
    property = await createTestProperty({
      cityId: city._id,
      ownerId: owner._id,
      currentPrice: 100000,
      basePrice: 100000,
      developmentLevel: 2,
      type: 'apartment',
      forSale: false,
    });
  });

  describe('GET /development/improvements/options', () => {
    it('returns available improvement options', async () => {
      const res = await request(app).get('/development/improvements/options').set(authHeader(ownerToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('description');
      expect(res.body[0]).toHaveProperty('constructionPeriods');
      expect(res.body[0]).toHaveProperty('valueBonus');
      expect(res.body[0]).toHaveProperty('rentBonus');
    });
  });

  describe('GET /development/improvements/available/:propertyId', () => {
    it('returns available improvements for property owner', async () => {
      const res = await request(app)
        .get(`/development/improvements/available/${property._id}`)
        .set(authHeader(ownerToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.available)).toBe(true);
      expect(res.body.completedCount).toBe(0);
      expect(res.body.propertyRating).toBe('standard');
    });

    it('returns 403 for non-owner', async () => {
      const { token: otherToken } = await createAuthenticatedUser({ balance: 100000 });
      const res = await request(app)
        .get(`/development/improvements/available/${property._id}`)
        .set(authHeader(otherToken));

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent property', async () => {
      const fakeId = '507f1f77bcf86cd799439013';
      const res = await request(app).get(`/development/improvements/available/${fakeId}`).set(authHeader(ownerToken));

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get(`/development/improvements/available/${property._id}`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /development/improvements/status/:propertyId', () => {
    it('returns improvement status for property owner', async () => {
      const res = await request(app)
        .get(`/development/improvements/status/${property._id}`)
        .set(authHeader(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.propertyRating).toBe('standard');
      expect(Array.isArray(res.body.improvements)).toBe(true);
      expect(res.body.ratingBonuses).toHaveProperty('valueBonus');
      expect(res.body.ratingBonuses).toHaveProperty('rentBonus');
    });
  });

  describe('POST /development/improvements/start', () => {
    it('starts an improvement project', async () => {
      const res = await request(app)
        .post('/development/improvements/start')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString(), improvementId: 'renovation' });

      expect(res.status).toBe(201);
      expect(res.body.improvement).toHaveProperty('improvementId', 'renovation');
      expect(res.body.improvement).toHaveProperty('name', 'Renovation');
      expect(res.body.balance).toBeLessThan(1000000);
    });

    it('deducts correct cost from balance', async () => {
      const initialBalance = owner.balance;

      const res = await request(app)
        .post('/development/improvements/start')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString(), improvementId: 'renovation' });

      expect(res.status).toBe(201);
      expect(res.body.balance).toBeLessThan(initialBalance);
    });

    it('returns 400 if improvement already in progress', async () => {
      await request(app)
        .post('/development/improvements/start')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString(), improvementId: 'renovation' });

      const res = await request(app)
        .post('/development/improvements/start')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString(), improvementId: 'interior_upgrade' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/improvement is already in progress/i);
    });

    it('returns 400 for invalid improvement type', async () => {
      const res = await request(app)
        .post('/development/improvements/start')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString(), improvementId: 'invalid_type' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid improvement type/i);
    });

    it('returns 400 if insufficient balance', async () => {
      const poor = await createAuthenticatedUser({ balance: 10 });
      const cheapProperty = await createTestProperty({
        cityId: city._id,
        ownerId: poor.user._id,
        currentPrice: 100000,
        basePrice: 100000,
        developmentLevel: 2,
        type: 'apartment',
        forSale: false,
      });

      const res = await request(app)
        .post('/development/improvements/start')
        .set(authHeader(poor.token))
        .send({ propertyId: cheapProperty._id.toString(), improvementId: 'renovation' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Insufficient funds/i);
    });

    it('returns 400 if not property owner', async () => {
      const { token: otherToken } = await createAuthenticatedUser({ balance: 100000 });
      const res = await request(app)
        .post('/development/improvements/start')
        .set(authHeader(otherToken))
        .send({ propertyId: property._id.toString(), improvementId: 'renovation' });

      expect(res.status).toBe(403);
    });

    it('creates a Transaction record', async () => {
      await request(app)
        .post('/development/improvements/start')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString(), improvementId: 'renovation' });

      const tx = await Transaction.findOne({
        propertyId: property._id,
        type: 'improvement',
      });

      expect(tx).toBeTruthy();
      expect(tx.buyerId.toString()).toBe(owner._id.toString());
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/development/improvements/start')
        .send({ propertyId: property._id.toString(), improvementId: 'renovation' });

      expect(res.status).toBe(401);
    });
  });

  describe('Property Rating', () => {
    it('starts with standard rating', async () => {
      const res = await request(app)
        .get(`/development/improvements/status/${property._id}`)
        .set(authHeader(ownerToken));

      expect(res.body.propertyRating).toBe('standard');
    });

    it('prevents starting duplicate improvement', async () => {
      await request(app)
        .post('/development/improvements/start')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString(), improvementId: 'renovation' });

      const res = await request(app)
        .post('/development/improvements/start')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString(), improvementId: 'renovation' });

      expect(res.status).toBe(400);
    });
  });
});
