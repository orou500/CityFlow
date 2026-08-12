import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import SizopsAuditLog from '../models/SizopsAuditLog.js';
import { config, describeOidcMisconfig } from '../config/index.js';
import { authenticate } from '../middleware/auth.js';
import { isMaintenanceMode } from '../models/GameState.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import Transaction from '../models/Transaction.js';
import {
  buildAuthorizeUrl,
  exchangeCode,
  generatePkcePair,
  registerGamePlayer,
  verifyIdToken,
} from '../services/sizopsOidc.js';

const router = Router();

const callbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'rl:sizops',
  message: 'Too many SizOps callback attempts. Please try again in 15 minutes.',
});

const unlinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl:sizops-unlink',
  message: 'Too many unlink attempts. Please try again later.',
});

function generateToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '7d' });
}

function signState(payload) {
  return jwt.sign({ provider: 'sizops', ...payload }, config.jwtSecret, { expiresIn: '10m' });
}

function verifyState(token) {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    return decoded?.provider === 'sizops' ? decoded : null;
  } catch {
    return null;
  }
}

function errorRedirect(error) {
  return `${config.frontendUrl}/auth/callback?error=${encodeURIComponent(error)}`;
}

function getCallbackUrl(req) {
  const host = req.get('host');
  const isLocalDev = host?.startsWith('localhost');
  if (!isLocalDev && config.sizops.oidc.redirectUri) {
    return config.sizops.oidc.redirectUri;
  }
  const basePath = isLocalDev ? '' : '/api';
  return `${req.protocol}://${host}${basePath}/auth/sizops/callback`;
}

async function writeAudit(action, userId, req, details = {}) {
  await SizopsAuditLog.create({
    userId,
    action,
    details,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }).catch((err) => {
    console.error(`[SIZOPS] Audit write failed (${action}): ${err.message}`);
  });
}

function maskUserId(sizopsUserId) {
  if (!sizopsUserId) return '';
  if (sizopsUserId.length <= 4) return '****';
  return `****${sizopsUserId.slice(-4)}`;
}

async function generateUniqueUsername(base) {
  let username = base;
  let suffix = 0;
  while (await User.findOne({ normalizedUsername: username + (suffix || '') })) {
    suffix++;
    if (suffix > 9999) break;
  }
  return username + (suffix || '');
}

/**
 * Shared post-identity login tail — mirrors the existing OAuth/login handlers:
 * banned/deleted checks, lastLogin tracking, progression, and the existing
 * CityFlow JWT. Never issues a SizOps token as the game session token.
 */
async function finalizeLogin(user, req, isNewUser) {
  if (user.banned) {
    return { redirect: errorRedirect('account_banned') };
  }

  if (user.deletedAt) {
    const deletedAgo = Date.now() - user.deletedAt.getTime();
    if (deletedAgo > 24 * 60 * 60 * 1000) {
      await User.deleteOne({ _id: user._id });
      return { redirect: errorRedirect('account_permanently_deleted') };
    }
    const restoreToken = jwt.sign({ userId: user._id, restore: true }, config.jwtSecret, { expiresIn: '24h' });
    return { redirect: `${config.frontendUrl}/auth/callback?deleted=true&restoreToken=${restoreToken}` };
  }

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), lastDailyLogin: new Date() } });
  await processPlayerProgress(user._id, 'login');
  await Transaction.create({ buyerId: user._id, price: 0, type: 'login' }).catch(() => {});

  const token = generateToken(user._id);
  const params = new URLSearchParams({ token });
  if (isNewUser) params.set('new_user', '1');
  return { redirect: `${config.frontendUrl}/auth/callback?${params.toString()}` };
}

/** Finds the CityFlow user for a verified SizOps `sub`, creating one if needed. */
async function findOrCreateUserForSizOps(sub, claims) {
  const existing = await User.findOne({ sizopsUserId: sub });
  if (existing) return { user: existing, isNewUser: false };

  const email = claims.email ? String(claims.email).toLowerCase().trim() : null;
  let emailForUser = email;
  if (emailForUser) {
    // The email is only stored for display/contact — it is NEVER used to
    // match accounts. If another account already uses it, fall back to a
    // generated address rather than failing (or worse, merging) accounts.
    const emailTaken = await User.findOne({ email: emailForUser });
    if (emailTaken) emailForUser = null;
  }
  if (!emailForUser) {
    const hash = sub.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || cryptoRandomSuffix();
    emailForUser = `sizops_${hash}@sizops.local`;
  }

  const emailPrefix = emailForUser.split('@')[0] || '';
  const baseUsername = (
    emailPrefix
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 20) || 'player'
  ).toLowerCase();
  const username = await generateUniqueUsername(baseUsername);

  const now = new Date();
  let user;
  try {
    user = await User.create({
      username,
      normalizedUsername: username.toLowerCase().trim(),
      email: emailForUser,
      sizopsUserId: sub,
      sizopsLinkedAt: now,
      avatar: '',
      emailVerified: claims.email_verified === true && !!claims.email,
      emailVerifiedAt: claims.email_verified === true && claims.email ? now : null,
      acceptedTerms: false,
      acceptedPrivacy: false,
    });
  } catch (err) {
    // Unique sizopsUserId index is the final one-to-one guard: a concurrent
    // login with the same sub already created the account.
    if (err.code === 11000) {
      const winner = await User.findOne({ sizopsUserId: sub });
      if (winner) return { user: winner, isNewUser: false };
    }
    throw err;
  }

  return { user, isNewUser: true };
}

