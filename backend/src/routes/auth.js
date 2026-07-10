import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function generateToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword, acceptedTerms, acceptedPrivacy } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy' });
    }
    const normalizedUsername = username.toLowerCase().trim();
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { normalizedUsername }] });
    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    const now = new Date();
    const user = await User.create({
      username,
      email,
      password,
      acceptedTerms: true,
      acceptedTermsAt: now,
      acceptedPrivacy: true,
      acceptedPrivacyAt: now,
    });
    const token = generateToken(user._id);
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }
    const normalizedLogin = login.toLowerCase().trim();
    const user = await User.findOne({
      $or: [{ normalizedUsername: normalizedLogin }, { email: normalizedLogin }],
    });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }
    user.lastLoginAt = new Date();
    await user.save();
    const token = generateToken(user._id);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user._id).populate('ownedProperties');
  res.json(user);
});

export default router;
