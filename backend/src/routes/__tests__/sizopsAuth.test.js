import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { createApp } from '../../test/createApp.js';
import { createTestUser, createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import { config, describeOidcMisconfig } from '../../config/index.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import Transaction from '../../models/Transaction.js';
import Notification from '../../models/Notification.js';
import SizopsAuditLog from '../../models/SizopsAuditLog.js';
import { resetOidcCache } from '../../services/sizopsOidc.js';

/**
 * CityFlow × SizOps OIDC SSO integration tests.
 *
 * The SizOps side is simulated with a local RS256 key pair + a mocked global
 * fetch serving discovery/JWKS/token endpoints. This proves CityFlow's
 * validation logic: issuer, audience, signature, expiration, nonce, PKCE
 * wiring, account linking rules, unlink protection, and — most importantly —
 * that linking NEVER changes an existing CityFlow user's data.
 */

const app = createApp();

const ISSUER = 'https://sizops.test';
const CLIENT_ID = 'szoc_testclient';
const CLIENT_SECRET = 'szcs_testsecret';
const REDIRECT_URI = 'http://localhost/auth/sizops/callback';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicJwk = publicKey.export({ format: 'jwk' });

function signIdToken({
  sub,
  nonce,
  email,
  emailVerified = true,
  issuer = ISSUER,
  audience = CLIENT_ID,
  expiresIn = '5m',
  key = privatePem,
}) {
  const payload = {
    sub,
    iss: issuer,
    aud: audience,
    iat: Math.floor(Date.now() / 1000),
    nonce,
  };
  if (email) {
    payload.email = email;
    payload.email_verified = emailVerified;
  }
  return jwt.sign(payload, key, { algorithm: 'RS256', expiresIn, header: { kid: 'sizops-rs256-1' } });
}

let tokenEndpointHandler = null;

function stubSizOpsFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const u = String(url);
      if (u.endsWith('/.well-known/openid-configuration')) {
        return jsonResponse({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/oauth/authorize`,
          token_endpoint: `${ISSUER}/oauth/token`,
          userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
          jwks_uri: `${ISSUER}/oauth/jwks`,
        });
      }
      if (u.endsWith('/oauth/jwks')) {
        return jsonResponse({ keys: [{ ...publicJwk, kid: 'sizops-rs256-1', alg: 'RS256', use: 'sig' }] });
      }
      if (u.endsWith('/oauth/token')) {
        if (tokenEndpointHandler) {
          const body = new URLSearchParams(String(init?.body ?? ''));
          return tokenEndpointHandler(body);
        }
        return jsonResponse({ error: 'invalid_grant' }, 400);
      }
      if (u.endsWith('/api/v1/game/games/connect')) {
        return jsonResponse({ success: true, data: { player: { id: 'p1' } } });
      }
      return jsonResponse({ error: 'not_found' }, 404);
    }),
  );
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function enableSizOps() {
  const oidc = config.sizops.oidc;
  oidc.enabled = true;
  oidc.issuer = ISSUER;
  oidc.clientId = CLIENT_ID;
  oidc.clientSecret = CLIENT_SECRET;
  oidc.redirectUri = REDIRECT_URI;
  oidc.scope = 'openid profile email';

  const api = config.sizops.api;
  api.apiKey = 'szak_testapikey';
  api.clientId = 'szp_testclient';
  api.baseUrl = ISSUER;
}

function disableSizOps() {
  config.sizops.oidc.enabled = false;
}

beforeAll(async () => {
  enableSizOps();
  stubSizOpsFetch();
  await SizopsAuditLog.deleteMany({});
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await SizopsAuditLog.deleteMany({});
});

beforeEach(async () => {
  resetOidcCache();
  tokenEndpointHandler = null;
  vi.mocked(fetch).mockClear();
  await SizopsAuditLog.deleteMany({});
  await Notification.deleteMany({});
});

/** Runs the login start → callback flow with a valid SizOps ID token. */
async function runLoginFlow({ sub, email = 'sso@example.com', emailVerified = true } = {}) {
  const start = await request(app).get('/auth/sizops');
  expect(start.status).toBe(302);
  const authorizeUrl = new URL(start.headers.location);

  const state = authorizeUrl.searchParams.get('state');
  const statePayload = jwt.verify(state, config.jwtSecret);
  const sentNonce = authorizeUrl.searchParams.get('nonce');

  tokenEndpointHandler = async (body) => {
    expect(body.get('code_verifier')).toBe(statePayload.verifier);
    expect(body.get('client_id')).toBe(CLIENT_ID);
    expect(body.get('client_secret')).toBe(CLIENT_SECRET);
    expect(body.get('redirect_uri')).toBe(REDIRECT_URI);
    if (body.get('code') === 'badcode') {
      return jsonResponse({ error: 'invalid_grant', error_description: 'Invalid code' }, 400);
    }
    return jsonResponse({ id_token: signIdToken({ sub, nonce: sentNonce, email, emailVerified }) });
  };

  const callback = await request(app).get('/auth/sizops/callback').query({ code: 'goodcode', state });
  return { start, callback, authorizeUrl, statePayload };
}

describe('SizOps SSO — configuration gate', () => {
  it('returns 503 when SizOps OIDC is disabled', async () => {
    disableSizOps();
    const res = await request(app).get('/auth/sizops');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('SizOps SSO is not configured');
    expect(res.body.reason).toContain('SIZOPS_OIDC_ENABLED');
    enableSizOps();
  });

  it('returns 503 with a diagnostic reason on the link-start endpoint', async () => {
    disableSizOps();
    const { token } = await createAuthenticatedUser({});
    const res = await request(app).post('/auth/sizops/link-start').set(authHeader(token)).send({});
    expect(res.status).toBe(503);
    expect(res.body.reason).toBeTruthy();
    enableSizOps();
  });

  it('start endpoint redirects to the SizOps authorize URL with OIDC params', async () => {
    const res = await request(app).get('/auth/sizops');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin).toBe(ISSUER);
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('nonce')).toBeTruthy();
  });
});

describe('SizOps OIDC — credential-type validation', () => {
  const oidc = config.sizops.oidc;
  const api = config.sizops.api;

  afterEach(() => {
    // Restore the valid OIDC + Game API configuration.
    oidc.clientId = CLIENT_ID;
    oidc.clientSecret = CLIENT_SECRET;
    oidc.enabled = true;
    api.apiKey = 'szak_testapikey';
    api.clientId = 'szp_testclient';
    api.baseUrl = ISSUER;
  });

  it('rejects a GameApplication client ID (szp_) as the OIDC client ID', async () => {
    oidc.clientId = 'szp_1G-Kv5AQR6xNYbiHWOmHTg';
    expect(oidc.clientIdValid).toBe(false);
    expect(oidc.ready).toBe(false);

    const res = await request(app).get('/auth/sizops');
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('szp_1G-Kv5AQR6xNYbiHWOmHTg');
  });

  it('rejects a Game API key (szak_) as the OIDC client secret', async () => {
    oidc.clientSecret = 'szak_I6mtf_16Sto_KEUb0M0VvOeCZN38-q6o_HJxQb-QqGY';
    expect(oidc.clientSecretValid).toBe(false);
    expect(oidc.ready).toBe(false);

    const res = await request(app).get('/auth/sizops');
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('szak_I6mtf_16Sto_KEUb0M0VvOeCZN38-q6o_HJxQb-QqGY');
  });

  it('rejects a mix of Game API credentials and OIDC credentials', async () => {
    oidc.clientId = 'szp_gameapplication';
    oidc.clientSecret = 'szcs_testsecret';
    expect(oidc.ready).toBe(false);

    oidc.clientId = 'szoc_testclient';
    oidc.clientSecret = 'szak_gameapikey';
    expect(oidc.ready).toBe(false);
  });

  it('accepts szoc_ + szcs_ OIDC credentials', async () => {
    oidc.clientId = CLIENT_ID;
    oidc.clientSecret = CLIENT_SECRET;
    expect(oidc.clientIdValid).toBe(true);
    expect(oidc.clientSecretValid).toBe(true);
    expect(oidc.ready).toBe(true);

    const res = await request(app).get('/auth/sizops');
    expect(res.status).toBe(302);
  });

  it('keeps the Game API credentials (SIZOPS_CLIENT_ID / SIZOPS_API_KEY) independent', async () => {
    const api = config.sizops.api;
    api.clientId = 'szp_1G-Kv5AQR6xNYbiHWOmHTg';
    api.apiKey = 'szak_I6mtf_16Sto_KEUb0M0VvOeCZN38-q6o_HJxQb-QqGY';
    oidc.clientId = CLIENT_ID;
    oidc.clientSecret = CLIENT_SECRET;

    expect(api.enabled).toBe(true);
    expect(oidc.ready).toBe(true);
    expect(oidc.clientId).not.toBe(api.clientId);
    expect(oidc.clientSecret).not.toBe(api.apiKey);
  });
});

describe('SizOps OIDC — configuration diagnostics', () => {
  const oidc = config.sizops.oidc;

  afterEach(() => {
    oidc.enabled = true;
    oidc.issuer = ISSUER;
    oidc.clientId = CLIENT_ID;
    oidc.clientSecret = CLIENT_SECRET;
    oidc.redirectUri = REDIRECT_URI;
  });

  it('describes each missing requirement without echoing credential values', () => {
    oidc.enabled = false;
    expect(describeOidcMisconfig(oidc)).toContain('SIZOPS_OIDC_ENABLED');

    oidc.enabled = true;
    oidc.issuer = '';
    expect(describeOidcMisconfig(oidc)).toBe('SIZOPS_OIDC_ISSUER is missing');

    oidc.issuer = ISSUER;
    oidc.redirectUri = '';
    expect(describeOidcMisconfig(oidc)).toBe('SIZOPS_OIDC_REDIRECT_URI is missing');

    oidc.redirectUri = REDIRECT_URI;
    oidc.clientId = '';
    expect(describeOidcMisconfig(oidc)).toBe('SIZOPS_OIDC_CLIENT_ID is missing');

    oidc.clientId = CLIENT_ID;
    oidc.clientSecret = '';
    expect(describeOidcMisconfig(oidc)).toBe('SIZOPS_OIDC_CLIENT_SECRET is missing');

    oidc.clientSecret = CLIENT_SECRET;
    oidc.clientId = 'szp_gameapp';
    expect(describeOidcMisconfig(oidc)).toContain('szoc_');
    expect(describeOidcMisconfig(oidc)).not.toContain('szp_gameapp');

    oidc.clientId = CLIENT_ID;
    oidc.clientSecret = 'szak_gameapikey';
    expect(describeOidcMisconfig(oidc)).toContain('szcs_');
    expect(describeOidcMisconfig(oidc)).not.toContain('szak_gameapikey');
  });

  it('503 responses include the diagnostic reason but never the actual values', async () => {
    oidc.clientSecret = 'supersecretvalue';
    const res = await request(app).get('/auth/sizops');
    expect(res.status).toBe(503);
    expect(res.body.reason).toContain('szcs_');
    expect(JSON.stringify(res.body)).not.toContain('supersecretvalue');
  });

  it('reports the Game-API-credentials-misuse reason when szp_/szak_ are used', async () => {
    oidc.clientSecret = CLIENT_SECRET;
    oidc.clientId = 'szp_1G-Kv5AQR6xNYbiHWOmHTg';
    const res = await request(app).get('/auth/sizops');
    expect(res.status).toBe(503);
    expect(res.body.reason).toContain('szoc_');
    expect(JSON.stringify(res.body)).not.toContain('szp_1G-Kv5AQR6xNYbiHWOmHTg');

    oidc.clientId = CLIENT_ID;
    oidc.clientSecret = 'szak_I6mtf_16Sto_KEUb0M0VvOeCZN38-q6o_HJxQb-QqGY';
    const res2 = await request(app).get('/auth/sizops');
    expect(res2.status).toBe(503);
    expect(res2.body.reason).toContain('szcs_');
    expect(JSON.stringify(res2.body)).not.toContain('szak_I6mtf_16Sto_KEUb0M0VvOeCZN38-q6o_HJxQb-QqGY');
  });
});

describe('SizOps SSO — login', () => {
  it('creates a new CityFlow user from a verified SizOps identity', async () => {
    const { callback, statePayload } = await runLoginFlow({ sub: 'siz_newuser1', email: 'new@sizops.test' });

    expect(callback.status).toBe(302);
    const cb = new URL(callback.headers.location);
    expect(cb.pathname).toBe('/auth/callback');
    expect(cb.searchParams.get('new_user')).toBe('1');

    const token = cb.searchParams.get('token');
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.userId);
    expect(user).toBeTruthy();
    expect(user.sizopsUserId).toBe('siz_newuser1');
    expect(user.email).toBe('new@sizops.test');
    expect(user.emailVerified).toBe(true);
    expect(user.sizopsLinkedAt).toBeTruthy();
    expect(user.username).toBeTruthy();
    expect(user.password).toBeNull();
    expect(user._id).toBeTruthy();
    expect(statePayload.mode).toBe('login');

    const audit = await SizopsAuditLog.findOne({ action: 'sizops.login' });
    expect(audit).toBeTruthy();
    expect(audit.details.sizopsUserId).toBe('****ser1');
  });

  it('returns an existing CityFlow user for a known SizOps sub (no duplicates)', async () => {
    await runLoginFlow({ sub: 'siz_known1', email: 'known@sizops.test' });
    const firstUser = await User.findOne({ sizopsUserId: 'siz_known1' });
    expect(firstUser).toBeTruthy();

    const { callback: second } = await runLoginFlow({ sub: 'siz_known1', email: 'known@sizops.test' });
    expect(second.status).toBe(302);
    expect(new URL(second.headers.location).searchParams.get('new_user')).toBeNull();
    expect(await User.countDocuments({ sizopsUserId: 'siz_known1' })).toBe(1);
  });

  it('concurrent logins with the same new sub create exactly one user (unique index)', async () => {
    // Deterministic concurrency: capture both nonces/verifiers, then serve the
    // correct ID token per verifier while both callbacks race.
    const startA = await request(app).get('/auth/sizops');
    const startB = await request(app).get('/auth/sizops');
    const urlA = new URL(startA.headers.location);
    const urlB = new URL(startB.headers.location);
    const stateA = urlA.searchParams.get('state');
    const stateB = urlB.searchParams.get('state');
    const verifierA = jwt.verify(stateA, config.jwtSecret).verifier;
    const verifierB = jwt.verify(stateB, config.jwtSecret).verifier;

    tokenEndpointHandler = async (body) => {
      const verifier = body.get('code_verifier');
      if (verifier === verifierA) {
        return jsonResponse({
          id_token: signIdToken({ sub: 'siz_race1', nonce: urlA.searchParams.get('nonce'), email: 'race@sizops.test' }),
        });
      }
      expect(verifier).toBe(verifierB);
      return jsonResponse({
        id_token: signIdToken({ sub: 'siz_race1', nonce: urlB.searchParams.get('nonce'), email: 'race@sizops.test' }),
      });
    };

    const [a, b] = await Promise.all([
      request(app).get('/auth/sizops/callback').query({ code: 'c1', state: stateA }),
      request(app).get('/auth/sizops/callback').query({ code: 'c2', state: stateB }),
    ]);
    expect(a.status).toBe(302);
    expect(b.status).toBe(302);
    expect(await User.countDocuments({ sizopsUserId: 'siz_race1' })).toBe(1);
  });

  it('issues the EXISTING CityFlow 7-day JWT, never a SizOps token', async () => {
    const { callback } = await runLoginFlow({ sub: 'siz_jwt1' });
    const token = new URL(callback.headers.location).searchParams.get('token');
    const decoded = jwt.verify(token, config.jwtSecret);
    expect(decoded).toMatchObject({ userId: decoded.userId });
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
  });

  it('registers the GamePlayer on the SizOps game API (identity only)', async () => {
    await runLoginFlow({ sub: 'siz_gp1', email: 'gp@sizops.test' });

    const calls = vi.mocked(fetch).mock.calls;
    const connectCall = calls.find(([url]) => String(url).endsWith('/api/v1/game/games/connect'));
    expect(connectCall).toBeTruthy();
    expect(connectCall[1].headers.Authorization).toBe('Bearer szak_testapikey');
    const body = JSON.parse(connectCall[1].body);
    expect(body.userId).toBe('siz_gp1');
    expect(Object.keys(body).sort()).toEqual(['displayName', 'userId']);
  });

  it('SSO succeeds even when the SizOps Game API is unavailable', async () => {
    const origHandler = tokenEndpointHandler;
    // Login flow runs normally; only the GamePlayer registration endpoint fails.
    const start = await request(app).get('/auth/sizops');
    const url = new URL(start.headers.location);
    const state = url.searchParams.get('state');
    tokenEndpointHandler = async () =>
      jsonResponse({
        id_token: signIdToken({ sub: 'siz_gpdown1', nonce: url.searchParams.get('nonce'), email: 'down@sizops.test' }),
      });

    const connectHandler = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (u, init) => {
      if (String(u).endsWith('/api/v1/game/games/connect')) {
        return jsonResponse({ error: 'unavailable' }, 503);
      }
      return connectHandler(u, init);
    });

    const callback = await request(app).get('/auth/sizops/callback').query({ code: 'c', state });
    expect(callback.status).toBe(302);
    const token = new URL(callback.headers.location).searchParams.get('token');
    expect(jwt.verify(token, config.jwtSecret).userId).toBeTruthy();
    expect(await User.countDocuments({ sizopsUserId: 'siz_gpdown1' })).toBe(1);

    vi.mocked(fetch).mockImplementation(connectHandler);
    tokenEndpointHandler = origHandler;
  });

  it('SSO works with no SIZOPS_API_KEY configured (registration skipped)', async () => {
    const api = config.sizops.api;
    api.apiKey = '';
    try {
      const { callback } = await runLoginFlow({ sub: 'siz_nokey1', email: 'nokey@sizops.test' });
      expect(callback.status).toBe(302);
      expect(new URL(callback.headers.location).searchParams.get('token')).toBeTruthy();
      const connectCalls = vi
        .mocked(fetch)
        .mock.calls.filter(([u]) => String(u).endsWith('/api/v1/game/games/connect'));
      expect(connectCalls.length).toBe(0);
    } finally {
      api.apiKey = 'szak_testapikey';
    }
  });

  it('treats unverified emails as unverified', async () => {
    const { callback } = await runLoginFlow({ sub: 'siz_unver1', email: 'unver@sizops.test', emailVerified: false });
    const user = await User.findOne({ sizopsUserId: 'siz_unver1' });
    expect(user.emailVerified).toBe(false);
    expect(callback.status).toBe(302);
  });

  it('does not match existing accounts by email', async () => {
    const existing = await createTestUser({ email: 'same@sizops.test' });
    expect(existing.sizopsUserId).toBeUndefined();

    const { callback } = await runLoginFlow({ sub: 'siz_sameemail1', email: 'same@sizops.test' });
    const cb = new URL(callback.headers.location);
    const token = cb.searchParams.get('token');
    const decoded = jwt.verify(token, config.jwtSecret);
    expect(decoded.userId).not.toBe(existing._id.toString());
    expect(cb.searchParams.get('new_user')).toBe('1');
    const created = await User.findById(decoded.userId);
    expect(created.sizopsUserId).toBe('siz_sameemail1');
  });
});

describe('SizOps SSO — callback validation', () => {
  it('rejects an invalid state', async () => {
    const res = await request(app).get('/auth/sizops/callback').query({ code: 'x', state: 'forged.state.token' });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).searchParams.get('error')).toBe('invalid_state');
    expect(await SizopsAuditLog.countDocuments({ action: 'sizops.login_failed' })).toBe(1);
  });

  it('rejects a missing code/state', async () => {
    const res = await request(app).get('/auth/sizops/callback');
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).searchParams.get('error')).toBe('missing_parameters');
  });

  it('rejects a failed token exchange', async () => {
    const start = await request(app).get('/auth/sizops');
    const authorizeUrl = new URL(start.headers.location);
    const state = authorizeUrl.searchParams.get('state');

    tokenEndpointHandler = async () => jsonResponse({ error: 'invalid_grant' }, 400);

    const res = await request(app).get('/auth/sizops/callback').query({ code: 'badcode', state });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).searchParams.get('error')).toBe('token_exchange_failed');
    expect(await SizopsAuditLog.countDocuments({ action: 'sizops.oauth_error' })).toBe(1);
  });

  it('rejects an ID token with an invalid signature', async () => {
    const start = await request(app).get('/auth/sizops');
    const url = new URL(start.headers.location);
    const state = url.searchParams.get('state');
    const statePayload = jwt.verify(state, config.jwtSecret);

    const { privateKey: wrongKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    tokenEndpointHandler = async () =>
      jsonResponse({
        id_token: signIdToken({
          sub: 'siz_badsig',
          nonce: url.searchParams.get('nonce'),
          key: wrongKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        }),
      });

    const res = await request(app).get('/auth/sizops/callback').query({ code: 'c', state });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).searchParams.get('error')).toBe('invalid_id_token');
    expect(statePayload).toBeTruthy();
  });

  it('rejects a wrong issuer', async () => {
    const { callback } = await invalidTokenFlow({ issuer: 'https://evil.test' });
    expect(new URL(callback.headers.location).searchParams.get('error')).toBe('invalid_id_token');
  });

  it('rejects a wrong audience', async () => {
    const { callback } = await invalidTokenFlow({ audience: 'szoc_otherclient' });
    expect(new URL(callback.headers.location).searchParams.get('error')).toBe('invalid_id_token');
  });

  it('rejects an expired ID token', async () => {
    const { callback } = await invalidTokenFlow({ expiresIn: '-5m' });
    expect(new URL(callback.headers.location).searchParams.get('error')).toBe('invalid_id_token');
  });

  it('rejects a nonce mismatch', async () => {
    const { callback } = await invalidTokenFlow({ nonce: 'wrong-nonce' });
    expect(new URL(callback.headers.location).searchParams.get('error')).toBe('invalid_nonce');
  });

  it('rejects an ID token missing the sub claim', async () => {
    const { callback } = await invalidTokenFlow({ sub: undefined });
    expect(new URL(callback.headers.location).searchParams.get('error')).toBe('invalid_id_token');
  });
});

/** Runs start + callback where the ID token is deliberately invalid. */
async function invalidTokenFlow(overrides) {
  const start = await request(app).get('/auth/sizops');
  const url = new URL(start.headers.location);
  const state = url.searchParams.get('state');
  const nonce = url.searchParams.get('nonce');

  tokenEndpointHandler = async () =>
    jsonResponse({
      id_token: signIdToken({ sub: 'siz_invalid1', nonce, email: 'x@test.com', ...overrides }),
    });

  const callback = await request(app).get('/auth/sizops/callback').query({ code: 'c', state });
  return { callback, url };
}

describe('SizOps SSO — account linking', () => {
  it('requires an authenticated CityFlow session to start linking', async () => {
    const res = await request(app).post('/auth/sizops/link-start');
    expect(res.status).toBe(401);
  });

  it('links the authenticated CityFlow user to a verified SizOps identity', async () => {
    const { user, token } = await createAuthenticatedUser({ balance: 500000 });
    const userId = user._id.toString();

    const start = await request(app).post('/auth/sizops/link-start').set(authHeader(token));
    expect(start.status).toBe(200);
    expect(start.body.url).toBeTruthy();

    const authorizeUrl = new URL(start.body.url);
    const state = authorizeUrl.searchParams.get('state');
    const statePayload = jwt.verify(state, config.jwtSecret);
    expect(statePayload.mode).toBe('link');
    expect(statePayload.userId).toBe(userId);

    tokenEndpointHandler = async () =>
      jsonResponse({
        id_token: signIdToken({ sub: 'siz_link1', nonce: authorizeUrl.searchParams.get('nonce'), email: user.email }),
      });

    const callback = await request(app).get('/auth/sizops/callback').query({ code: 'c', state });
    expect(callback.status).toBe(302);
    expect(new URL(callback.headers.location).pathname).toBe('/settings');
    expect(new URL(callback.headers.location).searchParams.get('sizops')).toBe('linked');

    const linked = await User.findById(userId);
    expect(linked.sizopsUserId).toBe('siz_link1');
    expect(linked._id.toString()).toBe(userId);
    expect(await SizopsAuditLog.countDocuments({ action: 'sizops.link', userId })).toBe(1);
  });

  it('does not let the same SizOps user link to a second CityFlow account', async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    const firstToken = (await request(app).post('/auth/login').send({ login: first.email, password: 'Password123' }))
      .body.token;

    // Link siz_linkdup to the first account.
    const start1 = await request(app).post('/auth/sizops/link-start').set(authHeader(firstToken));
    const state1 = new URL(start1.body.url).searchParams.get('state');
    const nonce1 = new URL(start1.body.url).searchParams.get('nonce');
    tokenEndpointHandler = async () =>
      jsonResponse({ id_token: signIdToken({ sub: 'siz_linkdup', nonce: nonce1, email: first.email }) });
    await request(app).get('/auth/sizops/callback').query({ code: 'c', state: state1 });
    expect((await User.findById(first._id)).sizopsUserId).toBe('siz_linkdup');

    // Second account tries the same SizOps sub → rejected, mapping unchanged.
    const secondToken = (await request(app).post('/auth/login').send({ login: second.email, password: 'Password123' }))
      .body.token;
    const start2 = await request(app).post('/auth/sizops/link-start').set(authHeader(secondToken));
    const state2 = new URL(start2.body.url).searchParams.get('state');
    const nonce2 = new URL(start2.body.url).searchParams.get('nonce');
    tokenEndpointHandler = async () =>
      jsonResponse({ id_token: signIdToken({ sub: 'siz_linkdup', nonce: nonce2, email: second.email }) });
    const cb = await request(app).get('/auth/sizops/callback').query({ code: 'c', state: state2 });

    expect(new URL(cb.headers.location).searchParams.get('sizops')).toBe('link_error');
    expect((await User.findById(first._id)).sizopsUserId).toBe('siz_linkdup');
    expect((await User.findById(second._id)).sizopsUserId).toBeUndefined();
  });

  it('rejects linking a second SizOps account to an already-linked CityFlow account', async () => {
    const { user, token } = await createAuthenticatedUser();
    await User.updateOne({ _id: user._id }, { $set: { sizopsUserId: 'siz_existing1', sizopsLinkedAt: new Date() } });

    const res = await request(app).post('/auth/sizops/link-start').set(authHeader(token));
    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).sizopsUserId).toBe('siz_existing1');
  });

  it('never changes existing user data when linking (production-safety regression)', async () => {
    const user = await createTestUser({ balance: 777777 });
    const city = await createTestCity();
    await Property.create({
      cityId: city._id,
      ownerId: user._id,
      name: 'Safety House',
      type: 'house',
      basePrice: 100000,
      currentPrice: 100000,
      rent: 1000,
      forSale: false,
    });
    await Transaction.create({ buyerId: user._id, price: 5000, type: 'rent' });
    await Notification.create({
      userId: user._id,
      type: 'system',
      title: 'Welcome',
      message: 'hello',
      eventKey: `test:safety:${user._id}`,
      priority: 'low',
      category: 'system',
      read: false,
    });
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          achievements: ['first_property'],
          friends: [user._id],
          companyId: null,
          level: 12,
          xp: 3456,
          creditScore: 812,
          preferredLanguage: 'he',
        },
      },
    );

    // Log in first — the login route itself runs progression side effects.
    // The snapshot below is taken AFTER login so this test isolates LINKING.
    const token = (await request(app).post('/auth/login').send({ login: user.email, password: 'Password123' })).body
      .token;

    const before = await User.findById(user._id).lean();
    const propsBefore = await Property.countDocuments({ ownerId: user._id });
    const txsBefore = await Transaction.countDocuments({ buyerId: user._id });
    const notifsBefore = await Notification.countDocuments({ userId: user._id });

    // Link via the real flow.
    const start = await request(app).post('/auth/sizops/link-start').set(authHeader(token));
    const state = new URL(start.body.url).searchParams.get('state');
    const nonce = new URL(start.body.url).searchParams.get('nonce');
    tokenEndpointHandler = async () =>
      jsonResponse({ id_token: signIdToken({ sub: 'siz_safety1', nonce, email: user.email }) });
    await request(app).get('/auth/sizops/callback').query({ code: 'c', state });

    const after = await User.findById(user._id).lean();
    const propsAfter = await Property.countDocuments({ ownerId: user._id });
    const txsAfter = await Transaction.countDocuments({ buyerId: user._id });
    const notifsAfter = await Notification.countDocuments({ userId: user._id });

    // _id and every data field are identical except the two identity fields.
    expect(after._id.toString()).toBe(before._id.toString());
    expect(after.balance).toBe(before.balance);
    expect(after.level).toBe(before.level);
    expect(after.xp).toBe(before.xp);
    expect(after.creditScore).toBe(before.creditScore);
    expect(after.achievements).toEqual(before.achievements);
    expect(after.friends.map(String)).toEqual(before.friends.map(String));
    expect(after.preferredLanguage).toBe(before.preferredLanguage);
    expect(after.companyId ? after.companyId.toString() : null).toBe(
      before.companyId ? before.companyId.toString() : null,
    );
    expect(propsAfter).toBe(propsBefore);
    expect(txsAfter).toBe(txsBefore);
    expect(notifsAfter).toBe(notifsBefore);

    expect(after.sizopsUserId).toBe('siz_safety1');
    expect(after.sizopsLinkedAt).toBeTruthy();
  });
});

describe('SizOps SSO — status & unlink', () => {
  it('reports connection status', async () => {
    const { user, token } = await createAuthenticatedUser();
    const res = await request(app).get('/auth/sizops/status').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);

    await User.updateOne({ _id: user._id }, { $set: { sizopsUserId: 'siz_status1', sizopsLinkedAt: new Date() } });
    const res2 = await request(app).get('/auth/sizops/status').set(authHeader(token));
    expect(res2.body.connected).toBe(true);
    expect(res2.body.sizopsUserId).toBe('****tus1');
    expect(res2.body.hasPassword).toBe(true);
  });

  it('blocks unlinking when it would leave no login method', async () => {
    const user = await createTestUser();
    const token = (await request(app).post('/auth/login').send({ login: user.email, password: 'Password123' })).body
      .token;
    await User.updateOne(
      { _id: user._id },
      { $set: { sizopsUserId: 'siz_only1', sizopsLinkedAt: new Date(), oauthProviders: [] }, $unset: { password: 1 } },
    );

    const res = await request(app).post('/auth/sizops/unlink').set(authHeader(token)).send({});
    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).sizopsUserId).toBe('siz_only1');
  });

  it('requires the current password to unlink when the account has one', async () => {
    const { user, token } = await createAuthenticatedUser();
    await User.updateOne({ _id: user._id }, { $set: { sizopsUserId: 'siz_pw1', sizopsLinkedAt: new Date() } });

    const noPw = await request(app).post('/auth/sizops/unlink').set(authHeader(token)).send({});
    expect(noPw.status).toBe(400);
    expect(noPw.body.passwordRequired).toBe(true);

    const wrong = await request(app).post('/auth/sizops/unlink').set(authHeader(token)).send({ password: 'wrong' });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post('/auth/sizops/unlink').set(authHeader(token)).send({ password: 'Password123' });
    expect(ok.status).toBe(200);
    expect((await User.findById(user._id)).sizopsUserId).toBeFalsy();
    expect(await SizopsAuditLog.countDocuments({ action: 'sizops.unlink', userId: user._id })).toBe(1);
  });

  it('allows unlinking without a password when another provider exists', async () => {
    const user = await createTestUser();
    const token = (await request(app).post('/auth/login').send({ login: user.email, password: 'Password123' })).body
      .token;
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          sizopsUserId: 'siz_prov1',
          sizopsLinkedAt: new Date(),
          oauthProviders: [{ provider: 'google', providerId: 'g123' }],
        },
        $unset: { password: 1 },
      },
    );

    const res = await request(app).post('/auth/sizops/unlink').set(authHeader(token)).send({});
    expect(res.status).toBe(200);
    expect((await User.findById(user._id)).sizopsUserId).toBeFalsy();
  });
});

async function createTestCity() {
  const City = (await import('../../models/City.js')).default;
  return City.create({ name: `SizOpsTestCity_${Date.now()}`, country: 'Testland', coordinates: { lat: 0, lng: 0 } });
}
