import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import {
  createAuthenticatedUser,
  createTestProperty,
  createTestCity,
  authHeader,
  setTestTick,
} from '../../test/helpers.js';
import Property from '../../models/Property.js';
import User from '../../models/User.js';
import Transaction from '../../models/Transaction.js';
import Notification from '../../models/Notification.js';
import Auction from '../../models/Auction.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import { processRedevelopments } from '../../engine/redevelopmentProcessing.js';

const app = createApp();

async function createOwnedBuilding(city, overrides = {}) {
  const { user, token } = await createAuthenticatedUser({ balance: 200_000_000, ...overrides.user });
  const property = await createTestProperty({
    ownerId: user._id,
    cityId: city?._id,
    type: 'apartment',
    currentPrice: 50_000_000,
    basePrice: 50_000_000,
    location: 'Downtown',
    forSale: false,
    ...overrides.property,
  });
  return { user, token, property };
}

describe('Property Demolition & Redevelopment', () => {
  let city;

  beforeEach(async () => {
    await setTestTick(500);
    city = await createTestCity({ avgPrice: 1_000_000, demandIndex: 1.0, name: `TestCity_${Date.now()}` });
  });

  describe('redeployment status route', () => {
    it('requires authentication', async () => {
      const { property } = await createOwnedBuilding(city);
      const res = await request(app).get(`/properties/${property._id}/redevelopment/status`);
      expect(res.status).toBe(401);
    });

    it('rejects non-owners', async () => {
      const { property } = await createOwnedBuilding(city);
      const stranger = await createAuthenticatedUser();
      const res = await request(app)
        .get(`/properties/${property._id}/redevelopment/status`)
        .set(authHeader(stranger.token));
      expect(res.status).toBe(403);
    });

    it('returns a demolition quote for an eligible building', async () => {
      const { token, property } = await createOwnedBuilding(city);
      const res = await request(app).get(`/properties/${property._id}/redevelopment/status`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('none');
      expect(res.body.eligibleForDemolition).toBe(true);
      expect(res.body.demolitionCost).toBeGreaterThan(0);
      expect(res.body.demolitionSalvage).toBeGreaterThan(0);
      expect(res.body.demolitionSalvage).toBeLessThan(property.currentPrice);
      // Properties without a recorded size surface a null landSize so the UI
      // never fabricates an area (buildings are generated without `size`).
      expect(res.body.landSize).toBeNull();
    });

    it('exposes the preserved plot size in the demolition quote', async () => {
      const { token, property } = await createOwnedBuilding(city, {
        property: { size: 20000 },
      });
      const res = await request(app).get(`/properties/${property._id}/redevelopment/status`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.landSize).toBe(20000);
    });

    it('flags a for-sale property as ineligible for demolition', async () => {
      const { token, property } = await createOwnedBuilding(city, {
        property: { forSale: true },
      });
      const res = await request(app).get(`/properties/${property._id}/redevelopment/status`).set(authHeader(token));
      expect(res.body.eligibleForDemolition).toBe(false);
    });
  });

  describe('demolish route', () => {
    it('demolishes a building into cleared land with correct economics', async () => {
      const { user, token, property } = await createOwnedBuilding(city);
      const beforeBalance = user.balance;
      const buildingValue = property.currentPrice;

      const res = await request(app).post(`/properties/${property._id}/demolish`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('land');

      const refreshed = await Property.findById(property._id);
      expect(refreshed.type).toBe('land');
      expect(refreshed.developmentLevel).toBe(0);
      expect(refreshed.redevelopment.status).toBe('land');
      expect(refreshed.name).toContain('Cleared Land');
      expect(refreshed.rent).toBe(0);
      expect(refreshed.condition).toBe(100);
      expect(refreshed.forSale).toBe(false);
      expect(refreshed.currentPrice).toBeLessThanOrEqual(buildingValue);
      expect(refreshed.ownerId.toString()).toBe(user._id.toString());

      const after = await User.findById(user._id);
      expect(after.lifetimeStats.totalDemolitions).toBe(1);
      expect(after.balance).not.toBe(beforeBalance);

      const tx = await Transaction.findOne({ propertyId: property._id, type: 'demolition' });
      expect(tx).toBeTruthy();

      const notif = await Notification.findOne({ eventKey: `redevelopment:${property._id}:demolished` });
      expect(notif).toBeTruthy();
    });

    it('preserves the entire plot size when demolishing', async () => {
      const { token, property } = await createOwnedBuilding(city, {
        property: { size: 20000 },
      });
      const res = await request(app).post(`/properties/${property._id}/demolish`).set(authHeader(token));
      expect(res.status).toBe(200);

      const refreshed = await Property.findById(property._id);
      expect(refreshed.type).toBe('land');
      expect(refreshed.size).toBe(20000);
    });

    it('enforces land + net cash <= building value (no net-worth exploit)', async () => {
      const { token, property } = await createOwnedBuilding(city);
      await Property.updateOne({ _id: property._id }, { $set: { currentPrice: 200_000_000, basePrice: 200_000_000 } });
      const buildingValue = 200_000_000;

      const res = await request(app).post(`/properties/${property._id}/demolish`).set(authHeader(token));
      expect(res.status).toBe(200);

      const refreshed = await Property.findById(property._id);
      // Player ends with: cleared-land value + net cash received. That must
      // never exceed the building they destroyed (this is the whole economy).
      expect(refreshed.currentPrice + res.body.netProceeds).toBeLessThanOrEqual(buildingValue);
    });

    it('rejects demolition when funds are insufficient (negative net)', async () => {
      const { user, token, property } = await createOwnedBuilding(city, {
        property: { currentPrice: 200_000, basePrice: 200_000 },
      });
      await User.updateOne({ _id: user._id }, { $set: { balance: 0 } });

      const res = await request(app).post(`/properties/${property._id}/demolish`).set(authHeader(token));
      expect([400, 409]).toContain(res.status);

      const refreshed = await Property.findById(property._id);
      expect(refreshed.type).toBe('apartment');
      expect(refreshed.redevelopment.status).toBe('none');
    });

    it('rejects buildings currently being redeveloped', async () => {
      const { token, property } = await createOwnedBuilding(city);
      await Property.updateOne(
        { _id: property._id },
        {
          $set: {
            type: 'land',
            developmentLevel: 1,
            'redevelopment.status': 'redeveloping',
            'redevelopment.completionTick': 600,
          },
        },
      );
      const res = await request(app).post(`/properties/${property._id}/demolish`).set(authHeader(token));
      expect(res.status).toBe(400);
    });

    it('rejects when the property is in a live auction', async () => {
      const { token, property } = await createOwnedBuilding(city);
      await Auction.create({
        propertyId: property._id,
        status: 'active',
        sellerType: 'player',
        startingBid: 1000,
        bidIncrement: 500,
        startTick: 500,
        endTick: 600,
        originalEndTick: 600,
      });
      const res = await request(app).post(`/properties/${property._id}/demolish`).set(authHeader(token));
      expect(res.status).toBe(400);
    });

    it('handles concurrent demolish attempts exactly once', async () => {
      const { token, property } = await createOwnedBuilding(city);
      const [a, b] = await Promise.all([
        request(app).post(`/properties/${property._id}/demolish`).set(authHeader(token)),
        request(app).post(`/properties/${property._id}/demolish`).set(authHeader(token)),
      ]);
      const codes = [a.status, b.status].sort();
      // One caller wins; the loser is either told the property is already
      // land (fresh re-read) or the atomic claim rejects them (409).
      expect(codes[0]).toBe(200);
      expect([400, 409]).toContain(codes[1]);
      const refreshed = await Property.findById(property._id);
      expect(refreshed.redevelopment.status).toBe('land');
      const txCount = await Transaction.countDocuments({ propertyId: property._id, type: 'demolition' });
      expect(txCount).toBe(1);
    });
  });

  describe('redevelop route', () => {
    async function clearedLand(user, overrides = {}) {
      return createTestProperty({
        ownerId: user._id,
        cityId: city._id,
        type: 'land',
        developmentLevel: 0,
        size: 20000,
        currentPrice: 500_000,
        basePrice: 500_000,
        forSale: false,
        redevelopment: {
          status: 'land',
          demolishedAtTick: 500,
          previousType: 'apartment',
        },
        ...overrides,
      });
    }

    it('starts a redevelopment and schedules completion by tick', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await clearedLand(user);
      const res = await request(app)
        .post(`/properties/${land._id}/redevelop`)
        .set(authHeader(token))
        .send({ projectType: 'apartment_building' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('redeveloping');

      const refreshed = await Property.findById(land._id);
      expect(refreshed.developmentLevel).toBe(1);
      expect(refreshed.forSale).toBe(false);
      expect(refreshed.type).toBe('land');
      expect(refreshed.redevelopment.status).toBe('redeveloping');
      expect(refreshed.redevelopment.completionTick).toBe(500 + refreshed.redevelopment.constructionPeriods);
      expect(refreshed.redevelopment.constructionCost).toBeGreaterThan(0);

      const tx = await Transaction.findOne({ propertyId: land._id, type: 'redevelopment' });
      expect(tx).toBeTruthy();
      const notif = await Notification.findOne({ eventKey: `redevelopment:${land._id}:started` });
      expect(notif).toBeTruthy();
    });

    it('rejects redevelopment of a building', async () => {
      const { token, property } = await createOwnedBuilding(city);
      const res = await request(app)
        .post(`/properties/${property._id}/redevelop`)
        .set(authHeader(token))
        .send({ projectType: 'apartment_building' });
      expect(res.status).toBe(400);
    });

    it('rejects redevelopment of land that is not cleared', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 100_000_000 });
      const land = await createTestProperty({
        ownerId: user._id,
        cityId: city._id,
        type: 'land',
        developmentLevel: 0,
        size: 20000,
        currentPrice: 100_000,
      });
      const res = await request(app)
        .post(`/properties/${land._id}/redevelop`)
        .set(authHeader(token))
        .send({ projectType: 'apartment_building' });
      expect(res.status).toBe(400);
    });

    it('rejects unknown project types', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 100_000_000 });
      const land = await clearedLand(user);
      const res = await request(app)
        .post(`/properties/${land._id}/redevelop`)
        .set(authHeader(token))
        .send({ projectType: 'not_a_project' });
      expect(res.status).toBe(400);
    });

    it('rejects when the plot is too small', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 100_000_000 });
      const land = await clearedLand(user, { size: 100 });
      const res = await request(app)
        .post(`/properties/${land._id}/redevelop`)
        .set(authHeader(token))
        .send({ projectType: 'apartment_building' });
      expect(res.status).toBe(400);
    });

    it('rejects with insufficient funds', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 0 });
      const land = await clearedLand(user);
      const res = await request(app)
        .post(`/properties/${land._id}/redevelop`)
        .set(authHeader(token))
        .send({ projectType: 'apartment_building' });
      expect(res.status).toBe(400);
    });

    it('charges the company treasury for company-owned land', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await clearedLand(user);
      const company = await RealEstateCompany.create({
        name: `RedevelopTest_${Date.now()}`,
        founderId: user._id,
        hqCityId: city._id,
        members: [{ userId: user._id, role: 'ceo', shares: 700 }],
        shares: { totalShares: 1000, treasuryShares: 300 },
        treasury: { balance: 100_000_000 },
        active: true,
      });
      await Property.updateOne(
        { _id: land._id },
        { $set: { ownerId: null, companyId: company._id, 'redevelopment.status': 'land' } },
      );

      const res = await request(app)
        .post(`/properties/${land._id}/redevelop`)
        .set(authHeader(token))
        .send({ projectType: 'apartment_building' });
      expect(res.status).toBe(201);

      const afterCompany = await RealEstateCompany.findById(company._id);
      expect(afterCompany.treasury.balance).toBeLessThan(100_000_000);

      const refreshed = await Property.findById(land._id);
      expect(refreshed.redevelopment.status).toBe('redeveloping');
      const notif = await Notification.findOne({
        eventKey: `redevelopment:${land._id}:started:${user._id}`,
      });
      expect(notif).toBeTruthy();
    });

    it('handles concurrent redevelop starts exactly once', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await clearedLand(user);
      const [a, b] = await Promise.all([
        request(app)
          .post(`/properties/${land._id}/redevelop`)
          .set(authHeader(token))
          .send({ projectType: 'apartment_building' }),
        request(app)
          .post(`/properties/${land._id}/redevelop`)
          .set(authHeader(token))
          .send({ projectType: 'apartment_building' }),
      ]);
      const codes = [a.status, b.status].sort();
      expect(codes[0]).toBe(201);
      expect([400, 409]).toContain(codes[1]);
      const refreshed = await Property.findById(land._id);
      expect(refreshed.redevelopment.status).toBe('redeveloping');
      const txCount = await Transaction.countDocuments({ propertyId: land._id, type: 'redevelopment' });
      expect(txCount).toBe(1);
    });
  });

  describe('blocked interactions', () => {
    it('blocks grade upgrade while redeveloping', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await createTestProperty({
        ownerId: user._id,
        cityId: city._id,
        type: 'land',
        developmentLevel: 1,
        size: 20000,
        forSale: false,
        redevelopment: { status: 'redeveloping', completionTick: 600 },
      });
      const res = await request(app)
        .post('/properties/grade/upgrade')
        .set(authHeader(token))
        .send({ propertyId: land._id });
      expect(res.status).toBe(400);
    });

    it('blocks rent change while redeveloping', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await createTestProperty({
        ownerId: user._id,
        cityId: city._id,
        type: 'land',
        developmentLevel: 1,
        forSale: false,
        redevelopment: { status: 'redeveloping', completionTick: 600 },
      });
      const res = await request(app)
        .post(`/management/${land._id}/rent`)
        .set(authHeader(token))
        .send({ rentPerUnit: 1000 });
      expect(res.status).toBe(400);
    });

    it('blocks creating an auction while redeveloping', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await createTestProperty({
        ownerId: user._id,
        cityId: city._id,
        type: 'land',
        developmentLevel: 1,
        forSale: false,
        redevelopment: { status: 'redeveloping', completionTick: 600 },
      });
      const res = await request(app)
        .post('/auctions')
        .set(authHeader(token))
        .send({ propertyId: land._id, auctionType: 'standard', duration: 'short', startingBid: 1000 });
      expect([400, 403]).toContain(res.status);
    });

    it('resets redevelopment status when cleared land is bought', async () => {
      const seller = await createAuthenticatedUser({ balance: 200_000_000 });
      const buyer = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await createTestProperty({
        ownerId: seller.user._id,
        cityId: city._id,
        type: 'land',
        developmentLevel: 0,
        forSale: true,
        currentPrice: 1_000_000,
        redevelopment: { status: 'land', demolishedAtTick: 500 },
      });
      const res = await request(app)
        .post('/properties/buy')
        .set(authHeader(buyer.token))
        .send({ propertyId: land._id });
      expect(res.status).toBe(200);
      const refreshed = await Property.findById(land._id);
      expect(refreshed.ownerId.toString()).toBe(buyer.user._id.toString());
      expect(refreshed.redevelopment.status).toBe('none');
    });
  });

  describe('engine completion', () => {
    it('finalizes a due redevelopment into a completed building', async () => {
      const { user } = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await createTestProperty({
        ownerId: user._id,
        cityId: city._id,
        type: 'land',
        developmentLevel: 1,
        size: 20000,
        forSale: false,
        redevelopment: {
          status: 'redeveloping',
          startedByUserId: user._id,
          startedTick: 500,
          completionTick: 501,
          projectType: 'apartment_building',
          projectName: 'Apartment Building',
          constructionCost: 7_200_000,
          constructionPeriods: 20,
        },
      });

      await setTestTick(501);
      const results = await processRedevelopments();
      const match = results.find((r) => r.propertyId.toString() === land._id.toString());
      expect(match.status).toBe('completed');

      const refreshed = await Property.findById(land._id);
      expect(refreshed.redevelopment.status).toBe('none');
      expect(refreshed.type).toBe('apartment');
      expect(refreshed.developmentLevel).toBe(2);
      expect(refreshed.units.length).toBeGreaterThan(0);
      expect(refreshed.rent).toBeGreaterThan(0);

      const notif = await Notification.findOne({ eventKey: `redevelopment:${land._id}:completed` });
      expect(notif).toBeTruthy();
    });

    it('does not finalize a redevelopment before its completion tick', async () => {
      const { user } = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await createTestProperty({
        ownerId: user._id,
        cityId: city._id,
        type: 'land',
        developmentLevel: 1,
        forSale: false,
        redevelopment: {
          status: 'redeveloping',
          completionTick: 700,
          projectType: 'apartment_building',
          projectName: 'Apartment Building',
          constructionCost: 50_000_000,
        },
      });
      const results = await processRedevelopments();
      expect(results.find((r) => r.propertyId.toString() === land._id.toString())).toBeUndefined();
      const refreshed = await Property.findById(land._id);
      expect(refreshed.redevelopment.status).toBe('redeveloping');
    });

    it('lazily completes via the status route once due', async () => {
      const { user, token } = await createAuthenticatedUser({ balance: 200_000_000 });
      const land = await createTestProperty({
        ownerId: user._id,
        cityId: city._id,
        type: 'land',
        developmentLevel: 1,
        size: 20000,
        forSale: false,
        redevelopment: {
          status: 'redeveloping',
          completionTick: 500,
          projectType: 'apartment_building',
          projectName: 'Apartment Building',
          constructionCost: 10_000_000,
          constructionPeriods: 20,
        },
      });

      const res = await request(app).get(`/properties/${land._id}/redevelopment/status`).set(authHeader(token));
      expect(res.status).toBe(200);
      const refreshed = await Property.findById(land._id);
      expect(refreshed.redevelopment.status).toBe('none');
    });
  });

  describe('model defaults', () => {
    it('defaults new properties to redevelopment.status none', async () => {
      const property = await createTestProperty({ cityId: city._id });
      expect(property.redevelopment.status).toBe('none');
      expect(property.redevelopment.constructionPeriods).toBe(0);
    });
  });
});
