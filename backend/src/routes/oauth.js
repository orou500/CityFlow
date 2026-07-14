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

const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USERINFO_URL = 'https://discord.com/api/users/@me';

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

function getGoogleCallbackUrl(req) {
  if (config.oauth.google.redirectUri) {
    return config.oauth.google.redirectUri;
  }
  const host = req.get('host');
  const isLocalDev = host.startsWith('localhost');
  const basePath = isLocalDev ? '' : '/api';
  return `${req.protocol}://${host}${basePath}/auth/google/callback`;
}

function getDiscordCallbackUrl(req) {
  if (config.oauth.discord.redirectUri) {
    return config.oauth.discord.redirectUri;
  }
  const host = req.get('host');
  const isLocalDev = host.startsWith('localhost');
  const basePath = isLocalDev ? '' : '/api';
  return `${req.protocol}://${host}${basePath}/auth/discord/callback`;
}

async function handleOAuthCallback({ provider, providerId, email, name, avatar }) {
  if (await isMaintenanceMode()) {
    return { redirect: `${config.frontendUrl}/auth/callback?error=${encodeURIComponent('CityFlow is currently undergoing maintenance')}` };
  }

  let user = await User.findOne({
    oauthProviders: { $elemMatch: { provider, providerId } },
  });

  let isNewUser = false;

  if (!user) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const alreadyLinked = user.oauthProviders.some((p) => p.provider === provider);
      if (!alreadyLinked) {
        user.oauthProviders.push({ provider, providerId });
        if (avatar && !user.avatar) {
          user.avatar = avatar;
        }
        await user.save({ validateBeforeSave: false });
      }
    } else {
      isNewUser = true;
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
        normalizedUsername: username.toLowerCase().trim(),
        email: email.toLowerCase(),
        oauthProviders: [{ provider, providerId }],
        avatar: avatar || '',
        emailVerified: true,
        emailVerifiedAt: now,
        acceptedTerms: false,
        acceptedPrivacy: false,
      });

      const welcomeTemplate = emailTemplates.welcome({ username: user.username });
      sendEmail({ to: user.email, ...welcomeTemplate }).catch((err) => {
        console.error(`[OAUTH] Failed to send welcome email to ${user.email}: ${err.message}`);
      });
    }
  }

  if (user.banned) {
    return { redirect: `${config.frontendUrl}/auth/callback?error=account_banned` };
  }

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  const token = generateToken(user._id);
  const params = new URLSearchParams({ token });
  if (isNewUser) params.set('new_user', '1');
  return { redirect: `${config.frontendUrl}/auth/callback?${params.toString()}` };
}

router.get('/google', (req, res) => {
  if (!config.oauth.google.enabled) {
    return res.status(503).json({ error: 'Google OAuth is not configured' });
  }

  const callbackUrl = getGoogleCallbackUrl(req);
  console.log('[OAUTH] Google redirect_uri:', callbackUrl);

  const state = crypto.randomBytes(32).toString('hex');
  oauthStates.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: config.oauth.google.clientId,
    redirect_uri: callbackUrl,
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
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: config.oauth.google.clientId,
        client_secret: config.oauth.google.clientSecret,
        redirect_uri: getGoogleCallbackUrl(req),
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

    const result = await handleOAuthCallback({
      provider: 'google',
      providerId: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name,
      avatar: googleUser.picture,
    });

    res.redirect(result.redirect);
  } catch (err) {
    console.error('[OAUTH] Google callback error:', err);
    res.redirect(`${config.frontendUrl}/auth/callback?error=internal_error`);
  }
});

router.get('/discord', (req, res) => {
  if (!config.oauth.discord.enabled) {
    return res.status(503).json({ error: 'Discord OAuth is not configured' });
  }

  const callbackUrl = getDiscordCallbackUrl(req);
  console.log('[OAUTH] Discord redirect_uri:', callbackUrl);

  const state = crypto.randomBytes(32).toString('hex');
  oauthStates.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: config.oauth.discord.clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'identify email',
    state,
  });

  res.redirect(`${DISCORD_AUTH_URL}?${params.toString()}`);
});

router.get('/discord/callback', async (req, res) => {
  const { code, state, error: discordError } = req.query;

  if (discordError) {
    return res.redirect(`${config.frontendUrl}/auth/callback?error=${encodeURIComponent(discordError)}`);
  }

  if (!code || !state) {
    return res.redirect(`${config.frontendUrl}/auth/callback?error=missing_parameters`);
  }

  if (!oauthStates.has(state)) {
    return res.redirect(`${config.frontendUrl}/auth/callback?error=invalid_state`);
  }
  oauthStates.delete(state);

  try {
    const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.oauth.discord.clientId,
        client_secret: config.oauth.discord.clientSecret,
        redirect_uri: getDiscordCallbackUrl(req),
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[OAUTH] Discord token exchange failed:', tokenData);
      return res.redirect(`${config.frontendUrl}/auth/callback?error=token_exchange_failed`);
    }

    const userInfoResponse = await fetch(DISCORD_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const discordUser = await userInfoResponse.json();

    if (!userInfoResponse.ok || !discordUser.email) {
      console.error('[OAUTH] Discord userinfo failed:', discordUser);
      return res.redirect(`${config.frontendUrl}/auth/callback?error=userinfo_failed`);
    }

    const avatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : '';

    const result = await handleOAuthCallback({
      provider: 'discord',
      providerId: discordUser.id,
      email: discordUser.email,
      name: discordUser.username,
      avatar,
    });

    res.redirect(result.redirect);
  } catch (err) {
    console.error('[OAUTH] Discord callback error:', err);
    res.redirect(`${config.frontendUrl}/auth/callback?error=internal_error`);
  }
});

router.get('/status', authenticate, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({
    hasPassword: !!user.password,
    providers: (user.oauthProviders || []).map((p) => p.provider),
  });
});

router.post('/unlink', authenticate, async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    const user = await User.findById(req.user._id);
    const hasProvider = user.oauthProviders.some((p) => p.provider === provider);

    if (!hasProvider) {
      return res.status(400).json({ error: `No ${provider} provider linked to your account` });
    }

    if (!user.password && user.oauthProviders.length <= 1) {
      return res.status(400).json({ error: 'Cannot unlink: you must have a password or at least one OAuth provider' });
    }

    user.oauthProviders = user.oauthProviders.filter((p) => p.provider !== provider);
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: `${provider} unlinked successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/accept-terms', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    user.acceptedTerms = true;
    user.acceptedTermsAt = now;
    user.acceptedPrivacy = true;
    user.acceptedPrivacyAt = now;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
