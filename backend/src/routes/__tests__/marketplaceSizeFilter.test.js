import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createTestProperty, createTestCity } from '../../test/helpers.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';

const app = createApp();

describe('Marketplace size filter', () => {
  beforeEach(async () => {
    await Property.deleteMany({});
    await City.deleteMany({});
  });

  it('returns all properties when no size filter is applied', async () => {
    const city = await createTestCity();
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 500 });
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 5000 });
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 15000 });

    const res = await request(app).get('/properties').query({ forSale: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  it('filters by minimum size', async () => {
    const city = await createTestCity();
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 500 });
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 5000 });
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 15000 });

    const res = await request(app).get('/properties').query({ forSale: 'true', minSize: '5000' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.properties.every((p) => p.size >= 5000)).toBe(true);
  });

  it('filters by maximum size', async () => {
    const city = await createTestCity();
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 500 });
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 5000 });
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 15000 });

    const res = await request(app).get('/properties').query({ forSale: 'true', maxSize: '5000' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.properties.every((p) => p.size <= 5000)).toBe(true);
  });

  it('filters by both minimum and maximum size', async () => {
    const city = await createTestCity();
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 500 });
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 5000 });
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 15000 });

    const res = await request(app).get('/properties').query({ forSale: 'true', minSize: '1000', maxSize: '10000' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.properties[0].size).toBe(5000);
  });

  it('excludes properties without a size when a size filter is applied', async () => {
    const city = await createTestCity();
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000 });
    await createTestProperty({ cityId: city._id, forSale: true, currentPrice: 100000, basePrice: 100000, size: 8000 });

    const res = await request(app).get('/properties').query({ forSale: 'true', minSize: '1000' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.properties[0].size).toBe(8000);
  });
});
