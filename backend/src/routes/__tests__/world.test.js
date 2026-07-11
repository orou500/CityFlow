import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';

const app = createApp();

describe('GET /world/status', () => {
  it('returns world status with required fields', async () => {
    const res = await request(app).get('/world/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentCycle');
    expect(res.body).toHaveProperty('nextUpdateAt');
    expect(typeof res.body.currentCycle).toBe('number');
    expect(new Date(res.body.nextUpdateAt).toString()).not.toBe('Invalid Date');
  });

  it('returns valid ISO date strings', async () => {
    const res = await request(app).get('/world/status');
    expect(res.status).toBe(200);
    expect(res.body.nextUpdateAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
