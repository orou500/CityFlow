import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import User from '../models/User.js';
import { generateLinkCode, verifyLinkCode, removeDiscordLink } from '../services/discordBot.js';
import DiscordNotificationSettings from '../models/DiscordNotificationSettings.js';

const router = Router();

router.post('/link/generate', authenticate, async (req, res) => {
  try {
    const code = await generateLinkCode(req.user._id.toString());
    if (!code) {
      return res.status(503).json({ error: 'Discord bot is unavailable' });
    }
    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/link/verify', authenticate, async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }

  try {
    const discordUserId = await verifyLinkCode(code);
    if (!discordUserId) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    await User.findByIdAndUpdate(req.user._id, { discordId: discordUserId });

    res.json({ success: true, discordUserId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/link', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.discordId) {
      await removeDiscordLink(user.discordId);
    }
    await User.findByIdAndUpdate(req.user._id, { discordId: null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/link/status', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('discordId');
    res.json({ linked: !!user.discordId, discordId: user.discordId || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications/settings', authenticate, async (req, res) => {
  try {
    let settings = await DiscordNotificationSettings.findOne({ userId: req.user._id });
    if (!settings) {
      settings = await DiscordNotificationSettings.create({ userId: req.user._id });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/notifications/settings', authenticate, async (req, res) => {
  const { enabled, preferences } = req.body;

  try {
    let settings = await DiscordNotificationSettings.findOne({ userId: req.user._id });
    if (!settings) {
      settings = new DiscordNotificationSettings({ userId: req.user._id });
    }

    if (enabled !== undefined) settings.enabled = enabled;
    if (preferences) {
      if (preferences.gameEvents !== undefined) settings.preferences.gameEvents = preferences.gameEvents;
      if (preferences.achievements !== undefined) settings.preferences.achievements = preferences.achievements;
      if (preferences.systemAlerts !== undefined) settings.preferences.systemAlerts = preferences.systemAlerts;
      if (preferences.worldEvents !== undefined) settings.preferences.worldEvents = preferences.worldEvents;
    }

    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
