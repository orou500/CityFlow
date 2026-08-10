import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader, generateToken } from '../../test/helpers.js';
import User from '../../models/User.js';

const app = createApp();

describe('lastLoginAt tracking', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('updates lastLoginAt on a successful login', async () => {
    const { user } = await createAuthenticatedUser({ lastLoginAt: null });

    const res = await request(app).post('/auth/login').send({ login: user.username, password: 'Password123' });
    expect(res.status).toBe(200);

    const updated = await User.findById(user._id);
    expect(updated.lastLoginAt).not.toBeNull();
  });

  it('does not update lastLoginAt on a failed login attempt', async () => {
    const { user } = await createAuthenticatedUser({ lastLoginAt: null });

    const res = await request(app).post('/auth/login').send({ login: user.username, password: 'wrong-password' });
    expect(res.status).toBe(401);

    const updated = await User.findById(user._id);
    expect(updated.lastLoginAt).toBeNull();
  });

  it('does not update lastLoginAt merely by using a token (authenticated request)', async () => {
    const { user, token } = await createAuthenticatedUser({ lastLoginAt: null });

    const res = await request(app).get('/users/me').set(authHeader(token));
    expect(res.status).toBe(200);

    const updated = await User.findById(user._id);
    expect(updated.lastLoginAt).toBeNull();
  });

  it('is not exposed for other users in public profiles', async () => {
    const { user } = await createAuthenticatedUser({ lastLoginAt: new Date('2026-01-01T00:00:00Z') });
    const { token } = await createAuthenticatedUser();

    const res = await request(app).get(`/users/${user.username}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user.lastLoginAt).toBeUndefined();
    expect(res.body.user.lastDailyLogin).toBeUndefined();
  });

  it('is returned to the user themselves via /users/me', async () => {
    const { user, token } = await createAuthenticatedUser({ lastLoginAt: new Date('2026-01-01T00:00:00Z') });
    const res = await request(app).get('/users/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user.lastLoginAt).toBeDefined();
  });
});