function cryptoRandomSuffix() {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

// --- Start ---------------------------------------------------------------

/**
 * GET /auth/sizops — starts the SizOps SSO login flow (redirects to SizOps).
 */
router.get('/sizops', async (req, res) => {
  try {
    const oidc = config.sizops.oidc;
    if (!oidc.ready) {
      return res.status(503).json({ error: 'SizOps SSO is not configured', reason: describeOidcMisconfig(oidc) });
    }
    if (await isMaintenanceMode()) {
      return res.status(503).json({ error: 'CityFlow is currently undergoing maintenance' });
    }

    const url = await buildAuthUrl('login', null);
    return res.redirect(url);
  } catch (err) {
    console.error('[SIZOPS] Start flow error:', err.message);
    res.status(500).json({ error: 'Failed to start SizOps login' });
  }
});

/**
 * POST /auth/sizops/link-start — starts the account-linking flow for the
 * authenticated CityFlow session. Returns the SizOps authorize URL as JSON
 * (the browser then navigates there), so the session token never leaves the
 * Authorization header.
 */
router.post('/sizops/link-start', authenticate, async (req, res) => {
  try {
    const oidc = config.sizops.oidc;
    if (!oidc.ready) {
      return res.status(503).json({ error: 'SizOps SSO is not configured', reason: describeOidcMisconfig(oidc) });
    }
    if (await isMaintenanceMode()) {
      return res.status(503).json({ error: 'CityFlow is currently undergoing maintenance' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.sizopsUserId) {
      return res.status(400).json({ error: 'SizOps is already linked to this account' });
    }

    const url = await buildAuthUrl('link', user._id.toString());
    res.json({ url });
  } catch (err) {
    console.error('[SIZOPS] Link start error:', err.message);
    res.status(500).json({ error: 'Failed to start SizOps linking' });
  }
});

/** Mints the signed state + PKCE pair and builds the SizOps authorize URL. */
async function buildAuthUrl(mode, userId) {
  const pair = generatePkcePair();
  const nonce = generateNonce();
  const stateToken = signState({ mode, userId: userId || undefined, nonce, verifier: pair.codeVerifier });
  return buildAuthorizeUrl({
    stateToken,
    nonce,
    codeChallenge: pair.codeChallenge,
  });
}

// --- Callback -------------------------------------------------------------

router.get('/sizops/callback', callbackLimiter, async (req, res) => {
  try {
    const oidc = config.sizops.oidc;
    if (!oidc.ready) {
      return res.redirect(errorRedirect('sizops_not_configured'));
    }

    const { code, state, error } = req.query;

    if (error) {
      await writeAudit('sizops.login_failed', null, req, { reason: `provider_error:${error}` });
      return res.redirect(errorRedirect(`sizops_${error}`));
    }
    if (!code || !state) {
      await writeAudit('sizops.login_failed', null, req, { reason: 'missing_parameters' });
      return res.redirect(errorRedirect('missing_parameters'));
    }

    const verifiedState = verifyState(String(state));
    if (!verifiedState) {
      await writeAudit('sizops.login_failed', null, req, { reason: 'invalid_state' });
      return res.redirect(errorRedirect('invalid_state'));
    }

    let idToken;
    try {
      const exchanged = await exchangeCode(String(code), getCallbackUrl(req), verifiedState.verifier);
      idToken = exchanged.idToken;
    } catch (err) {
      await writeAudit('sizops.oauth_error', verifiedState.userId || null, req, {
        reason: err.code || 'token_exchange_failed',
      });
      return res.redirect(errorRedirect(err.code || 'token_exchange_failed'));
    }

    let claims;
    try {
      claims = await verifyIdToken(idToken, verifiedState.nonce);
    } catch (err) {
      await writeAudit('sizops.login_failed', verifiedState.userId || null, req, {
        reason: err.code || 'invalid_id_token',
      });
      return res.redirect(errorRedirect(err.code || 'invalid_id_token'));
    }

    const sub = String(claims.sub);

    if (verifiedState.mode === 'link') {
      return handleLinkCallback(req, res, verifiedState, sub);
    }

    const { user, isNewUser } = await findOrCreateUserForSizOps(sub, claims);
    const result = await finalizeLogin(user, req, isNewUser);
    await writeAudit('sizops.login', user._id, req, { isNewUser, sizopsUserId: maskUserId(sub) });
    // Register the GamePlayer on SizOps (identity only, fire-and-forget).
    registerGamePlayer(sub, claims.name).catch(() => {});
    return res.redirect(result.redirect);
  } catch (err) {
    console.error('[SIZOPS] Callback error:', err.message);
    await writeAudit('sizops.oauth_error', null, req, { reason: 'internal_error' });
    res.redirect(errorRedirect('internal_error'));
  }
});

/**
 * Link-mode callback: the state carries the authenticated CityFlow userId, so
 * proving a CityFlow session (state was only minted for it) + a verified
 * SizOps identity (ID token) satisfies two-sided authentication.
 */
async function handleLinkCallback(req, res, state, sub) {
  if (!state.userId) {
    await writeAudit('sizops.login_failed', null, req, { reason: 'invalid_link_state' });
    return res.redirect(errorRedirect('invalid_state'));
  }

  const user = await User.findById(state.userId);
  if (!user) {
    await writeAudit('sizops.link', null, req, { reason: 'cityflow_user_not_found' });
    return res.redirect(errorRedirect('link_user_not_found'));
  }

  if (user.sizopsUserId && user.sizopsUserId !== sub) {
    await writeAudit('sizops.link', user._id, req, { reason: 'cityflow_already_linked' });
    return res.redirect(`${config.frontendUrl}/settings?sizops=link_error`);
  }
  if (user.sizopsUserId === sub) {
    await writeAudit('sizops.link', user._id, req, { reason: 'already_linked_same' });
    return res.redirect(`${config.frontendUrl}/settings?sizops=linked`);
  }

  const taken = await User.findOne({ sizopsUserId: sub, _id: { $ne: user._id } });
  if (taken) {
    await writeAudit('sizops.link', user._id, req, { reason: 'sizops_already_linked_elsewhere' });
    return res.redirect(`${config.frontendUrl}/settings?sizops=link_error`);
  }

  // Atomic one-to-one enforcement: only succeeds if still unlinked.
  const updated = await User.findOneAndUpdate(
    { _id: user._id, sizopsUserId: null },
    { $set: { sizopsUserId: sub, sizopsLinkedAt: new Date() } },
    { new: true },
  );
  if (!updated) {
    await writeAudit('sizops.link', user._id, req, { reason: 'race_linked_elsewhere' });
    return res.redirect(`${config.frontendUrl}/settings?sizops=link_error`);
  }

  await writeAudit('sizops.link', user._id, req, { sizopsUserId: maskUserId(sub) });
  // Register the GamePlayer on SizOps (identity only, fire-and-forget).
  registerGamePlayer(sub, user.displayName || user.username).catch(() => {});
  return res.redirect(`${config.frontendUrl}/settings?sizops=linked`);
}

// --- Status / Unlink ---------------------------------------------------------

router.get('/sizops/status', authenticate, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({
    connected: !!user.sizopsUserId,
    sizopsUserId: maskUserId(user.sizopsUserId),
    linkedAt: user.sizopsLinkedAt || null,
    hasPassword: !!user.password,
    providers: (user.oauthProviders || []).map((p) => p.provider),
  });
});

/**
 * POST /auth/sizops/unlink — removes the SizOps link.
 * Protected: blocked if it would leave the account with no password and no
 * other OAuth provider; requires the current password when one exists.
 */
router.post('/sizops/unlink', authenticate, unlinkLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.sizopsUserId) {
      return res.status(400).json({ error: 'SizOps is not linked to this account' });
    }

    const otherProviders = (user.oauthProviders || []).length;
    if (!user.password && otherProviders === 0) {
      return res.status(400).json({
        error: 'Cannot unlink SizOps: you must have a password or at least one other login method',
      });
    }

    if (user.password) {
      const { password } = req.body || {};
      if (!password) {
        return res.status(400).json({ error: 'Current password is required to unlink SizOps', passwordRequired: true });
      }
      const valid = await user.comparePassword(password);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    const removed = user.sizopsUserId;
    // $unset (not `= null`): sparse indexes still index explicit nulls, so
    // writing null would collide with every other unlinked user.
    await User.updateOne({ _id: user._id }, { $unset: { sizopsUserId: 1, sizopsLinkedAt: 1 } });

    await writeAudit('sizops.unlink', user._id, req, { sizopsUserId: maskUserId(removed) });
    res.json({ success: true, message: 'SizOps account unlinked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Helpers -----------------------------------------------------------------

function generateNonce() {
  return cryptoRandomSuffix() + Date.now().toString(36) + cryptoRandomSuffix();
}

export default router;
