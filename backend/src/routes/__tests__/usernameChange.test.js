import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestUser, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';
import LeaderboardSnapshot from '../../models/LeaderboardSnapshot.js';
import CompetitiveEvent from '../../models/CompetitiveEvent.js';
import Auction from '../../models/Auction.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import CompanyAuditLog from '../../models/CompanyAuditLog.js';
import AdminAuditLog from '../../models/AdminAuditLog.js';

// Capture socket emissions (io is null under createApp, so emitTo* no-op) and
// cache pattern deletions to assert propagation without a live Redis.
const captured = { userUpdated: [], companyUpdated: [], lbDel: 0, auctionDel: 0, compEventDel: 0, companyDel: 0 };
vi.mock('../../socket/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    emitToUser: vi.fn((userId, event, data) => {
      captured.userUpdated.push({ userId, event, data });
    }),
    emitToCompany: vi.fn((companyId, event, data) => {
      captured.companyUpdated.push({ companyId, event, data });
    }),
  };
});
vi.mock('../../utils/cache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cacheDelPattern: vi.fn(async (pattern) => {
      if (pattern === 'lb:*') captured.lbDel++;
      if (pattern === 'cf:auction*') captured.auctionDel++;
      if (pattern === 'cf:events:comp:*') captured.compEventDel++;
      if (pattern === 'cf:events:comp:*') captured.compEventDel++;
      return actual.cacheDelPattern(pattern);
    }),
    cacheDelMany: vi.fn(async (keys) => {
      if (keys && keys.some((k) => k.includes('cf:company:'))) captured.companyDel++;
      return actual.cacheDelMany(keys);
    }),
  };
});

const app = createApp();

beforeEach(() => {
  captured.userUpdated = [];
  captured.companyUpdated = [];
  captured.lbDel = 0;
  captured.auctionDel = 0;
  captured.compEventDel = 0;
  captured.companyDel = 0;
  vi.clearAllMocks();
});

