import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { authenticate } from '../middleware/auth.js';
import { isMaintenanceMode } from '../models/GameState.js';
import { sendEmail } from '../services/email.js';
import emailTemplates from '../services/emailTemplates.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { downloadOAuthAvatar } from '../services/avatarDownload.js';
import { validatePassword } from '../utils/validatePassword.js';
import { awardXp } from '../utils/leveling.js';

const router = Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl:reg',
  message: 'Too many registration attempts. Please try again in an hour.',
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'rl:login',
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

const resendVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyPrefix: 'rl:rv',
  message: 'Too many verification emails requested. Please try again in 15 minutes.',
});

const forgotPwLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyPrefix: 'rl:fp',
  message: 'Too many password reset requests. Please try again in 15 minutes.',
});

const setPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl:setpw',
  message: 'Too many password set attempts. Please try again later.',
});

function generateToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '7d' });
}

router.post('/register', registerLimiter, async (req, res) => {
  try {
    if (await isMaintenanceMode()) {
      return res
        .status(503)
        .json({ error: 'CityFlow is currently undergoing maintenance. Registration is temporarily disabled.' });
    }
    const { username, email, password, confirmPassword, acceptedTerms, acceptedPrivacy } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
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

    const verificationToken = user.createVerificationToken();
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${config.emailFrom?.includes('http') ? config.emailFrom : 'https://cityflow.sizops.co.il'}/verify-email?token=${verificationToken}`;
    const template = emailTemplates.verification({ username: user.username, verifyUrl });

    sendEmail({ to: user.email, ...template }).catch((err) => {
      console.error(`[AUTH] Failed to send verification email to ${user.email}: ${err.message}`);
    });

    const welcomeTemplate = emailTemplates.welcome({ username: user.username });
    sendEmail({ to: user.email, ...welcomeTemplate }).catch((err) => {
      console.error(`[AUTH] Failed to send welcome email to ${user.email}: ${err.message}`);
    });

    res.status(201).json({ message: 'Account created. Please verify your email before logging in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
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
    if (!user.emailVerified && user.role !== 'admin') {
      return res.status(403).json({ error: 'Please verify your email before logging in' });
    }
    if (await isMaintenanceMode()) {
      if (user.role !== 'admin') {
        return res
          .status(503)
          .json({ error: 'CityFlow is currently undergoing maintenance. Please check back later.' });
      }
    }
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    if (user.avatar && (user.avatar.startsWith('http://') || user.avatar.startsWith('https://'))) {
      const localPath = await downloadOAuthAvatar(user._id, user.avatar);
      if (localPath) {
        user.avatar = localPath;
        await user.save({ validateBeforeSave: false });
      }
    }

    const token = generateToken(user._id);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user._id).populate('ownedProperties');
  if (user.avatar && (user.avatar.startsWith('http://') || user.avatar.startsWith('https://'))) {
    const localPath = await downloadOAuthAvatar(user._id, user.avatar);
    if (localPath) {
      user.avatar = localPath;
      await user.save({ validateBeforeSave: false });
    }
  }
  res.json(user);
});

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Verification token is required' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationExpires: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired verification token' });

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.verificationToken = null;
    user.verificationExpires = null;
    await user.save({ validateBeforeSave: false });

    await awardXp(user, 10, 'email_verified');

    const template = emailTemplates.accountActivated({ username: user.username });
    sendEmail({ to: user.email, ...template }).catch((err) => {
      console.error(`[AUTH] Failed to send welcome email to ${user.email}: ${err.message}`);
    });

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/resend-verification', resendVerifyLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || user.emailVerified) {
      return res.json({ success: true, message: 'If an unverified account exists, a new link has been sent.' });
    }

    const verificationToken = user.createVerificationToken();
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${config.emailFrom?.includes('http') ? config.emailFrom : 'https://cityflow.sizops.co.il'}/verify-email?token=${verificationToken}`;
    const template = emailTemplates.verification({ username: user.username, verifyUrl });

    sendEmail({ to: user.email, ...template }).catch((err) => {
      console.error(`[AUTH] Failed to resend verification email to ${user.email}: ${err.message}`);
    });

    res.json({ success: true, message: 'If an unverified account exists, a new link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/forgot-password', forgotPwLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${config.emailFrom?.includes('http') ? config.emailFrom : 'https://cityflow.sizops.co.il'}/reset-password?token=${resetToken}`;
    const template = emailTemplates.passwordReset({ username: user.username, resetUrl });

    sendEmail({ to: user.email, ...template }).catch((err) => {
      console.error(`[AUTH] Failed to send password reset email to ${user.email}: ${err.message}`);
    });

    res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/set-password', authenticate, setPasswordLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }
      const valid = await user.comparePassword(currentPassword);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password set successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
