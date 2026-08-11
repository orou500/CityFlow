import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Notification from '../../models/Notification.js';
import { createNotification, bulkCreateNotifications } from '../../utils/notificationQueue.js';
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  isNotificationAllowed,
} from '../../utils/notificationPreferences.js';
import { runNotificationRetention } from '../notificationRetention.js';
import { ensureRentReadyNotification, clearRentReadyNotification } from '../rentProcessing.js';
import {
  getNotificationMeta,
  resolveNotificationMeta,
  PRIORITY,
  CATEGORY,
  MAX_UNREAD_NOTIFICATIONS,
  RENT_READY_EVENT_KEY,
  DEFAULT_PREFERENCES,
} from '../../config/notificationConfig.js';
import { createTestUser } from '../../test/helpers.js';

/**
 * Notification system overhaul — priority/category metadata, merge mode,
 * bulk creation, preference gating, unread caps, retention, and the merged
 * rent-ready notification.
 */
describe('Notification system overhaul', () => {
  beforeAll(async () => {
    await Notification.deleteMany({});
  });

  afterAll(async () => {
    await Notification.deleteMany({});
  });

  describe('priority & category mapping', () => {
    it('maps auction won/outbid to critical auction', () => {
      const meta = getNotificationMeta('auction:abc:won:def', 'system');
      expect(meta).toEqual({ priority: PRIORITY.CRITICAL, category: CATEGORY.AUCTION });
    });

    it('maps auction extended to medium auction', () => {
      const meta = getNotificationMeta('auction:abc:extended:def', 'system');
      expect(meta.priority).toBe(PRIORITY.MEDIUM);
      expect(meta.category).toBe(CATEGORY.AUCTION);
    });

    it('maps rent expired to critical rent and rent ready to high rent', () => {
      expect(getNotificationMeta('rent:abc:expired:def')).toEqual({
        priority: PRIORITY.CRITICAL,
        category: CATEGORY.RENT,
      });
      expect(getNotificationMeta('rent:ready:abc')).toEqual({ priority: PRIORITY.HIGH, category: CATEGORY.RENT });
    });

    it('maps mission completion to high mission', () => {
      expect(getNotificationMeta('mission:abc:completed')).toEqual({
        priority: PRIORITY.HIGH,
        category: CATEGORY.MISSION,
      });
    });

    it('explicit payload priority/category override eventKey derivation', () => {
      const meta = resolveNotificationMeta({
        eventKey: 'mission:abc:completed',
        priority: PRIORITY.LOW,
        category: CATEGORY.SYSTEM,
      });
      expect(meta).toEqual({ priority: PRIORITY.LOW, category: CATEGORY.SYSTEM });
    });
  });

  describe('merge mode', () => {
    it('recurring reminders merge into ONE notification with the latest message', async () => {
      const user = await createTestUser();

      const first = await createNotification(
        {
          userId: user._id,
          type: 'system',
          title: 'Rent Ready to Collect',
          message: 'You have $1,000 in uncollected rent.',
          eventKey: `rent:ready:${user._id}`,
          route: '/dashboard',
          entityType: 'dashboard',
          global: false,
        },
        { merge: true },
      );
      expect(first.created).toBe(true);

      const second = await createNotification(
        {
          userId: user._id,
          type: 'system',
          title: 'Rent Ready to Collect',
          message: 'You have $2,500 in uncollected rent.',
          eventKey: `rent:ready:${user._id}`,
          route: '/dashboard',
          entityType: 'dashboard',
          global: false,
        },
        { merge: true },
      );
      expect(second.created).toBe(false);

      const all = await Notification.find({ userId: user._id, eventKey: `rent:ready:${user._id}` }).lean();
      expect(all.length).toBe(1);
      expect(all[0].message).toContain('$2,500');
    });

    it('non-merge mode never overwrites an existing event', async () => {
      const user = await createTestUser();
      const key = `rent:ready:${user._id}:nomerge`;

      await createNotification({
        userId: user._id,
        type: 'system',
        title: 'First',
        message: 'original',
        eventKey: key,
        global: false,
      });
      await createNotification({
        userId: user._id,
        type: 'system',
        title: 'Second',
        message: 'should not appear',
        eventKey: key,
        global: false,
      });

      const doc = await Notification.findOne({ eventKey: key }).lean();
      expect(doc.title).toBe('First');
      expect(doc.message).toBe('original');
    });
  });

  describe('bulk creation', () => {
    it('dedupes identical eventKeys within one bulk call and creates distinct ones', async () => {
      const user = await createTestUser();
      const result = await bulkCreateNotifications([
        {
          userId: user._id,
          type: 'system',
          title: 'A',
          message: 'a1',
          eventKey: `bulk:same:${user._id}`,
          global: false,
        },
        {
          userId: user._id,
          type: 'system',
          title: 'A',
          message: 'a2',
          eventKey: `bulk:same:${user._id}`,
          global: false,
        },
        {
          userId: user._id,
          type: 'system',
          title: 'B',
          message: 'b',
          eventKey: `bulk:other:${user._id}`,
          global: false,
        },
      ]);

      expect(result.created).toBe(2);
      expect(result.duplicates).toBe(1);
      expect(
        await Notification.countDocuments({
          userId: user._id,
          eventKey: { $in: [`bulk:same:${user._id}`, `bulk:other:${user._id}`] },
        }),
      ).toBe(2);
    });

    it('suppresses notifications for users with the category disabled (bulk + single)', async () => {
      const user = await createTestUser();
      await updateUserNotificationPreferences(user._id, { mission: false });

      const single = await createNotification({
        userId: user._id,
        type: 'mission_complete',
        title: 'Mission!',
        message: 'done',
        eventKey: `mission:skipme:completed`,
        global: false,
      });
      expect(single.skipped).toBe(true);
      expect(await Notification.countDocuments({ userId: user._id, eventKey: 'mission:skipme:completed' })).toBe(0);

      const bulk = await bulkCreateNotifications([
        {
          userId: user._id,
          type: 'mission_complete',
          title: 'M1',
          message: 'm',
          eventKey: `mission:bulk1:completed`,
          global: false,
        },
        {
          userId: user._id,
          type: 'system',
          title: 'S',
          message: 's',
          eventKey: `system:always:${user._id}`,
          global: false,
        },
      ]);
      expect(bulk.skipped).toBe(1);
      expect(await Notification.countDocuments({ userId: user._id, eventKey: 'mission:bulk1:completed' })).toBe(0);
      expect(await Notification.countDocuments({ userId: user._id, eventKey: `system:always:${user._id}` })).toBe(1);
    });

    it('critical notifications bypass disabled preferences', async () => {
      const user = await createTestUser();
      await updateUserNotificationPreferences(user._id, { property: false });

      const result = await createNotification({
        userId: user._id,
        type: 'system',
        title: 'Hazard!',
        message: 'risk',
        eventKey: `rent:${user._id}:expired:2026-01-01`,
        global: false,
      });
      expect(result.created).toBe(true);
      expect(
        await Notification.countDocuments({ userId: user._id, eventKey: `rent:${user._id}:expired:2026-01-01` }),
      ).toBe(1);
    });

    it('drops new LOW-priority notifications when the user is over the unread cap', async () => {
      const user = await createTestUser();
      const userIdStr = user._id.toString();

      // Fill the user's unread list to/over the cap with low-priority rows.
      const bulk = await bulkCreateNotifications(
        Array.from({ length: MAX_UNREAD_NOTIFICATIONS + 5 }, (_, i) => ({
          userId: user._id,
          type: 'system',
          title: `Fill ${i}`,
          message: `unread ${i}`,
          eventKey: `bulk:fill:${userIdStr}:${i}`,
          global: false,
        })),
      );
      expect(bulk.created).toBeGreaterThanOrEqual(MAX_UNREAD_NOTIFICATIONS);

      // A new LOW-priority notification should now be dropped.
      const low = await createNotification({
        userId: user._id,
        type: 'system',
        title: 'Low',
        message: 'dropped',
        eventKey: `bulk:low:${userIdStr}:1`,
        global: false,
      });
      expect(low.created).toBe(false);

      // A critical one still passes.
      const critical = await createNotification({
        userId: user._id,
        type: 'system',
        title: 'Critical',
        message: 'kept',
        eventKey: `auction:${userIdStr}:won:${userIdStr}`,
        global: false,
      });
      expect(critical.created).toBe(true);
    });
  });

  describe('preferences', () => {
    it('defaults to all enabled and persists only known keys', async () => {
      const user = await createTestUser();
      const prefs = await getUserNotificationPreferences(user._id);
      expect(prefs).toEqual(DEFAULT_PREFERENCES);

      const updated = await updateUserNotificationPreferences(user._id, { mission: false, bogus: true });
      expect(updated.mission).toBe(false);
      expect(updated.bogus).toBeUndefined();
      expect(Object.keys(updated).sort()).toEqual(Object.keys(DEFAULT_PREFERENCES).sort());

      const reloaded = await getUserNotificationPreferences(user._id);
      expect(reloaded.mission).toBe(false);
      expect(reloaded.company).toBe(true);
    });

    it('isNotificationAllowed gates by category and never by critical', async () => {
      const user = await createTestUser();
      await updateUserNotificationPreferences(user._id, { mission: false });

      expect(await isNotificationAllowed(user._id, PRIORITY.HIGH, CATEGORY.MISSION)).toBe(false);
      expect(await isNotificationAllowed(user._id, PRIORITY.CRITICAL, CATEGORY.MISSION)).toBe(true);
    });
  });

  describe('retention', () => {
    it('prunes old read notifications but keeps unread and recent ones', async () => {
      const user = await createTestUser();

      const oldRead = await Notification.create({
        userId: user._id,
        type: 'system',
        title: 'Old',
        message: 'old read',
        eventKey: `ret:${user._id}:oldread`,
        global: false,
        read: true,
        readAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      });
      const oldUnread = await Notification.create({
        userId: user._id,
        type: 'system',
        title: 'Old Unread',
        message: 'kept',
        eventKey: `ret:${user._id}:oldunread`,
        global: false,
        read: false,
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      });
      const recentRead = await Notification.create({
        userId: user._id,
        type: 'system',
        title: 'Recent',
        message: 'kept',
        eventKey: `ret:${user._id}:recent`,
        global: false,
        read: true,
        readAt: new Date(),
      });
      const oldCriticalRead = await Notification.create({
        userId: user._id,
        type: 'system',
        title: 'Old Critical',
        message: 'kept longer',
        eventKey: `auction:${user._id}:won:${user._id}`,
        global: false,
        priority: PRIORITY.CRITICAL,
        read: true,
        readAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      });

      await runNotificationRetention();

      expect(await Notification.findById(oldRead._id)).toBeNull();
      expect(await Notification.findById(oldUnread._id)).not.toBeNull();
      expect(await Notification.findById(recentRead._id)).not.toBeNull();
      expect(await Notification.findById(oldCriticalRead._id)).not.toBeNull();

      // A critical read notification OLDER than the critical window is pruned.
      const veryOldCritical = await Notification.create({
        userId: user._id,
        type: 'system',
        title: 'Ancient Critical',
        message: 'pruned',
        eventKey: `auction:${user._id}:won:${user._id}:2`,
        global: false,
        priority: PRIORITY.CRITICAL,
        read: true,
        readAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      });
      await runNotificationRetention();
      expect(await Notification.findById(veryOldCritical._id)).toBeNull();
    });

    it('prunes legacy read rows with no readAt via updatedAt', async () => {
      const user = await createTestUser();
      const legacy = await Notification.collection.insertOne({
        userId: user._id,
        type: 'system',
        title: 'Legacy',
        message: 'old',
        eventKey: `ret:${user._id}:legacy`,
        global: false,
        read: true,
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      });
      await runNotificationRetention();
      expect(await Notification.findById(legacy.insertedId)).toBeNull();
    });
  });

  describe('rent-ready merged notification', () => {
    it('creates one merged notification above the minimum and clears on collect', async () => {
      const user = await createTestUser();

      const a = await ensureRentReadyNotification(user._id, 500);
      expect(a.created).toBe(true);

      // Next accrual refreshes the same record — still one notification.
      const b = await ensureRentReadyNotification(user._id, 1500);
      expect(b.created).toBe(false);
      expect(await Notification.countDocuments({ userId: user._id, eventKey: RENT_READY_EVENT_KEY(user._id) })).toBe(1);

      const doc = await Notification.findOne({ userId: user._id, eventKey: RENT_READY_EVENT_KEY(user._id) }).lean();
      expect(doc.priority).toBe(PRIORITY.CRITICAL);
      expect(doc.category).toBe(CATEGORY.RENT);

      await clearRentReadyNotification(user._id);
      expect(await Notification.countDocuments({ userId: user._id, eventKey: RENT_READY_EVENT_KEY(user._id) })).toBe(0);
    });

    it('does not create a notification below the minimum amount', async () => {
      const user = await createTestUser();
      const result = await ensureRentReadyNotification(user._id, 50);
      expect(result.skipped).toBe(true);
      expect(await Notification.countDocuments({ userId: user._id, eventKey: RENT_READY_EVENT_KEY(user._id) })).toBe(0);
    });
  });
});