describe('PUT /users/username — core username change', () => {
  it('changes the authenticated user username successfully', async () => {
    const { user, token } = await createAuthenticatedUser({ username: 'oldname', email: 'a@ex.com' });
    const res = await request(app).put('/users/username').set(authHeader(token)).send({ username: 'NewName' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.username).toBe('NewName');
    expect(res.body.user._id).toBe(user._id.toString());

    const db = await User.findById(user._id);
    expect(db.username).toBe('NewName');
    expect(db.normalizedUsername).toBe('newname');
  });

  it('requires authentication', async () => {
    const res = await request(app).put('/users/username').send({ username: 'anything' });
    expect(res.status).toBe(401);
  });

  it('ignores arbitrary userId in the body — identity comes from JWT only', async () => {
    const victim = await createTestUser({ username: 'victim1', email: 'v1@ex.com' });
    const attacker = await createAuthenticatedUser({ username: 'attacker1', email: 'a1@ex.com' });

    const res = await request(app)
      .put('/users/username')
      .set(authHeader(attacker.token))
      .send({ username: 'Hacked1', userId: victim._id.toString() });

    expect(res.status).toBe(200);
    const victimDb = await User.findById(victim._id);
    expect(victimDb.username).toBe('victim1');
    const attackerDb = await User.findById(attacker.user._id);
    expect(attackerDb.username).toBe('Hacked1');
  });
});

describe('PUT /users/username — validation', () => {
  it('rejects missing username', async () => {
    const { token } = await createAuthenticatedUser();
    const res = await request(app).put('/users/username').set(authHeader(token)).send({ username: '' });
    expect(res.status).toBe(400);
  });

  it('rejects too-short username', async () => {
    const { token } = await createAuthenticatedUser();
    const res = await request(app).put('/users/username').set(authHeader(token)).send({ username: 'ab' });
    expect(res.status).toBe(400);
  });

  it('rejects too-long username', async () => {
    const { token } = await createAuthenticatedUser();
    const res = await request(app)
      .put('/users/username')
      .set(authHeader(token))
      .send({ username: 'a'.repeat(21) });
    expect(res.status).toBe(400);
  });

  it('rejects invalid characters', async () => {
    const { token } = await createAuthenticatedUser();
    const res = await request(app).put('/users/username').set(authHeader(token)).send({ username: 'bad name!' });
    expect(res.status).toBe(400);
  });

  it('rejects reserved usernames', async () => {
    const { token } = await createAuthenticatedUser();
    for (const reserved of ['admin', 'system', 'cityflow', 'ADMIN']) {
      const res = await request(app).put('/users/username').set(authHeader(token)).send({ username: reserved });
      expect(res.status).toBe(400);
    }
  });

  it('rejects duplicate username', async () => {
    await createTestUser({ username: 'taken', email: 'taken@ex.com' });
    const { token } = await createAuthenticatedUser();
    const res = await request(app).put('/users/username').set(authHeader(token)).send({ username: 'taken' });
    expect(res.status).toBe(409);
  });

  it('rejects case-insensitive duplicate', async () => {
    await createTestUser({ username: 'Taker', email: 'taker@ex.com' });
    const { token } = await createAuthenticatedUser();
    const res = await request(app).put('/users/username').set(authHeader(token)).send({ username: 'taker' });
    expect(res.status).toBe(409);
  });
});

describe('Username change concurrency', () => {
  it('two users racing for one name — exactly one wins', async () => {
    const u1 = await createAuthenticatedUser({ username: 'racer1', email: 'r1@ex.com' });
    const u2 = await createAuthenticatedUser({ username: 'racer2', email: 'r2@ex.com' });

    const attempt = (token) =>
      request(app).put('/users/username').set(authHeader(token)).send({ username: 'SingleSlot' });

    const [r1, r2] = await Promise.all([attempt(u1.token), attempt(u2.token)]);
    const statuses = [r1.status, r2.status].sort();
    // exactly one 200 and one 409 (or 200/200 only if the same name was
    // already theirs — not the case here, so one must conflict).
    const okCount = [r1.status, r2.status].filter((s) => s === 200).length;
    expect(okCount).toBe(1);
    expect(statuses).toContain(409);

    const winners = await User.find({ normalizedUsername: 'singleslot' });
    expect(winners.length).toBe(1);
  });
});

describe('Leaderboard current-vs-historical', () => {
  it('leaderboard API returns the NEW username even when snapshot has the OLD one', async () => {
    const u = await createAuthenticatedUser({ username: 'lboa', email: 'lboa@ex.com' });

    // Snapshot captured the OLD username on disk.
    await LeaderboardSnapshot.create({
      category: 'netWorth',
      seasonNumber: 1,
      tickNumber: 100,
      rankings: [
        {
          userId: u.user._id,
          username: 'lboa',
          displayName: '',
          avatar: '',
          value: 500,
          rank: 1,
          previousRank: null,
          rankChange: 0,
        },
      ],
    });

    await User.findByIdAndUpdate(u.user._id, { username: 'lboZ', normalizedUsername: 'lboz' });

    const res = await request(app).get('/leaderboards/rankings/netWorth?season=1');
    expect(res.status).toBe(200);
    expect(res.body.rankings[0].username).toBe('lboZ');

    // Disk snapshot is NOT rewritten (historical preserved).
    const snap = await LeaderboardSnapshot.findOne({ category: 'netWorth', seasonNumber: 1 });
    expect(snap.rankings[0].username).toBe('lboa');
  });

  it('deleted/missing user keeps the snapshot username (no crash)', async () => {
    const ghost = await createTestUser({ username: 'ghost1', email: 'ghost@ex.com' });
    const gid = ghost._id;
    await User.deleteOne({ _id: gid });

    await LeaderboardSnapshot.create({
      category: 'properties',
      seasonNumber: 1,
      tickNumber: 100,
      rankings: [{ userId: gid, username: 'ghost1', displayName: '', avatar: '', value: 10, rank: 1 }],
    });

    const res = await request(app).get('/leaderboards/rankings/properties?season=1');
    expect(res.status).toBe(200);
    expect(res.body.rankings[0].username).toBe('ghost1');
  });

  it('invalidates lb: cache on username change', async () => {
    const { token } = await createAuthenticatedUser({ username: 'cacheone', email: 'co@ex.com' });
    await request(app).put('/users/username').set(authHeader(token)).send({ username: 'CacheTwo' });
    expect(captured.lbDel).toBeGreaterThan(0);
  });

  it('invalidates auction + competitive-event + company caches on username change', async () => {
    const { user, token } = await createAuthenticatedUser({ username: 'cacheall', email: 'ca@ex.com' });
    const company = await RealEstateCompany.create({
      name: 'ACME',
      founderId: user._id,
      ceoId: user._id,
      members: [{ userId: user._id, role: 'ceo' }],
    });
    user.companyId = company._id;
    await user.save();

    await request(app).put('/users/username').set(authHeader(token)).send({ username: 'FreshName' });
    expect(captured.auctionDel).toBeGreaterThan(0);
    expect(captured.compEventDel).toBeGreaterThan(0);
    expect(captured.companyDel).toBeGreaterThan(0);
  });
});

describe('Competitive events current-vs-historical', () => {
  it('active event returns the CURRENT username', async () => {
    const u = await createAuthenticatedUser({ username: 'evact', email: 'evact@ex.com' });
    await CompetitiveEvent.create({
      name: 'Active',
      description: '',
      type: 'wealth',
      metric: 'netWorth',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 100000),
      startTick: 1,
      endTick: 10,
      participants: [{ userId: u.user._id, username: 'evact', displayName: '', avatar: '', value: 9, rank: 1 }],
    });
    await User.findByIdAndUpdate(u.user._id, { username: 'evNC', normalizedUsername: 'evnc' });

    const res = await request(app).get('/leaderboards/events?status=active');
    expect(res.status).toBe(200);
    expect(res.body.events[0].participants[0].username).toBe('evNC');

    const byId = await request(app).get(`/leaderboards/events/${res.body.events[0]._id}`);
    expect(byId.body.event.participants[0].username).toBe('evNC');
  });

  it('completed event preserves the historical username', async () => {
    const u = await createAuthenticatedUser({ username: 'evhis', email: 'evhis@ex.com' });
    await CompetitiveEvent.create({
      name: 'Done',
      description: '',
      type: 'wealth',
      metric: 'netWorth',
      status: 'completed',
      startDate: new Date(),
      endDate: new Date(),
      startTick: 1,
      endTick: 5,
      participants: [{ userId: u.user._id, username: 'evhis', displayName: '', avatar: '', value: 9, rank: 1 }],
    });
    await User.findByIdAndUpdate(u.user._id, { username: 'evHIS2', normalizedUsername: 'evhis2' });

    const res = await request(app).get('/leaderboards/events?status=completed');
    expect(res.status).toBe(200);
    expect(res.body.events[0].participants[0].username).toBe('evhis');
  });
});

