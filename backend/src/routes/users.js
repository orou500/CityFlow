import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Loan from '../models/Loan.js';
import Transaction from '../models/Transaction.js';
import { authenticate } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only jpg, jpeg, png, webp files are allowed'));
  },
});

const router = Router();

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const properties = await Property.find({ ownerId: user._id }).populate('cityId');
    const loans = await Loan.find({ userId: user._id, active: true });
    const transactions = await Transaction.find({
      $or: [{ buyerId: user._id }, { sellerId: user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('propertyId');
    res.json({ user, properties, loans, transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json([]);
    const users = await User.find({
      $or: [
        { normalizedUsername: { $regex: q.toLowerCase(), $options: 'i' } },
        { displayName: { $regex: q, $options: 'i' } },
      ],
    })
      .select('username normalizedUsername displayName avatar')
      .limit(10);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:username', authenticate, async (req, res) => {
  try {
    const user = await User.findOne({ normalizedUsername: req.params.username.toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const properties = await Property.find({ ownerId: user._id }).populate('cityId');
    const portfolioValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
    const totalRent = properties.reduce((sum, p) => sum + (p.rent || 0), 0);
    const netWorth = user.balance + portfolioValue;
    const isOwner = req.user._id.equals(user._id);

    let transactions = [];
    if (user.profileVisibility.activity || isOwner) {
      transactions = await Transaction.find({
        $or: [{ buyerId: user._id }, { sellerId: user._id }],
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('propertyId');
    }

    res.json({
      user,
      properties: user.profileVisibility.portfolio || isOwner ? properties : [],
      portfolioValue,
      totalRent,
      netWorth,
      transactions,
      isOwner,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', authenticate, async (req, res) => {
  try {
    const { displayName, bio, profileVisibility } = req.body;
    if (displayName !== undefined) req.user.displayName = String(displayName).slice(0, 50);
    if (bio !== undefined) req.user.bio = String(bio).slice(0, 500);
    if (profileVisibility) {
      if (typeof profileVisibility.portfolio === 'boolean')
        req.user.profileVisibility.portfolio = profileVisibility.portfolio;
      if (typeof profileVisibility.activity === 'boolean')
        req.user.profileVisibility.activity = profileVisibility.activity;
    }
    await req.user.save();
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const isMatch = await req.user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    req.user.password = newPassword;
    await req.user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/avatar', authenticate, (req, res) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const avatarsDir = path.join(__dirname, '../../uploads/avatars');
      const filename = `${req.user._id}.webp`;
      const outputPath = path.join(avatarsDir, filename);

      const files = await fs.readdir(avatarsDir);
      for (const file of files) {
        if (file.startsWith(req.user._id.toString())) {
          await fs.unlink(path.join(avatarsDir, file)).catch(() => {});
        }
      }

      await sharp(req.file.buffer)
        .resize(256, 256, { fit: 'cover', position: 'center' })
        .webp({ quality: 80 })
        .toFile(outputPath);

      req.user.avatar = `/uploads/avatars/${filename}`;
      await req.user.save();
      res.json({ avatar: req.user.avatar });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

router.put('/theme', authenticate, async (req, res) => {
  try {
    const { theme } = req.body;
    if (!['light', 'dark', 'system'].includes(theme)) {
      return res.status(400).json({ error: 'Invalid theme' });
    }
    req.user.theme = theme;
    await req.user.save();
    res.json({ theme });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/language', authenticate, async (req, res) => {
  try {
    const { language } = req.body;
    if (!['en', 'he'].includes(language)) {
      return res.status(400).json({ error: 'Invalid language' });
    }
    req.user.preferredLanguage = language;
    await req.user.save();
    res.json({ preferredLanguage: language });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/onboarding', authenticate, async (req, res) => {
  try {
    const { completed } = req.body;
    req.user.onboarding = {
      completed: !!completed,
      completedAt: completed ? new Date() : null,
    };
    await req.user.save();
    res.json({ onboarding: req.user.onboarding });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
