import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createAuthenticatedAdmin, authHeader } from '../../test/helpers.js';
import { config } from '../../config/index.js';
import RewardedAdSession from '../../models/RewardedAdSession.js';
import RewardedAdConfig from '../../models/RewardedAdConfig.js';
import Transaction from '../../models/Transaction.js';
import User from '../../models/User.js';
import AdminAuditLog from '../../models/AdminAuditLog.js';

const app = createApp();

const ORIGINAL = {
  enabled: config.rewardedAds.enabled,
  vastUrl: config.rewardedAds.vastUrl,
};

async function seedSession({
  user,
  status = 'completed',
  impressions = 1,
  attempts = 1,
  failed = 0,
  rewardAmount = 2000,
  daysAgo = 0,
}) {
  const createdAt = new Date(Date.now() - daysAgo * 86400000);
  return RewardedAdSession.create({
    userId: user._id,
    status,
    vastUrl: 'https://ads.example.com/vast.xml',
    rewardAmount,
    expiresAt: new Date(createdAt.getTime() + 10 * 60000),
    impressions,
    completionAttemptCount: attempts,
    failedCompletionCount: failed,
    createdAt,
    ...(status === 'completed' ? { completedAt: createdAt } : {}),
  });
}

describe('Admin rewarded-ads analytics', () => {
  beforeEach(async () => {
    await RewardedAdSession.deleteMany({});
    await RewardedAdConfig.deleteMany({});
    await Transaction.deleteMany({});
    await AdminAuditLog.deleteMany({});
    await User.deleteMany({});
    config.rewardedAds.enabled = true;
    config.rewardedAds.vastUrl = 'https://ads.example.com/vast.xml';
  });

  afterEach(() => {
    config.rewardedAds.enabled = ORIGINAL.enabled;
    config.rewardedAds.vastUrl = ORIGINAL.vastUrl;
  });

  describe('auth', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/admin/rewarded-ads/dashboard');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin users', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app).get('/admin/rewarded-ads/dashboard').set(authHeader(token));
      expect(res.status).toBe(403);
    });

    it('allows admins', async () => {
      const { token } = await createAuthenticatedAdmin();
      const res = await request(app).get('/admin/rewarded-ads/dashboard').set(authHeader(token));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /admin/rewarded-ads/dashboard', () => {
    it('returns summary across all ranges with defaults when empty', async () => {
      const { token } = await createAuthenticatedAdmin();
      const res = await request(app).get('/admin/rewarded-ads/dashboard').set(authHeader(token));
      expect(res.status).toBe(200);
      for (const r of ['today', '7d', '30d', 'all']) {
        expect(res.body.ranges[r]).toBeDefined();
        expect(res.body.ranges[r].totalSessions).toBe(0);
        expect(res.body.ranges[r].impressions).toBe(0);
        expect(res.body.ranges[r].completed).toBe(0);
        expect(res.body.ranges[r].completionRate).toBe(null);
        expect(res.body.ranges[r].estimatedRevenue).toBe(0);
      }
      expect(res.body.estimatedCpm).toBe(2);
      expect(res.body.enabled).toBe(true);
      expect(res.body.limits).toBeDefined();
      expect(res.body.provider.provider).toBe('HilltopAds');
      // never leaks the VAST url or any credentials
      expect(JSON.stringify(res.body).includes('ads.example.com')).toBe(false);
      expect(res.body.provider.publisherDashboardUrl).toMatch(/^https:/);
    });

    it('computes CPM-based estimated revenue and completion rate', async () => {
      const { user, token } = await createAuthenticatedAdmin();
      await seedSession({ user, status: 'completed', impressions: 1000, attempts: 2, failed: 1, daysAgo: 0 });
      await seedSession({ user, status: 'expired', impressions: 0, attempts: 0, daysAgo: 0 });

      const res = await request(app).get('/admin/rewarded-ads/dashboard').set(authHeader(token));
      expect(res.status).toBe(200);
      const today = res.body.ranges.today;
      expect(today.totalSessions).toBe(2);
      expect(today.impressions).toBe(1000);
      expect(today.completionAttempts).toBe(2);
      expect(today.failedCompletions).toBe(1);
      expect(today.completed).toBe(1);
      expect(today.rewarded).toBe(1);
      // 1000 impressions / 1000 * $2 CPM = $2.00
      expect(today.estimatedRevenue).toBe(2);
      // 1 completed / 2 attempts = 50%
      expect(today.completionRate).toBe(50);
      // 30d window includes the same (created today)
      expect(res.body.ranges['30d'].impressions).toBe(1000);
    });

    it('excludes sessions older than the selected window', async () => {
      const { user, token } = await createAuthenticatedAdmin();
      await seedSession({ user, status: 'completed', impressions: 500, attempts: 1, daysAgo: 10 });
      const res = await request(app).get('/admin/rewarded-ads/dashboard').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.ranges.today.totalSessions).toBe(0);
      expect(res.body.ranges.today.impressions).toBe(0);
      expect(res.body.ranges['7d'].impressions).toBe(0);
      expect(res.body.ranges['30d'].impressions).toBe(500);
      expect(res.body.ranges.all.impressions).toBe(500);
    });

    it('reflects the persisted CPM in estimated revenue', async () => {
      const { token } = await createAuthenticatedAdmin();
      await request(app).put('/admin/rewarded-ads/config').set(authHeader(token)).send({ estimatedCpm: 5 });
      const { user } = await createAuthenticatedAdmin();
      await seedSession({ user, status: 'completed', impressions: 1000, attempts: 1, daysAgo: 0 });
      const res = await request(app).get('/admin/rewarded-ads/dashboard').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.estimatedCpm).toBe(5);
      expect(res.body.ranges.today.estimatedRevenue).toBe(5);
    });

    it('summarizes real rewarded spend from transactions', async () => {
      const { user, token } = await createAuthenticatedAdmin();
      await Transaction.create({ buyerId: user._id, type: 'rewarded_ad', price: 2000, createdAt: new Date() });
      await Transaction.create({
        buyerId: user._id,
        type: 'rewarded_ad',
        price: 1000,
        createdAt: new Date(Date.now() - 20 * 86400000),
      });
      const res = await request(app).get('/admin/rewarded-ads/dashboard').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.spend.today).toBe(2000);
      expect(res.body.spend['7d']).toBe(2000);
      expect(res.body.spend['30d']).toBe(3000);
      expect(res.body.spend.all).toBe(3000);
    });
  });

  describe('GET /admin/rewarded-ads/daily', () => {
    it('returns a filled series across N days', async () => {
      const { user, token } = await createAuthenticatedAdmin();
      await seedSession({ user, status: 'completed', impressions: 3, attempts: 1, daysAgo: 0 });
      const res = await request(app).get('/admin/rewarded-ads/daily?days=7').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.days).toBe(7);
      expect(res.body.points).toHaveLength(7);
      const today = res.body.points[res.body.points.length - 1];
      expect(today.sessions).toBe(1);
      expect(today.impressions).toBe(3);
    });

    it('rejects invalid day windows', async () => {
      const { token } = await createAuthenticatedAdmin();
      const res = await request(app).get('/admin/rewarded-ads/daily?days=10').set(authHeader(token));
      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/rewarded-ads/sessions', () => {
    it('returns paginated recent sessions with usernames', async () => {
      const { user, token } = await createAuthenticatedAdmin();
      await seedSession({ user, status: 'completed' });
      await seedSession({ user, status: 'expired' });
      const res = await request(app).get('/admin/rewarded-ads/sessions').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.sessions).toHaveLength(2);
      expect(res.body.sessions[0].user).toBe(user.username);
      expect(res.body.sessions[0].impressions).toBe(1);
      expect(res.body.sessions[0].completionAttempts).toBe(1);
    });

    it('filters by status', async () => {
      const { user, token } = await createAuthenticatedAdmin();
      await seedSession({ user, status: 'completed' });
      await seedSession({ user, status: 'expired' });
      const res = await request(app).get('/admin/rewarded-ads/sessions?status=completed').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.sessions[0].status).toBe('completed');
    });
  });

  describe('GET/PUT /admin/rewarded-ads/config', () => {
    it('GET returns the stored CPM', async () => {
      const { token } = await createAuthenticatedAdmin();
      const res = await request(app).get('/admin/rewarded-ads/config').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.estimatedCpm).toBe(2);
      expect(JSON.stringify(res.body).includes('vast')).toBe(false);
    });

    it('PUT persists the CPM and audits the change', async () => {
      const { token } = await createAuthenticatedAdmin();
      const res = await request(app)
        .put('/admin/rewarded-ads/config')
        .set(authHeader(token))
        .send({ estimatedCpm: 4.5 });
      expect(res.status).toBe(200);
      expect(res.body.estimatedCpm).toBe(4.5);

      const get = await request(app).get('/admin/rewarded-ads/config').set(authHeader(token));
      expect(get.body.estimatedCpm).toBe(4.5);

      const audit = await AdminAuditLog.find({ action: 'rewarded_ads_config_updated' });
      expect(audit).toHaveLength(1);
      expect(audit[0].details.estimatedCpm).toBe(4.5);
    });

    it('PUT rejects invalid CPM values', async () => {
      const { token } = await createAuthenticatedAdmin();
      const res = await request(app)
        .put('/admin/rewarded-ads/config')
        .set(authHeader(token))
        .send({ estimatedCpm: -1 });
      expect(res.status).toBe(400);
    });

    it('non-admin cannot update config', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app).put('/admin/rewarded-ads/config').set(authHeader(token)).send({ estimatedCpm: 3 });
      expect(res.status).toBe(403);
    });
  });
});