describe('Auction current-vs-historical', () => {
  it('auction detail returns the CURRENT winner/seller username (live refs)', async () => {
    const seller = await createAuthenticatedUser({ username: 'aucseller', email: 'aus@ex.com' });
    const prop = await (await import('../../test/helpers.js')).createTestProperty();
    await Auction.create({
      propertyId: prop._id,
      sellerId: seller.user._id,
      sellerType: 'player',
      status: 'ended',
      currentBid: 100,
      winningBid: 100,
      winnerId: seller.user._id,
      startingBid: 100,
      startTick: 1,
      endTick: 5,
      originalEndTick: 5,
      bidIncrement: 10,
      startDate: new Date(),
      endDate: new Date(),
    });
    await User.findByIdAndUpdate(seller.user._id, { username: 'aucNow', normalizedUsername: 'aucnow' });

    const res = await request(app).get(`/auctions/${(await Auction.findOne({}).lean())._id}`);
    expect(res.status).toBe(200);
    expect(res.body.auction.winnerId.username).toBe('aucNow');
    expect(res.body.auction.sellerId.username).toBe('aucNow');
  });

  it('historical auction bid preserves the ORIGINAL username', async () => {
    const bidder = await createAuthenticatedUser({ username: 'aucbid', email: 'aub@ex.com' });
    const prop = await (await import('../../test/helpers.js')).createTestProperty();
    await Auction.create({
      propertyId: prop._id,
      sellerId: new mongoose.Types.ObjectId(),
      sellerType: 'bank',
      status: 'ended',
      currentBid: 50,
      winningBid: 50,
      winnerId: bidder.user._id,
      startingBid: 50,
      startTick: 1,
      endTick: 5,
      originalEndTick: 5,
      bidIncrement: 10,
      startDate: new Date(),
      endDate: new Date(),
      bids: [
        {
          bidderId: bidder.user._id,
          amount: 50,
          tick: 3,
          username: 'aucbid',
          createdAt: new Date(),
        },
      ],
    });
    await User.findByIdAndUpdate(bidder.user._id, { username: 'aucCHANGED', normalizedUsername: 'auchanged' });

    const auction = await Auction.findOne({ winnerId: bidder.user._id }).lean();
    expect(auction.bids[0].username).toBe('aucbid');
  });
});

