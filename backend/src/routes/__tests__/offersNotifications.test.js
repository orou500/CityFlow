import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import Property from '../../models/Property.js';
import PropertyOffer from '../../models/PropertyOffer.js';
import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import Transaction from '../../models/Transaction.js';

const app = createApp();

describe('offer notifications deep-link to the property Offers section', () => {
  let seller, sellerToken, buyer, buyerToken, property;

  beforeEach(async () => {
    await Property.deleteMany({});
    await PropertyOffer.deleteMany({});
    await Notification.deleteMany({});
    await User.deleteMany({});
    await Transaction.deleteMany({});

    const city = await createTestCity();
    const sellerRes = await createAuthenticatedUser({ balance: 1000000 });
    seller = sellerRes.user;
    sellerToken = sellerRes.token;
    const buyerRes = await createAuthenticatedUser({ balance: 1000000 });
    buyer = buyerRes.user;
    buyerToken = buyerRes.token;

    property = await Property.create({
      cityId: city._id,
      name: `OfferProp_${Date.now()}`,
      type: 'apartment',
      basePrice: 100000,
      currentPrice: 100000,
      ownerId: seller._id,
    });
  });

  it('property_offer notification carries property route + entity metadata', async () => {
    await request(app)
      .post('/offers/create')
      .set(authHeader(buyerToken))
      .send({ propertyId: property._id.toString(), amount: 80000 });

    const notification = await Notification.findOne({ userId: seller._id, type: 'property_offer' }).lean();
    expect(notification).toBeTruthy();
    expect(notification.route).toBe(`/property/${property._id}?section=offers`);
    expect(notification.tab).toBe('offers');
    expect(notification.entityType).toBe('property');
    expect(notification.entityId.toString()).toBe(property._id.toString());
  });

  it('offer_rejected notification deep-links the property for the buyer', async () => {
    const offer = await PropertyOffer.create({
      propertyId: property._id,
      sellerId: seller._id,
      buyerId: buyer._id,
      offerAmount: 80000,
    });

    await request(app).post(`/offers/reject/${offer._id}`).set(authHeader(sellerToken));

    const notification = await Notification.findOne({ userId: buyer._id, type: 'offer_rejected' }).lean();
    expect(notification).toBeTruthy();
    expect(notification.route).toBe(`/property/${property._id}?section=offers`);
    expect(notification.entityId.toString()).toBe(property._id.toString());
  });

  it('offer_accepted notification deep-links the property for the buyer', async () => {
    const offer = await PropertyOffer.create({
      propertyId: property._id,
      sellerId: seller._id,
      buyerId: buyer._id,
      offerAmount: 80000,
    });

    await request(app).post(`/offers/accept/${offer._id}`).set(authHeader(sellerToken));

    const notification = await Notification.findOne({ userId: buyer._id, type: 'offer_accepted' }).lean();
    expect(notification).toBeTruthy();
    expect(notification.route).toBe(`/property/${property._id}?section=offers`);
  });

  it('received offers are persisted and readable for the owner (page refresh/logout-safe)', async () => {
    await request(app)
      .post('/offers/create')
      .set(authHeader(buyerToken))
      .send({ propertyId: property._id.toString(), amount: 80000 });

    const received = await request(app).get('/offers/received').set(authHeader(sellerToken));
    expect(received.status).toBe(200);
    expect(received.body.some((o) => o.propertyId?._id?.toString() === property._id.toString())).toBe(true);
    expect(received.body[0].status).toBe('pending');
  });
});
