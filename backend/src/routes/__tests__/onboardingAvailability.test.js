import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import Property from '../../models/Property.js';
import User from '../../models/User.js';
import City from '../../models/City.js';

const app = createApp();

async function makeBuyableProperty({ price, ownerId = null } = {}) {
  const city = await createTestCity();
  return Property.create({
    cityId: city._id,
    name: `CheapProp_${Date.now()}_${Math.random()}`,
    type: 'apartment',
    basePrice: price,
    currentPrice: price,
    forSale: true,
    ...(ownerId ? { ownerId } : {}),
  });
}

describe('onboarding buy-property availability (<= $100k inventory)', () => {
  beforeEach(async () => {
    await Property.deleteMany({});
    await User.deleteMany({});
    await City.deleteMany({});
  });

  it('reports eligible when a buyable property under $100k exists', async () => {
    const { token } = await createAuthenticatedUser({ balance: 1000000 });
    await makeBuyableProperty({ price: 85000 });

    const res = await request(app).get('/onboarding/tour/buy-property-availability').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it('reports no inventory when nothing under $100k exists (fallback path)', async () => {
    const { token } = await createAuthenticatedUser({ balance: 1000000 });
    await makeBuyableProperty({ price: 150000 });

    const res = await request(app).get('/onboarding/tour/buy-property-availability').set(authHeader(token));
    expect(res.body.eligible).toBe(false);
    expect(res.body.count).toBe(0);
  });

  it('excludes properties the player already owns and ones under construction', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 1000000 });
    await makeBuyableProperty({ price: 50000, ownerId: user._id });
    const other = await makeBuyableProperty({ price: 60000 });
    await Property.updateOne(
      { _id: other._id },
      { $set: { activeImprovement: { improvementId: 'x', name: 'build', progress: 10 } } },
    );

    const res = await request(app).get('/onboarding/tour/buy-property-availability').set(authHeader(token));
    expect(res.body.eligible).toBe(false);
  });

  it('never creates properties and never lists non-for-sale inventory', async () => {
    const { token } = await createAuthenticatedUser({ balance: 1000000 });
    await makeBuyableProperty({ price: 70000 });
    await Property.updateOne({}, { $set: { forSale: false } });

    const res = await request(app).get('/onboarding/tour/buy-property-availability').set(authHeader(token));
    expect(res.body.eligible).toBe(false);
    expect(await Property.countDocuments()).toBe(1);
  });
});
