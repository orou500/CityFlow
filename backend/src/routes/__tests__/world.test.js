import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import GameState from '../../models/GameState.js';
import { config } from '../../config/index.js';

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

  it('exposes the next world reset computed from the authoritative tick counter', async () => {
    const tickMs = config.tickIntervalMinutes * 60 * 1000;
    const lastTickAt = new Date('2026-08-15T12:00:00.000Z');
    await GameState.findOneAndUpdate({ key: 'global' }, { tickNumber: 100, lastTickAt }, { upsert: true });

    const res = await request(app).get('/world/status');
    expect(res.status).toBe(200);

    // Season length is 720 ticks; the reset fires when tickNumber reaches 720.
    const expectedReset = new Date(lastTickAt.getTime() + (720 - 100) * tickMs);
    expect(new Date(res.body.nextResetAt).getTime()).toBe(expectedReset.getTime());
    expect(res.body.seasonTicks).toBe(720);
    expect(res.body.currentCycle).toBe(100);
  });

  it('keeps nextResetAt in the future even mid-reset (tickNumber >= 720)', async () => {
    const tickMs = config.tickIntervalMinutes * 60 * 1000;
    const lastTickAt = new Date('2026-08-15T12:00:00.000Z');
    await GameState.findOneAndUpdate({ key: 'global' }, { tickNumber: 720, lastTickAt }, { upsert: true });

    const res = await request(app).get('/world/status');
    expect(res.status).toBe(200);
    const resetAt = new Date(res.body.nextResetAt).getTime();
    expect(resetAt).toBe(lastTickAt.getTime() + 720 * tickMs);
  });
});
