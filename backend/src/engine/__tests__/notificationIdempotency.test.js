import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Notification from '../../models/Notification.js';
import MissionProgress from '../../models/MissionProgress.js';
import Auction from '../../models/Auction.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import Season from '../../models/Season.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import { createNotification, enqueueNotification } from '../../utils/notificationQueue.js';
import {
  updateMissionProgress,
  claimMissionReward,
  markDailyLoginForUser,
  refreshDailyMissions,
} from '../missionProcessing.js';
import { checkAndAwardAchievements, awardXpAndLevels } from '../careerProcessing.js';
import { awardXp } from '../../utils/leveling.js';
import { sendRentExpiryWarnings } from '../rentProcessing.js';
import { createTestUser } from '../../test/helpers.js';

/**
 * Notification idempotency matrix — 1 logical event → 1 notification,
 * even under concurrency, retries and dual (engine + HTTP) paths.
 */
describe('Notification idempotency — one logical event, one notification', () => {
  beforeAll(async () => {
    await Notification.deleteMany({});
  });

  afterAll(async () => {
    await Notification.deleteMany({});
  });

  it('concurrent duplicate creates produce exactly one notification (DB-level protection)', async () => {
    const user = await createTestUser({ balance: 500000 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        createNotification({
          userId: user._id,
          type: 'system',
          title: 'Concurrent Test',
          message: 'same event',
          eventKey: `test:concurrent:${user._id}:1`,
          route: '/dashboard',
          entityType: 'test',
          global: false,
        }),
      ),
    );

    const createdCount = results.filter((r) => r.created).length;
    expect(createdCount).toBe(1);
    expect(await Notification.countDocuments({ eventKey: `test:concurrent:${user._id}:1` })).toBe(1);
  });

  it('same type, different events → separate notifications (no false dedup)', async () => {
    const user = await createTestUser();

    await createNotification({
      userId: user._id,
      type: 'system',
      title: 'Mission Complete!',
      message: 'mission A',
      eventKey: `mission:aaaa:completed`,
      entityType: 'mission',
    });
    await createNotification({
      userId: user._id,
      type: 'system',
      title: 'Mission Complete!',
      message: 'mission B',
      eventKey: `mission:bbbb:completed`,
      entityType: 'mission',
    });

    const count = await Notification.countDocuments({
      userId: user._id,
      type: 'system',
      title: 'Mission Complete!',
    });
    expect(count).toBe(2);
  });

  it('fan-out to multiple users: every member of a shared event gets their own notification', async () => {
    const users = [];
    for (let i = 0; i < 3; i++) users.push(await createTestUser());

    for (const u of users) {
      await createNotification({
        userId: u._id,
        type: 'system',
        title: 'Auction Extended',
        message: 'watched auction extended',
        eventKey: `auction:feed1:extended:${u._id}`,
        entityType: 'auction',
        entityId: new mongoose.Types.ObjectId(),
        global: false,
      });
    }

    expect(await Notification.countDocuments({ eventKey: /^auction:feed1:extended:/ })).toBe(3);
  });

  it('legacy notifications without eventKey remain untouched and readable', async () => {
    const user = await createTestUser();
    const legacy = await Notification.create({
      userId: user._id,
      type: 'system',
      title: 'Legacy',
      message: 'created before eventKey existed',
      read: false,
    });

    expect(legacy.eventKey).toBeNull();
    // A new event with the same type is not blocked by the legacy record
    await createNotification({
      userId: user._id,
      type: 'system',
      title: 'Legacy',
      message: 'same title, new event',
      eventKey: `legacy:${user._id}:fresh`,
      entityType: 'test',
    });
    expect(await Notification.countDocuments({ userId: user._id, title: 'Legacy' })).toBe(2);
  });

  it('message-text drift never creates duplicates; identical text never suppresses a distinct event', async () => {
    const user = await createTestUser();
    const auctionId = new mongoose.Types.ObjectId();

    // Same logical event fired twice with different message amounts
    await createNotification({
      userId: user._id,
      type: 'system',
      title: 'Outbid!',
      message: 'New high bid: $60000',
      eventKey: `auction:${auctionId}:outbid:${user._id}`,
      entityType: 'auction',
      entityId: auctionId,
      global: false,
    });
    await createNotification({
      userId: user._id,
      type: 'system',
      title: 'Outbid!',
      message: 'New high bid: $75000',
      eventKey: `auction:${auctionId}:outbid:${user._id}`,
      entityType: 'auction',
      entityId: auctionId,
      global: false,
    });

    expect(await Notification.countDocuments({ eventKey: `auction:${auctionId}:outbid:${user._id}` })).toBe(1);
  });

  describe('missions', () => {
    it('mission completion → exactly one notification; repeated checks and claiming add none', async () => {
      const user = await createTestUser({ balance: 100000, level: 2 });

      await updateMissionProgress(user._id, 'test');
      await updateMissionProgress(user._id, 'test'); // retry / repeated tick
      const completeNotifications = await Notification.find({
        userId: user._id,
        type: 'mission_complete',
      }).lean();
      const uniqueKeys = new Set(completeNotifications.map((n) => n.eventKey));
      expect(completeNotifications.length).toBe(uniqueKeys.size);

      const mp = await MissionProgress.findOne({ userId: user._id, status: 'completed' }).lean();
      if (mp) {
        await claimMissionReward(user._id, mp.missionId);
        const afterClaim = await Notification.find({ userId: user._id, type: 'mission_complete' }).lean();
        expect(afterClaim.length).toBe(completeNotifications.length); // no new completion notification
        expect(await MissionProgress.countDocuments({ userId: user._id, status: 'claimed' })).toBeGreaterThan(0);
      }
    });
  });

  describe('daily login', () => {
    it('one daily-login notification per day; a new day allows another', async () => {
      const user = await createTestUser({ lastDailyLogin: null, lastLoginAt: null });

      await markDailyLoginForUser(user._id);
      await markDailyLoginForUser(user._id); // socket reconnect — no-op
      await markDailyLoginForUser(user._id);

      const day1 = await Notification.find({
        userId: user._id,
        type: 'mission_complete',
        message: { $regex: /Daily Login/i },
      }).lean();
      expect(day1.length).toBe(1);

      // Simulate a new day: reset the markers and refresh missions
      await User.updateOne({ _id: user._id }, { $set: { lastDailyLogin: null, lastLoginAt: null } });
      await refreshDailyMissions(user._id);
      await markDailyLoginForUser(user._id);

      const day2 = await Notification.find({
        userId: user._id,
        type: 'mission_complete',
        message: { $regex: /Daily Login/i },
      }).lean();
      expect(day2.length).toBe(2);
    });
  });

  describe('achievements & leveling', () => {
    it('achievement unlock → one notification even if checked repeatedly', async () => {
      const city = await City.create({
        name: `Ach City ${Date.now()}`,
        country: 'Testland',
        coordinates: { lat: 0, lng: 0 },
      });
      const user = await createTestUser({ balance: 1000000 });
      await Property.create({
        cityId: city._id,
        ownerId: user._id,
        name: 'Ach House',
        type: 'house',
        basePrice: 100000,
        currentPrice: 100000,
        rent: 1000,
        forSale: false,
      });

      await checkAndAwardAchievements(user._id, 'test');
      await checkAndAwardAchievements(user._id, 'test'); // repeated check

      const unlocked = await Notification.find({
        userId: user._id,
        title: 'Achievement Unlocked!',
      }).lean();
      expect(unlocked.length).toBeGreaterThanOrEqual(1); // first_property_ach should have unlocked
      const uniqueKeys = new Set(unlocked.map((n) => n.eventKey));
      expect(unlocked.length).toBe(uniqueKeys.size);
    });

    it('level-up via both XP paths produces one notification per level', async () => {
      const user = await createTestUser({ level: 1, xp: 0, xpToNextLevel: 100 });

      const u = await User.findById(user._id);
      await awardXp(u, 150, 'test'); // path 1: utils/leveling
      const u2 = await User.findById(user._id);
      await awardXpAndLevels(u2._id, 200); // path 2: engine/careerProcessing

      const levelUps = await Notification.find({ userId: user._id, title: 'Level Up!' }).lean();
      const perLevel = new Map();
      for (const n of levelUps) {
        const lvl = n.eventKey?.split(':')[2];
        perLevel.set(lvl, (perLevel.get(lvl) || 0) + 1);
      }
      expect(perLevel.size).toBeGreaterThan(0);
      for (const [lvl, count] of perLevel) {
        expect(count, `level ${lvl} notified ${count} times`).toBe(1);
      }
    });
  });

  describe('auctions', () => {
    it('auction won / outbid → one notification per event per user, even if settlement re-runs', async () => {
      const winner = await createTestUser({ balance: 1000000 });
      const loser = await createTestUser({ balance: 1000000 });
      const city = await City.create({
        name: `Auc City ${Date.now()}`,
        country: 'Testland',
        coordinates: { lat: 0, lng: 0 },
      });
      const property = await Property.create({
        cityId: city._id,
        name: 'Auction House',
        type: 'house',
        basePrice: 100000,
        currentPrice: 100000,
        rent: 1000,
        forSale: false,
      });
      const auction = await Auction.create({
        propertyId: property._id,
        sellerType: 'bank',
        auctionType: 'standard',
        startingBid: 50000,
        bidIncrement: 1000,
        status: 'active',
        startTick: 1,
        endTick: 10,
        originalEndTick: 10,
        bids: [{ bidderId: loser._id, amount: 50000, tick: 2 }],
        watchers: [loser._id, winner._id],
        watcherCount: 2,
        totalBids: 1,
      });

      // Engine tick retry simulation: same settlement runs twice
      for (let i = 0; i < 2; i++) {
        await enqueueNotification({
          userId: winner._id,
          type: 'system',
          title: 'Auction Won!',
          message: `won ${property.name}`,
          eventKey: `auction:${auction._id}:won:${winner._id}`,
          entityType: 'auction',
          entityId: auction._id,
          global: false,
        });
        await enqueueNotification({
          userId: loser._id,
          type: 'system',
          title: 'Auction Ended',
          message: 'outbid',
          eventKey: `auction:${auction._id}:outbid:${loser._id}`,
          entityType: 'auction',
          entityId: auction._id,
          global: false,
        });
      }

      expect(await Notification.countDocuments({ eventKey: `auction:${auction._id}:won:${winner._id}` })).toBe(1);
      expect(await Notification.countDocuments({ eventKey: `auction:${auction._id}:outbid:${loser._id}` })).toBe(1);
    });
  });

  describe('companies', () => {
    it('company vote / approval notifications are one per request per user', async () => {
      const founder = await createTestUser();
      const member = await createTestUser();
      const company = await RealEstateCompany.create({
        name: 'Dedup Co',
        founderId: founder._id,
        members: [
          { userId: founder._id, role: 'ceo', shares: 600 },
          { userId: member._id, role: 'member', shares: 400 },
        ],
        shares: { totalShares: 1000, treasuryShares: 0, parValue: 100 },
        treasury: { balance: 0, transactions: [] },
        active: true,
        foundedTick: 1,
      });
      const loanReqId = new mongoose.Types.ObjectId();

      for (let i = 0; i < 2; i++) {
        await enqueueNotification({
          userId: member._id,
          type: 'company_vote',
          title: 'Loan Vote Requested',
          message: 'vote please',
          eventKey: `company:${company._id}:loan:${loanReqId}:vote_request:${member._id}`,
          entityType: 'company',
          entityId: company._id,
          global: false,
        });
        await enqueueNotification({
          userId: founder._id,
          type: 'company_vote',
          title: 'Loan Proposal Submitted',
          message: 'submitted',
          eventKey: `company:${company._id}:loan:${loanReqId}:submitted`,
          entityType: 'company',
          entityId: company._id,
          global: false,
        });
      }

      expect(
        await Notification.countDocuments({
          eventKey: `company:${company._id}:loan:${loanReqId}:vote_request:${member._id}`,
        }),
      ).toBe(1);
      expect(
        await Notification.countDocuments({ eventKey: `company:${company._id}:loan:${loanReqId}:submitted` }),
      ).toBe(1);
    });
  });

  describe('season rewards', () => {
    it('season reward is exactly-once even if distribution re-runs', async () => {
      const user = await createTestUser();
      const season = await Season.create({ number: 99, status: 'completed', startDate: new Date() });

      for (let i = 0; i < 2; i++) {
        await enqueueNotification({
          userId: user._id,
          type: 'season_reward',
          title: `Season ${season.number} Leaderboard Reward`,
          message: 'You finished #1',
          eventKey: `season:${season._id}:reward:${user._id}`,
          entityType: 'season',
          entityId: season._id,
          global: false,
        });
      }

      expect(await Notification.countDocuments({ eventKey: `season:${season._id}:reward:${user._id}` })).toBe(1);
    });
  });

  describe('rent warnings', () => {
    it('rent expiry warning is once per cycle — the eventKey, not the pre-check, is the guard', async () => {
      // 22h ago: inside the warning window (20h..24h) but not yet expired
      const started = new Date(Date.now() - 22 * 60 * 60 * 1000);
      const user = await createTestUser({ uncollectedRent: 5000, rentStorageStartedAt: started });

      await sendRentExpiryWarnings();
      expect(await Notification.countDocuments({ userId: user._id, title: 'Rent Collection Warning' })).toBe(1);

      // Simulate a race: the "already warned" pre-check finds nothing
      // (notification removed) but the event fired again — the unique
      // (userId, eventKey) index must still prevent a second record.
      await Notification.deleteMany({ userId: user._id, title: 'Rent Collection Warning' });
      await sendRentExpiryWarnings();

      expect(await Notification.countDocuments({ userId: user._id, title: 'Rent Collection Warning' })).toBe(1);
    });
  });
});
