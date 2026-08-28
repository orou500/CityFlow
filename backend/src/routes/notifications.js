import { Router } from 'express';
import Notification from '../models/Notification.js';
import { authenticate } from '../middleware/auth.js';
import { emitToUser } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { runNotificationRetention } from '../engine/notificationRetention.js';
import { getUserNotificationPreferences, updateUserNotificationPreferences } from '../utils/notificationPreferences.js';
import { VALID_PRIORITIES, VALID_CATEGORIES, DEFAULT_PREFERENCES } from '../config/notificationConfig.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    await runNotificationRetention();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = { userId: req.user._id };

    const { priority, category, unread } = req.query;
    if (priority) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority: ${priority}` });
      }
      query.priority = priority;
    }
    if (category) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `Invalid category: ${category}` });
      }
      query.category = category;
    }
    if (unread === 'true') query.read = false;
    if (unread === 'false') query.read = true;

    const [notifications, total] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(query),
    ]);

    res.json({
      notifications,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
      filters: {
        priority: query.priority || null,
        category: query.category || null,
        unread: query.read === undefined ? null : query.read,
      },
    });
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({ count });
  } catch (err) {
    res.serverError(err);
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true, readAt: new Date() },
      { new: true },
    );
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    res.serverError(err);
  }
});

router.put('/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true, readAt: new Date() });
    res.json({ ok: true });
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/preferences', async (req, res) => {
  try {
    const prefs = await getUserNotificationPreferences(req.user._id);
    res.json({ preferences: prefs });
  } catch (err) {
    res.serverError(err);
  }
});

router.put('/preferences', async (req, res) => {
  try {
    const updates = {};
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (typeof req.body[key] === 'boolean') updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid preference fields provided' });
    }
    const preferences = await updateUserNotificationPreferences(req.user._id, updates);
    res.json({ preferences });
  } catch (err) {
    res.serverError(err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    if (notification.userId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden: cannot delete another user's notification" });
    }

    const deleted = await Notification.findOneAndDelete({ _id: notification._id });
    if (!deleted) return res.status(404).json({ error: 'Notification not found' });

    // Tell other open tabs/devices so they never resurrect stale state.
    emitToUser(req.user._id.toString(), SOCKET_EVENTS.NOTIFICATION_DELETED, {
      userId: req.user._id.toString(),
      notificationId: notification._id.toString(),
    });

    res.json({ ok: true, deletedId: notification._id.toString() });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
