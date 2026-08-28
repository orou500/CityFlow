/**
 * SECURITY AUDIT — Controlled attack simulation + regression tests.
 * Runs against local in-memory MongoDB only. Every test proves either
 * ATTACK BLOCKED or VULNERABILITY CONFIRMED.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createApp } from '../../test/createApp.js';
import {
  createAuthenticatedUser,
  createTestProperty,
  createTestCity,
  authHeader,
  setTestTick,
} from '../../test/helpers.js';
import User from '../../models/User.js';
import PropertyOffer from '../../models/PropertyOffer.js';
import Auction from '../../models/Auction.js';
import Transaction from '../../models/Transaction.js';
import Notification from '../../models/Notification.js';
import Company from '../../models/Company.js';
import StockHolding from '../../models/StockHolding.js';
import StockTransaction from '../../models/StockTransaction.js';
import { config } from '../../config/index.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { validateProxyTarget } from '../../routes/imageProxy.js';

const app = createApp();

beforeEach(async () => {
  await setTestTick(100);
});

describe('SEC-1: Offer double-accept race (TOCTOU)', () => {
  it('ATTACK BLOCKED — concurrent accepts: exactly one succeeds, exactly one ledger entry', async () => {
    const seller = await createAuthenticatedUser({ balance: 1_000_000_000 });
    const buyer = await createAuthenticatedUser({ balance: 1_000_000_000 });
    const prop = await createTestProperty({
      ownerId: seller.user._id,
      currentPrice: 500_000,
      forSale: true,
    });

    const offer = await PropertyOffer.create({
      propertyId: prop._id,
      sellerId: seller.user._id,
      buyerId: buyer.user._id,
      offerAmount: 400_000,
      expiresAt: new Date(Date.now() + 86400_000),
      status: 'pending',
    });

    const [r1, r2] = await Promise.all([
      request(app).post(`/offers/accept/${offer._id}`).set(authHeader(seller.token)).send({}),
      request(app).post(`/offers/accept/${offer._id}`).set(authHeader(seller.token)).send({}),
    ]);

    const okCount = [r1.status, r2.status].filter((s) => s === 200).length;
    expect(okCount).toBe(1);

    const sellerAfter = await User.findById(seller.user._id);
    const buyerAfter = await User.findById(buyer.user._id);
    const buys = await Transaction.countDocuments({ type: 'buy', propertyId: prop._id });

    console.log(
      `[SEC-1] statuses=[${r1.status},${r2.status}] seller delta=${sellerAfter.balance - 1_000_000_000}, ` +
        `buyer delta=${buyerAfter.balance - 1_000_000_000}, buy-tx count=${buys}`,
    );

    // Money conservation: one sale = one payment each way, one ledger row.
    expect(sellerAfter.balance - 1_000_000_000).toBe(400_000);
    expect(buyerAfter.balance - 1_000_000_000).toBe(-400_000);
    expect(buys).toBe(1);
    expect(buyerAfter.ownedProperties.filter((p) => p.toString() === prop._id.toString()).length).toBe(1);
  });
});

describe('SEC-2: Property buy race (lost update)', () => {
  it('ATTACK BLOCKED — 10 concurrent buys: exactly one succeeds, one ledger row, one ownership record', async () => {
    const buyer = await createAuthenticatedUser({ balance: 1_000_000_000 });
    const prop = await createTestProperty({
      ownerId: null,
      currentPrice: 100_000,
      forSale: true,
    });

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/properties/buy').set(authHeader(buyer.token)).send({ propertyId: prop._id.toString() }),
      ),
    );

    const okCount = responses.filter((r) => r.status === 200).length;
    expect(okCount).toBe(1);

    const buyerAfter = await User.findById(buyer.user._id);
    const buys = await Transaction.countDocuments({ type: 'buy', propertyId: prop._id });
    const ownedDupes = buyerAfter.ownedProperties.filter((p) => p.toString() === prop._id.toString()).length;

    console.log(
      `[SEC-2] ok=${okCount}/${responses.length} buyer delta=${buyerAfter.balance - 1_000_000_000}, ` +
        `ownedProperties-entries=${ownedDupes}, buy-tx count=${buys}`,
    );

    expect(buyerAfter.balance - 1_000_000_000).toBe(-100_000);
    expect(ownedDupes).toBe(1);
    expect(buys).toBe(1);
  });
});

describe('SEC-3: Period bonus double-claim race', () => {
  it('ATTACK BLOCKED — concurrent claims: exactly one payout, one ledger entry', async () => {
    const user = await createAuthenticatedUser({ balance: 0 });

    const [r1, r2] = await Promise.all([
      request(app).post('/bonus/claim').set(authHeader(user.token)).send({}),
      request(app).post('/bonus/claim').set(authHeader(user.token)).send({}),
    ]);

    const okCount = [r1.status, r2.status].filter((s) => s === 200).length;
    expect(okCount).toBe(1);

    const after = await User.findById(user.user._id);
    const bonusTxs = await Transaction.countDocuments({ buyerId: user.user._id, type: 'period_bonus' });
    console.log(`[SEC-3] statuses=[${r1.status},${r2.status}] balance=${after.balance}, bonus txs=${bonusTxs}`);
    expect(bonusTxs).toBe(1);
  });
});

describe('SEC-3b: Rent double-collect race', () => {
  it('ATTACK BLOCKED — concurrent collects: exactly one payout, one ledger entry', async () => {
    const user = await createAuthenticatedUser({ balance: 500_000, uncollectedRent: 250_000 });

    const [r1, r2] = await Promise.all([
      request(app).post('/rent/collect').set(authHeader(user.token)).send({}),
      request(app).post('/rent/collect').set(authHeader(user.token)).send({}),
    ]);

    const okCount = [r1.status, r2.status].filter((s) => s === 200).length;
    expect(okCount).toBe(1);

    const after = await User.findById(user.user._id);
    const rentTxs = await Transaction.countDocuments({ buyerId: user.user._id, type: 'rent' });
    console.log(
      `[SEC-3b] statuses=[${r1.status},${r2.status}] balance=${after.balance}, uncollectedRent=${after.uncollectedRent}, rent txs=${rentTxs}`,
    );
    expect(after.uncollectedRent).toBe(0);
    expect(rentTxs).toBe(1);
  });
});

describe('SEC-3c: Stock overspend race', () => {
  it('ATTACK BLOCKED — concurrent purchases cannot overspend the balance', async () => {
    const user = await createAuthenticatedUser({ balance: 150_000 });
    const company = await Company.create({
      name: `SecStock_${Date.now()}`,
      ticker: `S${Date.now() % 100000}`,
      active: true,
      isIPO: false,
      sharePrice: 100,
      sharesOutstanding: 10_000_000,
      totalSharesHeld: 0,
      industry: 'technology',
      hqCityId: (await createTestCity())._id,
    });

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post('/stocks/buy')
          .set(authHeader(user.token))
          .send({ companyId: company._id.toString(), shares: 500 }),
      ),
    );

    const okCount = responses.filter((r) => r.status === 200).length;
    const after = await User.findById(user.user._id);
    const holding = await StockHolding.findOne({ userId: user.user._id, companyId: company._id });
    const buys = await StockTransaction.countDocuments({ userId: user.user._id, type: 'buy' });

    console.log(`[SEC-3c] ok=${okCount}/8 balance=${after.balance}, held=${holding?.shares || 0}, buy txs=${buys}`);

    // Balance can never go negative and money is conserved: cost == balance delta.
    expect(after.balance).toBeGreaterThanOrEqual(0);
    const spent = 150_000 - after.balance;
    expect(spent % 100).toBe(0);
    expect((holding?.shares || 0) * 100).toBe(spent);
    expect(buys).toBe(okCount);
  });
});

describe('SEC-4: Transaction ledger IDOR', () => {
  it('ATTACK BLOCKED — users can only read their own ledger', async () => {
    const victim = await createAuthenticatedUser({ balance: 1_000_000_000 });
    const attacker = await createAuthenticatedUser({ balance: 1_000_000_000 });

    await Transaction.create({ buyerId: victim.user._id, price: 123_456, type: 'buy' });

    const cross = await request(app).get(`/transactions/user/${victim.user._id}`).set(authHeader(attacker.token));
    expect(cross.status).toBe(403);

    const own = await request(app).get(`/transactions/user/${attacker.user._id}`).set(authHeader(attacker.token));
    expect(own.status).toBe(200);
  });
});

describe('SEC-5: Deleted/banned account token validity', () => {
  it('ATTACK BLOCKED — deleted and banned accounts are rejected on REST', async () => {
    const active = await createAuthenticatedUser({});
    const deleted = await createAuthenticatedUser({});
    const banned = await createAuthenticatedUser({});

    await User.updateOne({ _id: deleted.user._id }, { $set: { deletedAt: new Date() } });
    await User.updateOne({ _id: banned.user._id }, { $set: { banned: true } });

    const activeRes = await request(app).get('/users/me').set(authHeader(active.token));
    const deletedRes = await request(app).get('/users/me').set(authHeader(deleted.token));
    const bannedRes = await request(app).get('/users/me').set(authHeader(banned.token));

    console.log(`[SEC-5] active=${activeRes.status} deleted=${deletedRes.status} banned=${bannedRes.status}`);
    expect(activeRes.status).toBe(200);
    expect(deletedRes.status).toBe(401);
    expect(bannedRes.status).toBe(401);
  });
});

describe('SEC-6: Notification ownership', () => {
  it("ATTACK BLOCKED — deleting another user's notification is rejected", async () => {
    const owner = await createAuthenticatedUser({});
    const attacker = await createAuthenticatedUser({});

    const notif = await Notification.create({
      userId: owner.user._id,
      type: 'system',
      title: 'private',
      message: 'private',
      eventKey: `t:${owner.user._id}:1`,
    });

    const res = await request(app).delete(`/notifications/${notif._id}`).set(authHeader(attacker.token));
    expect(res.status).toBe(403);
  });
});

describe('SEC-7: Admin endpoint privilege check', () => {
  it('ATTACK BLOCKED — normal user cannot reach admin endpoints', async () => {
    const user = await createAuthenticatedUser({});
    const res = await request(app).get('/admin/overview').set(authHeader(user.token));
    expect(res.status).toBe(403);
  });
});

describe('SEC-8: Auction concurrent bid (positive control)', () => {
  it('ATTACK BLOCKED — concurrent equal bids cannot double-win; CAS + reservation guard holds', async () => {
    const bidderA = await createAuthenticatedUser({ balance: 200_000 });
    const bidderB = await createAuthenticatedUser({ balance: 200_000 });
    const prop = await createTestProperty({ ownerId: null, currentPrice: 100_000 });

    const auction = await Auction.create({
      propertyId: prop._id,
      propertySnapshot: { name: prop.name, type: prop.type, currentPrice: prop.currentPrice },
      sellerId: null,
      sellerType: 'bank',
      status: 'active',
      startTick: 95,
      endTick: 105,
      originalEndTick: 105,
      startingBid: 100_000,
      currentBid: 0,
      currentBidderId: null,
      bidIncrement: 10_000,
      totalBids: 0,
      uniqueBidders: 0,
      watchers: [],
      watcherCount: 0,
      bids: [],
      activity: [],
    });

    const [r1, r2] = await Promise.all([
      request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(bidderA.token)).send({ amount: 100_000 }),
      request(app).post(`/auctions/${auction._id}/bid`).set(authHeader(bidderB.token)).send({ amount: 100_000 }),
    ]);

    const statuses = [r1.status, r2.status];
    expect(statuses.filter((s) => s === 200).length).toBe(1);

    const auctionAfter = await Auction.findById(auction._id);
    const aAfter = await User.findById(bidderA.user._id);
    const bAfter = await User.findById(bidderB.user._id);

    expect(auctionAfter.totalBids).toBe(1);
    expect((aAfter.reservedAuctionFunds || 0) + (bAfter.reservedAuctionFunds || 0)).toBe(100_000);
  });
});

describe('SEC-9: Cross-user company treasury (permission enforcement)', () => {
  it('ATTACK BLOCKED — non-member cannot withdraw a company treasury', async () => {
    const founder = await createAuthenticatedUser({
      balance: 1_000_000_000,
      level: 30,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    const outsider = await createAuthenticatedUser({ balance: 1_000_000_000 });
    const city = await createTestCity();
    await createTestProperty({ ownerId: founder.user._id, currentPrice: 50_000_000 });

    const createRes = await request(app)
      .post('/real-estate-companies')
      .set(authHeader(founder.token))
      .send({ name: `SecAudit_${Date.now()}`, description: 't', hqCityId: city._id });
    expect(createRes.status).toBe(201);
    const companyId = createRes.body._id;

    await request(app)
      .post(`/real-estate-companies/${companyId}/treasury/deposit`)
      .set(authHeader(founder.token))
      .send({ amount: 10_000_000 });

    const res = await request(app)
      .post(`/real-estate-companies/${companyId}/treasury/withdraw`)
      .set(authHeader(outsider.token))
      .send({ amount: 1_000 });
    expect(res.status).toBe(403);
  });
});

describe('SEC-10: Rate limiting per client IP', () => {
  function makeLimitedApp(max) {
    const limiter = rateLimit({ windowMs: 60_000, max, keyPrefix: 'rl:test', enabled: true });
    const a = express();
    a.set('trust proxy', 1);
    a.use(limiter);
    a.get('/', (req, res) => res.json({ ip: req.ip }));
    return a;
  }

  it('different client IPs get separate buckets', async () => {
    const a = makeLimitedApp(2);
    const r1 = await request(a).get('/').set('X-Forwarded-For', '1.1.1.1');
    const r2 = await request(a).get('/').set('X-Forwarded-For', '2.2.2.2');
    const r3 = await request(a).get('/').set('X-Forwarded-For', '1.1.1.1');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200); // 1.1.1.1 used its 2nd hit, 2.2.2.2 untouched
    const r4 = await request(a).get('/').set('X-Forwarded-For', '1.1.1.1');
    expect(r4.status).toBe(429); // 1.1.1.1 exceeded
  });

  it('same client IP shares one bucket', async () => {
    const a = makeLimitedApp(2);
    const r1 = await request(a).get('/').set('X-Forwarded-For', '3.3.3.3');
    const r2 = await request(a).get('/').set('X-Forwarded-For', '3.3.3.3');
    const r3 = await request(a).get('/').set('X-Forwarded-For', '3.3.3.3');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
  });

  it('spoofed leading X-Forwarded-For entries cannot bypass the limit', async () => {
    const a = makeLimitedApp(2);
    // In production the proxy appends the real client IP as the LAST entry;
    // client-controlled leading entries are ignored — both requests land in
    // the same bucket.
    const r1 = await request(a).get('/').set('X-Forwarded-For', '66.66.66.66, 9.9.9.9');
    const r2 = await request(a).get('/').set('X-Forwarded-For', '77.77.77.77, 9.9.9.9');
    const r3 = await request(a).get('/').set('X-Forwarded-For', '88.88.88.88, 9.9.9.9');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429); // spoofed leading IPs did not unlock a new bucket
  });
});

describe('SEC-11: CORS + security headers', () => {
  it('untrusted origin gets no CORS allowance; allowed origin and headers present', async () => {
    const evil = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const allowed = await request(app).get('/health').set('Origin', config.frontendUrl);
    expect(allowed.headers['access-control-allow-origin']).toBe(config.frontendUrl);

    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
  });
});

describe('SEC-12: /metrics protection', () => {
  it('anonymous 401, normal user 403, admin 200', async () => {
    const anon = await request(app).get('/metrics');
    expect(anon.status).toBe(401);

    const user = await createAuthenticatedUser({});
    const normal = await request(app).get('/metrics').set(authHeader(user.token));
    expect(normal.status).toBe(403);

    const admin = await createAuthenticatedUser({ role: 'admin' });
    const adminRes = await request(app).get('/metrics').set(authHeader(admin.token));
    expect(adminRes.status).toBe(200);
  });
});

describe('SEC-13: Image proxy target validation (SSRF)', () => {
  const publicLookup = async () => [{ address: '203.0.113.10' }];
  const privateLookup = async () => [{ address: '10.0.0.5' }];
  const loopbackLookup = async () => [{ address: '127.0.0.1' }];

  it('HTTPS-only: HTTP destinations are blocked', async () => {
    const r = await validateProxyTarget('http://lh3.googleusercontent.com/x.png', publicLookup);
    expect(r.ok).toBe(false);
  });

  it('host allowlist is enforced', async () => {
    const r = await validateProxyTarget('https://evil.example/x.png', publicLookup);
    expect(r.ok).toBe(false);
  });

  it('private / loopback resolutions are blocked (DNS rebinding)', async () => {
    const r1 = await validateProxyTarget('https://lh3.googleusercontent.com/x.png', privateLookup);
    expect(r1.ok).toBe(false);
    const r2 = await validateProxyTarget('https://lh3.googleusercontent.com/x.png', loopbackLookup);
    expect(r2.ok).toBe(false);
  });

  it('public allowlisted destination is allowed', async () => {
    const r = await validateProxyTarget('https://lh3.googleusercontent.com/x.png', publicLookup);
    expect(r.ok).toBe(true);
  });
});

describe('SEC-14: OAuth unverified provider email', () => {
  afterEach(() => {
    delete global.fetch;
  });

  function mockProviderUserinfo(email, emailVerified) {
    global.fetch = async (url) => {
      if (String(url).includes('oauth2.googleapis.com/token') || String(url).includes('discord.com/api/oauth2/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'mock-token' }) };
      }
      if (String(url).includes('userinfo') || String(url).includes('users/@me')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sub: 'provider-sub-1', email, email_verified: emailVerified, verified: emailVerified }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
  }

  function stateToken(provider) {
    return jwt.sign({ provider }, config.jwtSecret, { expiresIn: '10m' });
  }

  it('unverified Google email is rejected (no link, no login)', async () => {
    mockProviderUserinfo('victim@example.com', false);
    const res = await request(app)
      .get('/auth/google/callback')
      .query({ code: 'x', state: stateToken('google') });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('unverified_email');
  });

  it('unverified Google email cannot link an existing account', async () => {
    await createAuthenticatedUser({ email: 'victim-link@example.com', emailVerified: true });
    mockProviderUserinfo('victim-link@example.com', false);
    const res = await request(app)
      .get('/auth/google/callback')
      .query({ code: 'x', state: stateToken('google') });
    expect(res.headers.location).toContain('unverified_email');

    const linked = await User.findOne({ email: 'victim-link@example.com' });
    expect(linked.oauthProviders.length).toBe(0);
  });

  it('verified Google email links an existing account', async () => {
    await createAuthenticatedUser({ email: 'victim-ok@example.com', emailVerified: true });
    mockProviderUserinfo('victim-ok@example.com', true);
    const res = await request(app)
      .get('/auth/google/callback')
      .query({ code: 'x', state: stateToken('google') });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('token=');

    const linked = await User.findOne({ email: 'victim-ok@example.com' });
    expect(linked.oauthProviders.some((p) => p.provider === 'google')).toBe(true);
  });
});

describe('SEC-15: Generic 500 responses (no internal leakage)', () => {
  it('internal error detail is not returned to the client', async () => {
    const res = await request(app).get('/cities/not-an-object-id');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('An unexpected error occurred');
    expect(JSON.stringify(res.body)).not.toContain('CastError');
    expect(JSON.stringify(res.body)).not.toContain('mongodb');
  });
});
