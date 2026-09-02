import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import { config } from '../../config/index.js';
import RewardedAdSession from '../../models/RewardedAdSession.js';
import User from '../../models/User.js';
import Transaction from '../../models/Transaction.js';
import Notification from '../../models/Notification.js';

const app = createApp();

const ORIGINAL = {
  enabled: config.rewardedAds.enabled,
  vastUrl: config.rewardedAds.vastUrl,
  rewardAmount: config.rewardedAds.rewardAmount,
  cooldownMinutes: config.rewardedAds.cooldownMinutes,
  dailyLimit: config.rewardedAds.dailyLimit,
  sessionTtlMinutes: config.rewardedAds.sessionTtlMinutes,
};

const VAST_XML = '<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"></VAST>';

function mockAdSourceResponse() {
  globalThis.fetch = async () =>
    new Response(VAST_XML, {
      status: 200,
      headers: { 'content-type': 'text/xml' },
    });
}

function restoreAdSource() {
  delete globalThis.fetch;
}

async function startSession(token, expectedStatus = 200) {
  const res = await request(app).post('/rewarded-ads/start').set(authHeader(token));
  expect(res.status).toBe(expectedStatus);
  return res;
}

describe('Rewarded ads endpoints', () => {
  beforeEach(async () => {
    await RewardedAdSession.deleteMany({});
    await Transaction.deleteMany({});
    await Notification.deleteMany({});
    await User.deleteMany({});
    config.rewardedAds.enabled = true;
    config.rewardedAds.vastUrl = 'https://ads.example.com/vast.xml';
    config.rewardedAds.rewardAmount = 2000;
    config.rewardedAds.cooldownMinutes = 5;
    config.rewardedAds.dailyLimit = 10;
    config.rewardedAds.sessionTtlMinutes = 10;
  });

  afterEach(() => {
    config.rewardedAds.enabled = ORIGINAL.enabled;
    config.rewardedAds.vastUrl = ORIGINAL.vastUrl;
    config.rewardedAds.rewardAmount = ORIGINAL.rewardAmount;
    config.rewardedAds.cooldownMinutes = ORIGINAL.cooldownMinutes;
    config.rewardedAds.dailyLimit = ORIGINAL.dailyLimit;
    config.rewardedAds.sessionTtlMinutes = ORIGINAL.sessionTtlMinutes;
    restoreAdSource();
  });

  describe('GET /rewarded-ads/config', () => {
    it('returns public flags without auth and never leaks the VAST url', async () => {
      const res = await request(app).get('/rewarded-ads/config');
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
      expect(res.body.rewardAmount).toBe(2000);
      expect(res.body.cooldownSeconds).toBe(300);
      expect(res.body.dailyLimit).toBe(10);
      expect(res.body.vastUrl).toBeUndefined();
    });

    it('reflects the disabled state', async () => {
      config.rewardedAds.enabled = false;
      const res = await request(app).get('/rewarded-ads/config');
      expect(res.body.enabled).toBe(false);
    });
  });

  describe('GET /rewarded-ads/status', () => {
    it('requires auth', async () => {
      const res = await request(app).get('/rewarded-ads/status');
      expect(res.status).toBe(401);
    });

    it('reports daily usage and cooldown', async () => {
      const { user, token } = await createAuthenticatedUser();

      await RewardedAdSession.create({
        userId: user._id,
        status: 'completed',
        vastUrl: config.rewardedAds.vastUrl,
        rewardAmount: 2000,
        expiresAt: new Date(Date.now() + 10000),
        completedAt: new Date(),
      });

      const res = await request(app).get('/rewarded-ads/status').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
      expect(res.body.dailyUsed).toBe(1);
      expect(res.body.dailyLimit).toBe(10);
      expect(res.body.cooldownRemainingMs).toBeGreaterThan(0);
    });
  });

  describe('POST /rewarded-ads/start', () => {
    it('requires auth', async () => {
      const res = await request(app).post('/rewarded-ads/start');
      expect(res.status).toBe(401);
    });

    it('returns 503 when ads are disabled', async () => {
      config.rewardedAds.enabled = false;
      const { token } = await createAuthenticatedUser();
      const res = await startSession(token, 503);
      expect(res.body.error).toMatch(/not available/i);
    });

    it('creates a pending session with a server snapshot (no VAST url exposed)', async () => {
      const { user, token } = await createAuthenticatedUser();
      const res = await startSession(token);
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.status).toBe('pending');
      expect(res.body.rewardAmount).toBe(2000);
      expect(res.body.expiresAt).toBeDefined();
      expect(res.body.vastUrl).toBeUndefined();

      const session = await RewardedAdSession.findById(res.body.sessionId);
      expect(session.userId.toString()).toBe(user._id.toString());
      expect(session.vastUrl).toBe('https://ads.example.com/vast.xml');
      expect(session.rewardAmount).toBe(2000);
      expect(session.status).toBe('pending');
      expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('resumes an existing pending session instead of stacking new ones', async () => {
      const { token } = await createAuthenticatedUser();
      const first = await startSession(token);
      const second = await startSession(token);
      expect(second.body.sessionId).toBe(first.body.sessionId);
      expect(await RewardedAdSession.countDocuments()).toBe(1);
    });
  });

  describe('GET /rewarded-ads/session/:id/vast', () => {
    it('requires auth', async () => {
      const res = await request(app).get('/rewarded-ads/session/000000000000000000000000/vast');
      expect(res.status).toBe(401);
    });

    it('403/404s for another users session', async () => {
      mockAdSourceResponse();
      const { user } = await createAuthenticatedUser();
      const { token: otherToken } = await createAuthenticatedUser();
      const session = await RewardedAdSession.create({
        userId: user._id,
        status: 'pending',
        vastUrl: config.rewardedAds.vastUrl,
        rewardAmount: 2000,
        expiresAt: new Date(Date.now() + 10000),
      });
      const res = await request(app).get(`/rewarded-ads/session/${session._id}/vast`).set(authHeader(otherToken));
      expect(res.status).toBe(404);
    });

    it('serves the VAST document through the proxy', async () => {
      mockAdSourceResponse();
      const { token } = await createAuthenticatedUser();
      const started = await startSession(token);
      const res = await request(app).get(`/rewarded-ads/session/${started.body.sessionId}/vast`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/xml/);
      expect(res.text).toContain('<VAST');
    });

    it('aborts + expires the session when the upstream fetch fails', async () => {
      globalThis.fetch = async () => {
        throw new Error('network down');
      };
      const { token } = await createAuthenticatedUser();
      const started = await startSession(token);
      const res = await request(app).get(`/rewarded-ads/session/${started.body.sessionId}/vast`).set(authHeader(token));
      expect(res.status).toBe(500);
      const session = await RewardedAdSession.findById(started.body.sessionId);
      expect(session.status).toBe('expired');
    });
  });

  describe('POST /rewarded-ads/:id/complete', () => {
    it('requires auth', async () => {
      const res = await request(app).post('/rewarded-ads/000000000000000000000000/complete');
      expect(res.status).toBe(401);
    });

    it('ignores client-supplied amount and grants exactly the server-set reward', async () => {
      const { user, token } = await createAuthenticatedUser();
      const started = await startSession(token);
      const before = (await User.findById(user._id)).balance;

      const res = await request(app)
        .post(`/rewarded-ads/${started.body.sessionId}/complete`)
        .set(authHeader(token))
        .send({ amount: 999999, rewardAmount: 999999 });
      expect(res.status).toBe(200);
      expect(res.body.rewardAmount).toBe(2000);
      expect(res.body.balance).toBe(before + 2000);

      const tx = await Transaction.findOne({ buyerId: user._id, type: 'rewarded_ad' });
      expect(tx.price).toBe(2000);

      const session = await RewardedAdSession.findById(started.body.sessionId);
      expect(session.status).toBe('completed');
      expect(session.completedAt).toBeInstanceOf(Date);
    });

    it('grants the reward only once per session', async () => {
      const { user, token } = await createAuthenticatedUser();
      const started = await startSession(token);
      const before = (await User.findById(user._id)).balance;

      const first = await request(app).post(`/rewarded-ads/${started.body.sessionId}/complete`).set(authHeader(token));
      expect(first.status).toBe(200);

      const second = await request(app).post(`/rewarded-ads/${started.body.sessionId}/complete`).set(authHeader(token));
      expect(second.status).toBe(409);
      expect(second.body.alreadyCompleted).toBe(true);

      expect((await User.findById(user._id)).balance).toBe(before + 2000);
      expect(await Transaction.countDocuments({ buyerId: user._id, type: 'rewarded_ad' })).toBe(1);
    });

    it('survives concurrent completion attempts with a single payout', async () => {
      const { user, token } = await createAuthenticatedUser();
      const started = await startSession(token);
      const before = (await User.findById(user._id)).balance;

      const results = await Promise.all([
        request(app).post(`/rewarded-ads/${started.body.sessionId}/complete`).set(authHeader(token)),
        request(app).post(`/rewarded-ads/${started.body.sessionId}/complete`).set(authHeader(token)),
        request(app).post(`/rewarded-ads/${started.body.sessionId}/complete`).set(authHeader(token)),
      ]);

      const ok = results.filter((r) => r.status === 200);
      expect(ok.length).toBe(1);

      expect((await User.findById(user._id)).balance).toBe(before + 2000);
      expect(await Transaction.countDocuments({ buyerId: user._id, type: 'rewarded_ad' })).toBe(1);
    });

    it('blocks another users completion', async () => {
      const { user } = await createAuthenticatedUser();
      const session = await RewardedAdSession.create({
        userId: user._id,
        status: 'pending',
        vastUrl: config.rewardedAds.vastUrl,
        rewardAmount: 2000,
        expiresAt: new Date(Date.now() + 10000),
      });
      const { token: otherToken } = await createAuthenticatedUser();
      const res = await request(app).post(`/rewarded-ads/${session._id}/complete`).set(authHeader(otherToken));
      expect(res.status).toBe(404);
    });

    it('enforces cooldown', async () => {
      const { token } = await createAuthenticatedUser();
      const first = await startSession(token);
      const firstRes = await request(app).post(`/rewarded-ads/${first.body.sessionId}/complete`).set(authHeader(token));
      expect(firstRes.status).toBe(200);

      const second = await startSession(token);
      const secondRes = await request(app)
        .post(`/rewarded-ads/${second.body.sessionId}/complete`)
        .set(authHeader(token));
      expect(secondRes.status).toBe(429);
      expect(secondRes.body.cooldownRemainingMs).toBeGreaterThan(0);
    });

    it('enforces the daily limit', async () => {
      config.rewardedAds.dailyLimit = 1;
      config.rewardedAds.cooldownMinutes = 0;
      const { token } = await createAuthenticatedUser();
      const first = await startSession(token);
      const firstRes = await request(app).post(`/rewarded-ads/${first.body.sessionId}/complete`).set(authHeader(token));
      expect(firstRes.status).toBe(200);

      const second = await startSession(token);
      const secondRes = await request(app)
        .post(`/rewarded-ads/${second.body.sessionId}/complete`)
        .set(authHeader(token));
      expect(secondRes.status).toBe(429);
      expect(secondRes.body.dailyLimit).toBe(1);
    });

    it('rejects expired sessions', async () => {
      config.rewardedAds.sessionTtlMinutes = 0;
      const { token } = await createAuthenticatedUser();
      await new Promise((r) => setTimeout(r, 5));
      const started = await startSession(token);
      const res = await request(app).post(`/rewarded-ads/${started.body.sessionId}/complete`).set(authHeader(token));
      expect(res.status).toBe(410);
    });

    it('creates an idempotent notification for the reward', async () => {
      const { user, token } = await createAuthenticatedUser();
      const started = await startSession(token);
      const res = await request(app).post(`/rewarded-ads/${started.body.sessionId}/complete`).set(authHeader(token));
      expect(res.status).toBe(200);

      const notifs = await Notification.find({
        userId: user._id,
        eventKey: `rewardedad:${started.body.sessionId}:completed`,
      });
      expect(notifs).toHaveLength(1);
    });
  });

  describe('GET /rewarded-ads/history', () => {
    it('lists only the authenticated users sessions', async () => {
      const { user, token } = await createAuthenticatedUser();
      await RewardedAdSession.create({
        userId: user._id,
        status: 'completed',
        vastUrl: config.rewardedAds.vastUrl,
        rewardAmount: 2000,
        expiresAt: new Date(),
        completedAt: new Date(),
      });
      const { token: otherToken } = await createAuthenticatedUser();
      await startSession(otherToken);

      const res = await request(app).get('/rewarded-ads/history').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.sessions.length).toBe(1);
      expect(res.body.sessions[0].status).toBe('completed');
      expect(res.body.sessions[0].vastUrl).toBeUndefined();
    });
  });
});