describe('Company current-vs-historical', () => {
  it('company member resolves the CURRENT username via live populate', async () => {
    const u = await createAuthenticatedUser({ username: 'comem', email: 'comem@ex.com' });
    const company = await RealEstateCompany.create({
      name: 'InitCo',
      founderId: u.user._id,
      members: [{ userId: u.user._id, role: 'ceo' }],
    });
    await User.findByIdAndUpdate(u.user._id, { username: 'comNEW', normalizedUsername: 'comnew' });

    const res = await request(app).get(`/real-estate-companies/${company._id}`).set(authHeader(u.token));
    expect(res.status).toBe(200);
    const ceo = res.body.members?.find((m) => m.role === 'ceo');
    expect(ceo).toBeTruthy();
    expect(ceo.userId.username).toBe('comNEW');
  });

  it('company audit log preserves the historical username', async () => {
    const u = await createAuthenticatedUser({ username: 'auditname', email: 'audit@ex.com' });
    const company = await RealEstateCompany.create({
      name: 'AuditCo',
      founderId: u.user._id,
      members: [{ userId: u.user._id, role: 'ceo' }],
    });
    await CompanyAuditLog.create({
      companyId: company._id,
      userId: u.user._id,
      action: 'member_joined',
      details: { username: 'auditname', shares: 5 },
    });
    await User.findByIdAndUpdate(u.user._id, { username: 'Renamed', normalizedUsername: 'renamed' });

    const log = await CompanyAuditLog.findOne({ companyId: company._id }).lean();
    expect(log.details.username).toBe('auditname');
  });
});

describe('Username change propagation side-effects', () => {
  it('emits USER_UPDATED to the user and company rooms', async () => {
    const { user, token } = await createAuthenticatedUser({ username: 'emitme', email: 'emit@ex.com' });
    const company = await RealEstateCompany.create({
      name: 'EmitCo',
      founderId: user._id,
      members: [{ userId: user._id, role: 'ceo' }],
    });
    user.companyId = company._id;
    await user.save();

    await request(app).put('/users/username').set(authHeader(token)).send({ username: 'Emitted' });
    expect(captured.userUpdated.length).toBeGreaterThan(0);
    const userEvent = captured.userUpdated[0];
    expect(userEvent.event).toBe('user:updated');
    expect(userEvent.data.username).toBe('Emitted');
    expect(userEvent.data.userId).toBe(user._id.toString());
    expect(userEvent.data).not.toHaveProperty('password');

    const companyEvent = captured.companyUpdated.find((c) => c.event === 'user:updated');
    expect(companyEvent).toBeTruthy();
    expect(companyEvent.companyId.toString()).toBe(company._id.toString());
  });

  it('does not expose password/token/security fields in the response', async () => {
    const { token } = await createAuthenticatedUser({ username: 'safeout', email: 'safeout@ex.com' });
    const res = await request(app).put('/users/username').set(authHeader(token)).send({ username: 'SafeResult' });
    const body = JSON.stringify(res.body.user);
    expect(body).not.toMatch(/password/i);
    expect(body).not.toMatch(/token/i);
    expect(body).not.toMatch(/verificationToken/i);
    expect(body).not.toMatch(/pushTokens/i);
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('balance');
  });

  it('does not alter balance, XP, credit score or other user data', async () => {
    const { user, token } = await createAuthenticatedUser({ username: 'keepdata', email: 'keep@ex.com' });
    await User.findByIdAndUpdate(user._id, {
      balance: 555,
      creditScore: 700,
      xp: 250,
      reservedAuctionFunds: 40,
      companyId: null,
    });

    await request(app).put('/users/username').set(authHeader(token)).send({ username: 'KeepOtherData' });

    const db = await User.findById(user._id);
    expect(db.balance).toBe(555);
    expect(db.creditScore).toBe(700);
    expect(db.xp).toBe(250);
    expect(db.reservedAuctionFunds).toBe(40);
    expect(db.companyId).toBeNull();
  });

  it('writes a self-service admin audit log entry', async () => {
    const { user, token } = await createAuthenticatedUser({ username: 'fromName', email: 'from@ex.com' });
    await request(app).put('/users/username').set(authHeader(token)).send({ username: 'ToName' });
    const log = await AdminAuditLog.findOne({ targetUserId: user._id, action: 'user_username_changed' }).lean();
    expect(log).toBeTruthy();
    expect(log.details.from).toBe('fromName');
    expect(log.details.to).toBe('ToName');
  });
});
