import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { authenticate } from '../middleware/auth.js';
import { isMaintenanceMode } from '../models/GameState.js';
import { sendEmail } from '../services/email.js';
import emailTemplates from '../services/emailTemplates.js';

const router = Router();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const oauthStates = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStates) {
    if (now - value.createdAt > 10 * 60 * 1000) {
      oauthStates.delete(key);
    }
  }
}, 60 * 1000);

function generateToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '7d' });
}

function getCallbackUrl(req) {
  if (config.oauth.google.redirectUri) {
    return config.oauth.google.redirectUri;
  }
  const host = req.get('host');
  const isLocalDev = host.startsWith('localhost');
  const basePath = isLocalDev ? '' : '/api';
  return `${req.protocol}://${host}${basePath}/auth/google/callback`;
}

router.get('/google', (req, res) => {
  if (!config.oauth.google.enabled) {
    return res.status(503).json({ error: 'Google OAuth is not configured' });
  }

  const callbackUrl = getCallbackUrl(req);
  console.log('[OAUTH] Google redirect_uri:', callbackUrl);

  const state = crypto.randomBytes(32).toString('hex');
  oauthStates.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: config.oauth.google.clientId,
    redirect_uri: getCallbackUrl(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error: googleError } = req.query;

  if (googleError) {
    return res.redirect(`${config.frontendUrl}/auth/callback?error=${encodeURIComponent(googleError)}`);
  }

  if (!code || !state) {
    return res.redirect(`${config.frontendUrl}/auth/callback?error=missing_parameters`);
  }

  if (!oauthStates.has(state)) {
    return res.redirect(`${config.frontendUrl}/auth/callback?error=invalid_state`);
  }
  oauthStates.delete(state);

  try {
    if (await isMaintenanceMode()) {
      return res.redirect(
        `${config.frontendUrl}/auth/callback?error=${encodeURIComponent('CityFlow is currently undergoing maintenance')}`,
      );
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: config.oauth.google.clientId,
        client_secret: config.oauth.google.clientSecret,
        redirect_uri: getCallbackUrl(req),
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[OAUTH] Google token exchange failed:', tokenData);
      return res.redirect(`${config.frontendUrl}/auth/callback?error=token_exchange_failed`);
    }

    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleUser = await userInfoResponse.json();

    if (!userInfoResponse.ok || !googleUser.email) {
      console.error('[OAUTH] Google userinfo failed:', googleUser);
      return res.redirect(`${config.frontendUrl}/auth/callback?error=userinfo_failed`);
    }

    const { email, sub: googleId, name, picture } = googleUser;

    let user = await User.findOne({
      'oauth.provider': 'google',
      'oauth.providerId': googleId,
    });

    if (!user) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        if (user.oauth && user.oauth.provider) {
          return res.redirect(
            `${config.frontendUrl}/auth/callback?error=${encodeURIComponent('This email is already linked to another OAuth provider')}`,
          );
        }
        user.oauth = { provider: 'google', providerId: googleId };
        if (picture && !user.avatar) {
          user.avatar = picture;
        }
        await user.save({ validateBeforeSave: false });
      } else {
        const baseUsername = (name || email.split('@')[0])
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 20);
        let username = baseUsername || 'user';
        let suffix = 0;
        while (await User.findOne({ normalizedUsername: username + (suffix || '') })) {
          suffix++;
          if (suffix > 9999) break;
        }
        username = username + (suffix || '');

        const now = new Date();
        user = await User.create({
          username,
          email: email.toLowerCase(),
          oauth: { provider: 'google', providerId: googleId },
          avatar: picture || '',
          emailVerified: true,
          emailVerifiedAt: now,
          acceptedTerms: true,
          acceptedTermsAt: now,
          acceptedPrivacy: true,
          acceptedPrivacyAt: now,
        });

        const welcomeTemplate = emailTemplates.welcome({ username: user.username });
        sendEmail({ to: user.email, ...welcomeTemplate }).catch((err) => {
          console.error(`[OAUTH] Failed to send welcome email to ${user.email}: ${err.message}`);
        });
      }
    }

    if (user.banned) {
      return res.redirect(`${config.frontendUrl}/auth/callback?error=account_banned`);
    }

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    const token = generateToken(user._id);
    res.redirect(`${config.frontendUrl}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('[OAUTH] Google callback error:', err);
    res.redirect(`${config.frontendUrl}/auth/callback?error=internal_error`);
  }
});

router.get('/status', authenticate, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({
    hasPassword: !!user.password,
    oauth: {
      provider: user.oauth?.provider || null,
      linked: !!user.oauth?.provider,
    },
  });
});

router.post('/unlink', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.password && !(user.oauth?.provider)) {
      return res.status(400).json({ error: 'Cannot unlink: you must have a password or OAuth provider' });
    }

    if (!user.oauth?.provider) {
      return res.status(400).json({ error: 'No OAuth provider linked to your account' });
    }

    user.oauth = { provider: null, providerId: null };
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'OAuth provider unlinked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
