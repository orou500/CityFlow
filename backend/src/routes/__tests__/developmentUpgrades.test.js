import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, createTestCity, authHeader } from '../../test/helpers.js';
import Property from '../../models/Property.js';
import Transaction from '../../models/Transaction.js';
import User from '../../models/User.js';
import {
  UPGRADE_TYPES,
  getUpgradePreview,
  calculateUpgradeCost,
  calculateUpgradeEffects,
} from '../../config/upgradeProjects.js';

const app = createApp();

describe('Development upgrade endpoints', () => {
  let owner, ownerToken, property, city;

  beforeEach(async () => {
    await Property.deleteMany({});
    await Transaction.deleteMany({});
    await User.deleteMany({});

    const result = await createAuthenticatedUser({ balance: 1000000 });
    owner = result.user;
    ownerToken = result.token;

    city = await createTestCity();
    property = await createTestProperty({
      cityId: city._id,
      ownerId: owner._id,
      currentPrice: 100000,
      basePrice: 100000,
      rent: 5000,
      condition: 70,
      type: 'apartment',
      forSale: false,
    });
  });

  describe('GET /development/upgrades/:propertyId', () => {
    it('returns upgrade options whose effects match the authoritative UPGRADE_TYPES config', async () => {
      const res = await request(app).get(`/development/upgrades/${property._id}`).set(authHeader(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.propertyValue).toBe(100000);
      expect(res.body.currentRent).toBe(5000);
      expect(res.body.upgrades).toHaveLength(Object.keys(UPGRADE_TYPES).length);

      for (const [type, def] of Object.entries(UPGRADE_TYPES)) {
        const preview = res.body.upgrades.find((u) => u.type === type);
        expect(preview, `missing upgrade preview for ${type}`).toBeDefined();
        expect(preview.level).toBe(1);
        expect(preview.cost).toBe(calculateUpgradeCost(type, 100000, 0));
        expect(preview.valueBoost).toBe(def.baseValueBoost);
        expect(preview.rentBoost).toBe(def.baseRentBoost);
        expect(preview.conditionBoost).toBe(def.conditionBoost);
        expect(preview.unitBoost).toBe(def.unitBoost);
        expect(preview.riskReduction).toBe(def.riskReduction);
        expect(preview.projectedValue).toBe(Math.round(100000 * (1 + def.baseValueBoost)));
        expect(preview.projectedRent).toBe(Math.round(5000 * (1 + def.baseRentBoost)));
        expect(preview.rentIncrease).toBe(Math.round(5000 * (1 + def.baseRentBoost)) - 5000);
      }
    });

    it('locks in the canonical level-0 renovation values shown in the UI (+2% value, +5% rent, +5 condition)', async () => {
      const res = await request(app).get(`/development/upgrades/${property._id}`).set(authHeader(ownerToken));
      const renovation = res.body.upgrades.find((u) => u.type === 'renovation');

      expect(renovation.cost).toBe(8000);
      expect(renovation.valueBoost).toBe(0.02);
      expect(renovation.rentBoost).toBe(0.05);
      expect(renovation.conditionBoost).toBe(5);
      expect(renovation.projectedValue).toBe(102000);
      expect(renovation.projectedRent).toBe(5250);
      expect(renovation.rentIncrease).toBe(250);
    });

    it('returns 403 for a non-owner', async () => {
      const { token: otherToken } = await createAuthenticatedUser({ balance: 100000 });
      const res = await request(app).get(`/development/upgrades/${property._id}`).set(authHeader(otherToken));
      expect(res.status).toBe(403);
    });

    it('returns 404 for a non-existent property', async () => {
      const fakeId = '507f1f77bcf86cd799439013';
      const res = await request(app).get(`/development/upgrades/${fakeId}`).set(authHeader(ownerToken));
      expect(res.status).toBe(404);
    });

    it('returns 400 for land', async () => {
      const land = await createTestProperty({
        cityId: city._id,
        ownerId: owner._id,
        basePrice: 50000,
        type: 'land',
      });
      const res = await request(app).get(`/development/upgrades/${land._id}`).set(authHeader(ownerToken));
      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get(`/development/upgrades/${property._id}`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /development/upgrade', () => {
    it('applies the exact config effects for a level-0 renovation', async () => {
      const res = await request(app)
        .post('/development/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id, upgradeType: 'renovation' });

      expect(res.status).toBe(200);
      expect(res.body.balance).toBe(992000);

      const updated = await Property.findById(property._id);
      expect(updated.currentPrice).toBe(102000);
      expect(updated.basePrice).toBe(101000);
      expect(updated.rent).toBe(5250);
      expect(updated.condition).toBe(75);
      expect(updated.upgradeLevel).toBe(1);
      expect(updated.upgrades).toHaveLength(1);
      expect(updated.upgrades[0].name).toBe('renovation');
      expect(updated.upgrades[0].effect).toMatchObject({
        valueBoost: 0.02,
        rentBoost: 0.05,
        conditionBoost: 5,
      });

      const tx = await Transaction.findOne({ type: 'upgrade', buyerId: owner._id });
      expect(tx).toBeTruthy();
      expect(tx.price).toBe(8000);
    });

    it('matches the effects shown in the upgrade preview', async () => {
      const previewRes = await request(app).get(`/development/upgrades/${property._id}`).set(authHeader(ownerToken));
      const preview = previewRes.body.upgrades.find((u) => u.type === 'luxury');
      const expectedEffects = calculateUpgradeEffects('luxury', 0);

      const applyRes = await request(app)
        .post('/development/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id, upgradeType: 'luxury' });

      expect(applyRes.status).toBe(200);
      const updated = await Property.findById(property._id);
      expect(updated.currentPrice).toBe(Math.round(100000 * (1 + expectedEffects.valueBoost)));
      expect(updated.rent).toBe(Math.round(5000 * (1 + expectedEffects.rentBoost)));
      expect(updated.condition).toBe(70 + expectedEffects.conditionBoost);
      expect(preview.projectedValue).toBe(updated.currentPrice);
    });

    it('returns 400 for insufficient funds', async () => {
      owner.balance = 0;
      await owner.save();

      const res = await request(app)
        .post('/development/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id, upgradeType: 'renovation' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid upgrade type', async () => {
      const res = await request(app)
        .post('/development/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: property._id, upgradeType: 'bogus' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for land', async () => {
      const land = await createTestProperty({
        cityId: city._id,
        ownerId: owner._id,
        basePrice: 50000,
        type: 'land',
      });
      const res = await request(app)
        .post('/development/upgrade')
        .set(authHeader(ownerToken))
        .send({ propertyId: land._id, upgradeType: 'renovation' });

      expect(res.status).toBe(400);
    });

    it('returns 403 for a non-owner', async () => {
      const { token: otherToken } = await createAuthenticatedUser({ balance: 100000 });
      const res = await request(app)
        .post('/development/upgrade')
        .set(authHeader(otherToken))
        .send({ propertyId: property._id, upgradeType: 'renovation' });

      expect(res.status).toBe(403);
    });
  });

  describe('getUpgradePreview consistency', () => {
    it('returns null for unknown types', () => {
      expect(getUpgradePreview('bogus', 100000, 5000, 0)).toBeNull();
    });
  });
});
