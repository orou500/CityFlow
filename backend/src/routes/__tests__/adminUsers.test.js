import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedAdmin, createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';
import Transaction from '../../models/Transaction.js';
import Notification from '../../models/Notification.js';
import AdminAuditLog from '../../models/AdminAuditLog.js';

const app = createApp();

async function makeUser(name, overrides = {}) {
  return User.create({
    username: name,
    normalizedUsername: name.toLowerCase(),
    email: `${name}@test.com`,
    password: 'password123',
    ...overrides,
  });
}

describe('Admin users endpoints', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await Notification.deleteMany({});
    await AdminAuditLog.deleteMany({});
  });

  describe('GET /admin/users', () => {
    it('returns 401 without authentication', async () => {
      const res = await request(app).get('/admin/users');
      expect(res.status).toBe(401);
    });

    it('returns 403 for regular users', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app).get('/admin/users').set(authHeader(token));
      expect(res.status).toBe(403);
    });

    it('paginates server-side with total count', async () => {
      const { token } = await createAuthenticatedAdmin();
      for (let i = 0; i < 30; i++) {
        await makeUser(`pag${i}`);
      }

      const res = await request(app).get('/admin/users?page=2&limit=10').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(10);
      expect(res.body.total).toBe(31); // 30 + the admin
      expect(res.body.page).toBe(2);
      expect(res.body.totalPages).toBe(4);
    });

    it('searches server-side', async () => {
      const { token } = await createAuthenticatedAdmin();
      await makeUser('alice');
      await makeUser('bob');

      const res = await request(app).get('/admin/users?search=alice').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.users[0].username).toBe('alice');
    });

    it('strips sensitive fields and includes lastLoginAt', async () => {
      const { token } = await createAuthenticatedAdmin();
      await makeUser('sec_user', { lastLoginAt: new Date() });

      const res = await request(app).get('/admin/users').set(authHeader(token));
      const found = res.body.users.find((u) => u.username === 'sec_user');
      expect(found).toBeDefined();
      expect(found.lastLoginAt).toBeDefined();
      expect(found.password).toBeUndefined();
      expect(found.passwordResetToken).toBeUndefined();
      expect(found.verificationToken).toBeUndefined();
      expect(found.pushTokens).toBeUndefined();
      expect(found.discordId).toBeUndefined();
    });

    it('filters deleted users with deleted=true', async () => {
      const { token } = await createAuthenticatedAdmin();
      await makeUser('gone_user', { deletedAt: new Date() });
      await makeUser('active_user');

      const res = await request(app).get('/admin/users?deleted=true').set(authHeader(token));
      expect(res.body.total).toBe(1);
      expect(res.body.users[0].username).toBe('gone_user');
    });
  });

  describe('GET /admin/users/:id', () => {
    it('returns 404 for unknown user', async () => {
      const { token } = await createAuthenticatedAdmin();
      const res = await request(app).get('/admin/users/507f1f77bcf86cd799439011').set(authHeader(token));
      expect(res.status).toBe(404);
    });

    it('returns user detail with lastLoginAt and stats', async () => {
      const { token } = await createAuthenticatedAdmin();
      const target = await makeUser('detail_user', { lastLoginAt: new Date('2026-01-02T03:04:05Z') });
      await Transaction.create({ buyerId: target._id, price: 10000, type: 'buy' });

      const res = await request(app).get(`/admin/users/${target._id}`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('detail_user');
      expect(res.body.user.lastLoginAt).toBeDefined();
      expect(res.body.user.transactionCount).toBe(1);
      expect(res.body.user.password).toBeUndefined();
    });
  });

  describe('GET /admin/users/:id/activity', () => {
    it('returns 403 for regular users', async () => {
      const { user, token } = await createAuthenticatedUser();
      const res = await request(app).get(`/admin/users/${user._id}/activity`).set(authHeader(token));
      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid user id', async () => {
      const { token } = await createAuthenticatedAdmin();
      const res = await request(app).get('/admin/users/not-an-id/activity').set(authHeader(token));
      expect(res.status).toBe(400);
    });

    it('aggregates events from existing systems', async () => {
      const { user: admin, token } = await createAuthenticatedAdmin();
      const target = await makeUser('log_user');
      await Transaction.create({ buyerId: target._id, price: 50000, type: 'buy' });
      await Notification.create({
        userId: target._id,
        type: 'mission_complete',
        title: 'Mission Complete!',
        message: 'You completed "X"',
        entityType: 'mission',
      });
      await AdminAuditLog.create({
        adminId: admin._id,
        adminUsername: admin.username,
        action: 'user_balance_changed',
        targetUserId: target._id,
        targetUsername: target.username,
        details: { previous: 0, new: 500 },
      });

      const res = await request(app).get(`/admin/users/${target._id}/activity`).set(authHeader(token));
      expect(res.status).toBe(200);
      const categories = res.body.logs.map((l) => l.category);
      expect(categories).toContain('market');
      expect(categories).toContain('missions');
      expect(categories).toContain('admin');
      expect(categories).toContain('account'); // registration event
      expect(res.body.total).toBe(4);
      expect(res.body.logs).toHaveLength(4);
    });

    it('filters by category', async () => {
      const { token } = await createAuthenticatedAdmin();
      const target = await makeUser('filter_user');
      await Transaction.create({ buyerId: target._id, price: 10000, type: 'rent' });

      const res = await request(app).get(`/admin/users/${target._id}/activity?category=rent`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.logs[0].category).toBe('rent');
    });

    it('paginates the merged log', async () => {
      const { token } = await createAuthenticatedAdmin();
      const target = await makeUser('page_user');
      for (let i = 0; i < 5; i++) {
        await Transaction.create({ buyerId: target._id, price: i * 1000, type: 'buy' });
      }

      const res = await request(app).get(`/admin/users/${target._id}/activity?page=2&limit=2`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(2);
      expect(res.body.total).toBe(6); // 5 transactions + registration
      expect(res.body.page).toBe(2);
      expect(res.body.totalPages).toBe(3);
    });

    it('searches the merged log', async () => {
      const { token } = await createAuthenticatedAdmin();
      const target = await makeUser('search_user');
      await Transaction.create({ buyerId: target._id, price: 10000, type: 'rent' });
      await Transaction.create({ buyerId: target._id, price: 5000, type: 'buy' });

      const res = await request(app).get(`/admin/users/${target._id}/activity?search=rent`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBe(1);
      expect(res.body.logs[0].description).toMatch(/rent/i);
    });
  });

  describe('Admin audit logging', () => {
    it('records balance changes with before/after values', async () => {
      const { user: admin, token } = await createAuthenticatedAdmin();
      const target = await makeUser('audit_user', { balance: 1000 });

      const res = await request(app)
        .put(`/admin/users/${target._id}/balance`)
        .set(authHeader(token))
        .send({ balance: 5000 });
      expect(res.status).toBe(200);

      const logs = await AdminAuditLog.find({ targetUserId: target._id });
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('user_balance_changed');
      expect(logs[0].adminUsername).toBe(admin.username);
      expect(logs[0].details.previous).toBe(1000);
      expect(logs[0].details.new).toBe(5000);
    });

    it('records ban toggles', async () => {
      const { token } = await createAuthenticatedAdmin();
      const target = await makeUser('ban_user');

      await request(app).put(`/admin/users/${target._id}/ban`).set(authHeader(token));
      const logs = await AdminAuditLog.find({ targetUserId: target._id });
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('user_banned');
    });
  });
});
