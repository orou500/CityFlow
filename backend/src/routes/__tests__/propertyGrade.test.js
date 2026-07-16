import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, createTestCity, authHeader } from '../../test/helpers.js';
import Property from '../../models/Property.js';
import Transaction from '../../models/Transaction.js';
import Notification from '../../models/Notification.js';

const app = createApp();

describe('Property Grade endpoints', () => {
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
      grade: 1,
      forSale: false,
    });
  });

  describe('GET /properties/:id/grade', () => {
    it('returns grade info for property owner', async () => {
      const res = await request(app).get(`/properties/${property._id}/grade`).set(authHeader(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.grade).toBe(1);
      expect(res.body.gradeName).toBe('I');
      expect(res.body.nextGrade).toBe(2);
      expect(res.body.nextGradeName).toBe('II');
      expect(res.body.upgradeCost).toBe(2000);
      expect(res.body.valueBonus).toBe(0);
      expect(res.body.rentBonus).toBe(0);
    });

    it('returns 403 for non-owner', async () => {
      const { token: otherToken } = await createAuthenticatedUser({ balance: 100000 });
      const res = await request(app).get(`/properties/${property._id}/grade`).set(authHeader(otherToken));

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent property', async () => {
      const fakeId = '507f1f77bcf86cd799439013';
      const res = await request(app).get(`/properties/${fakeId}/grade`).set(authHeader(ownerToken));

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get(`/properties/${property._id}/grade`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /properties/grade/upgrade', () => {
    it('upgrades Grade I to Grade II', async () => {
      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.grade).toBe(2);
      expect(res.body.upgradeCost).toBe(2000);
      expect(res.body.property.grade).toBe(2);
    });

    it('deducts correct cost from balance', async () => {
      const initialBalance = owner.balance;
      const cost = 2000;

      await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      const res = await request(app).get('/users/me').set(authHeader(ownerToken));

      expect(res.body.balance || res.body.user?.balance).toBe(initialBalance - cost);
    });

    it('applies modest one-time value boost and updates rent after upgrade', async () => {
      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.property.currentPrice).toBe(101000);
      expect(res.body.property.grade).toBe(2);
      expect(res.body.property.rent).toBeGreaterThan(0);
    });

    it('returns 400 if insufficient balance', async () => {
      const poor = await createAuthenticatedUser({ balance: 10 });
      const cheapProperty = await createTestProperty({
        cityId: city._id,
        ownerId: poor.user._id,
        currentPrice: 100000,
        basePrice: 100000,
        grade: 1,
        forSale: false,
      });

      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(poor.token))
        .send({ propertyId: cheapProperty._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Insufficient funds/);
    });

    it('returns 400 if already max grade', async () => {
      await Property.findByIdAndUpdate(property._id, { grade: 5 });

      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/maximum grade/);
    });

    it('returns 400 if not property owner', async () => {
      const { token: otherToken } = await createAuthenticatedUser({ balance: 100000 });
      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(otherToken))
        .send({ propertyId: property._id.toString() });

      expect(res.status).toBe(403);
    });

    it('creates a Transaction record', async () => {
      await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      const tx = await Transaction.findOne({
        propertyId: property._id,
        type: 'grade_upgrade',
      });

      expect(tx).toBeTruthy();
      expect(tx.price).toBe(2000);
      expect(tx.buyerId.toString()).toBe(owner._id.toString());
    });

    it('creates a Notification', async () => {
      await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      const notif = await Notification.findOne({
        userId: owner._id,
        type: 'system',
        title: 'Property Grade Upgraded',
      });

      expect(notif).toBeTruthy();
      expect(notif.message).toMatch(/Grade II/);
    });

    it('allows sequential upgrades through all grades', async () => {
      let currentProperty = property;

      for (let grade = 1; grade < 5; grade++) {
        await Property.findByIdAndUpdate(currentProperty._id, {
          lastGradeUpgradeAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        });

        const res = await request(app)
          .post('/properties/grade/upgrade')
          .set(authHeader(ownerToken))
          .send({ propertyId: currentProperty._id.toString() });

        expect(res.status).toBe(200);
        expect(res.body.grade).toBe(grade + 1);

        currentProperty = await Property.findById(currentProperty._id);
      }

      expect(currentProperty.grade).toBe(5);

      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: currentProperty._id.toString() });

      expect(res.status).toBe(400);
    });

    it('scales cost with property value', async () => {
      const expensiveProperty = await createTestProperty({
        cityId: city._id,
        ownerId: owner._id,
        currentPrice: 500000,
        basePrice: 500000,
        grade: 1,
        forSale: false,
      });

      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: expensiveProperty._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.upgradeCost).toBe(10000);
    });

    it('blocks upgrade during cooldown period', async () => {
      await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/cooldown/i);
      expect(res.body.cooldownRemaining).toBeGreaterThan(0);
      expect(res.body.nextAvailableAt).toBeTruthy();
    });

    it('returns cooldown info in grade endpoint', async () => {
      await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      const res = await request(app).get(`/properties/${property._id}/grade`).set(authHeader(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.lastUpgradeAt).toBeTruthy();
      expect(res.body.cooldownRemaining).toBeGreaterThan(0);
      expect(res.body.nextAvailableAt).toBeTruthy();
    });

    it('allows upgrade after cooldown expires', async () => {
      await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      await Property.findByIdAndUpdate(property._id, {
        lastGradeUpgradeAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });

      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.grade).toBe(3);
    });
  });
});
