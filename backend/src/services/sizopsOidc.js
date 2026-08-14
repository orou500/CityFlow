import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

/**
 * SizOps OIDC relying-party client (authorization-code + PKCE, RS256).
 *
 * Identity rules:
 * - The ONLY trusted identity is the verified ID-token `sub` → stored as
 *   `User.sizopsUserId`. Email is never used to match/link accounts.
 * - CityFlow never accepts a raw SizOps token as a game session token; it only
 *   uses verified identity to issue its own existing JWT.
 * - SizOps signs OIDC tokens with its OWN RS256 keys — no shared JWT secrets.
 */

const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

let discoveryCache = { fetchedAt: 0, data: null };
let jwksCache = { fetchedAt: 0, keys: null };

export class SizOpsOidcError extends Error {
  constructor(message, code = 'sizops_oidc_error') {
    super(message);
    this.code = code;
  }
}

function oidcConfig() {
  return config.sizops.oidc;
}

// --- Discovery / JWKS --------------------------------------------------------

export async function getDiscovery() {
  const oidc = oidcConfig();
  if (!oidc.ready) throw new SizOpsOidcError('SizOps OIDC is not configured', 'sizops_not_configured');

  if (discoveryCache.data && Date.now() - discoveryCache.fetchedAt < DISCOVERY_CACHE_TTL_MS) {
    return discoveryCache.data;
  }

  const issuer = oidc.issuer.replace(/\/+$/, '');
  let discovery;
  try {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    discovery = await res.json();
  } catch (err) {
    console.error(`[SIZOPS] Discovery fetch failed: ${err.message}`);
    throw new SizOpsOidcError('Failed to fetch SizOps OIDC discovery', 'discovery_failed');
  }

  discoveryCache = {
    fetchedAt: Date.now(),
    data: {
      authorization_endpoint: oidc.authorizationEndpoint || discovery.authorization_endpoint,
      token_endpoint: oidc.tokenEndpoint || discovery.token_endpoint,
      userinfo_endpoint: oidc.userinfoEndpoint || discovery.userinfo_endpoint,
      jwks_uri: oidc.jwksUri || discovery.jwks_uri,
      issuer: discovery.issuer || issuer,
    },
  };
  return discoveryCache.data;
}

export async function getJwks() {
  if (jwksCache.keys && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }

  const discovery = await getDiscovery();
  let keys;
  try {
    const res = await fetch(discovery.jwks_uri);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    keys = body.keys || [];
  } catch (err) {
    console.error(`[SIZOPS] JWKS fetch failed: ${err.message}`);
    throw new SizOpsOidcError('Failed to fetch SizOps signing keys', 'jwks_failed');
  }

  if (keys.length === 0) {
    throw new SizOpsOidcError('SizOps JWKS contains no keys', 'jwks_empty');
  }

  jwksCache = { fetchedAt: Date.now(), keys };
  return keys;
}

export function resetOidcCache() {
  discoveryCache = { fetchedAt: 0, data: null };
  jwksCache = { fetchedAt: 0, keys: null };
}

// --- Verification ------------------------------------------------------------

/**
 * Verifies an ID token: RS256 signature via SizOps JWKS, issuer, audience,
 * expiration, and the expected nonce. Returns the verified payload.
 */
export async function verifyIdToken(idToken, expectedNonce) {
  const oidc = oidcConfig();
  const keys = await getJwks();

  const header = decodeJwtHeader(idToken);
  const jwk = keys.find((k) => k.kid === header.kid) || keys.find((k) => k.alg === 'RS256') || keys[0];

  let payload;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    payload = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
      issuer: oidc.issuer.replace(/\/+$/, ''),
      audience: oidc.clientId,
    });
  } catch (err) {
    throw new SizOpsOidcError(`ID token validation failed: ${err.message}`, 'invalid_id_token');
  }

  if (!payload.sub) {
    throw new SizOpsOidcError('ID token is missing the sub claim', 'invalid_id_token');
  }

  if (expectedNonce && payload.nonce !== expectedNonce) {
    throw new SizOpsOidcError('ID token nonce mismatch', 'invalid_nonce');
  }

  return payload;
}

function decodeJwtHeader(token) {
  try {
    const [headerB64] = token.split('.');
    return JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
  } catch {
    return {};
  }
}

// --- Authorization flow helpers ---------------------------------------------

export function generatePkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Builds the SizOps authorization URL. `stateToken` must be a signed JWT
 * carrying the nonce + PKCE verifier + mode so the callback can validate
 * everything without server-side state. The same nonce is sent to SizOps so
 * it is bound into the ID token.
 */
export async function buildAuthorizeUrl({ stateToken, nonce, codeChallenge }) {
  const oidc = oidcConfig();
  const discovery = await getDiscovery();
  const params = new URLSearchParams({
    client_id: oidc.clientId,
    redirect_uri: oidc.redirectUri,
    response_type: 'code',
    scope: oidc.scope,
    state: stateToken,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${discovery.authorization_endpoint}?${params.toString()}`;
}

/**
 * Exchanges the authorization code at the SizOps token endpoint and returns
 * the ID token. Uses client_secret_post auth (secret never leaves the server).
 */
export async function exchangeCode(code, redirectUri, codeVerifier) {
  const oidc = oidcConfig();
  const discovery = await getDiscovery();

  let res;
  try {
    res = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        client_id: oidc.clientId,
        client_secret: oidc.clientSecret,
      }),
    });
  } catch (err) {
    console.error(`[SIZOPS] Token exchange failed: ${err.message}`);
    throw new SizOpsOidcError('SizOps token exchange failed', 'token_exchange_failed');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[SIZOPS] Token exchange error: ${res.status} ${data.error || ''}`);
    throw new SizOpsOidcError(data.error_description || data.error || `HTTP ${res.status}`, 'token_exchange_failed');
  }

  if (!data.id_token) {
    throw new SizOpsOidcError('Token response missing id_token', 'token_exchange_failed');
  }

  return { idToken: data.id_token, accessToken: data.access_token || '' };
}

/**
 * Registers/updates the GamePlayer record on the SizOps side for a user who
 * logged in or linked via SizOps (server-to-server, API-key auth). Identity
 * only (SizOps userId + display name) — never game data. Fire-and-forget:
 * failures are logged and never block authentication.
 */
export async function registerGamePlayer(sizopsUserId, displayName) {
  const api = config.sizops.api;
  if (!api.enabled || !sizopsUserId) return false;

  const base = (api.baseUrl || config.sizops.oidc.issuer || '').replace(/\/+$/, '');
  if (!base) return false;

  try {
    const res = await fetch(`${base}/api/v1/game/games/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api.apiKey}`,
      },
      body: JSON.stringify({
        userId: sizopsUserId,
        displayName: displayName || '',
      }),
    });
    if (!res.ok) {
      console.error(`[SIZOPS] GamePlayer registration failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[SIZOPS] GamePlayer registration error: ${err.message}`);
    return false;
  }
}

/**
 * Removes the GamePlayer record on the SizOps side when a CityFlow user
 * disconnects (server-to-server, API-key auth). Identity only. Fire-and-forget:
 * failures are logged and never block the local disconnect.
 */
export async function unregisterGamePlayer(sizopsUserId) {
  const api = config.sizops.api;
  if (!api.enabled || !sizopsUserId) return false;

  const base = (api.baseUrl || config.sizops.oidc.issuer || '').replace(/\/+$/, '');
  if (!base) return false;

  try {
    const res = await fetch(`${base}/api/v1/game/games/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api.apiKey}`,
      },
      body: JSON.stringify({ userId: sizopsUserId }),
    });
    if (!res.ok) {
      console.error(`[SIZOPS] GamePlayer unregistration failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[SIZOPS] GamePlayer unregistration error: ${err.message}`);
    return false;
  }
}

/**
 * Verifies a SizOps-signed server-to-server service JWT (e.g. the disconnect
 * notification sent when a user unlinks CityFlow from the SizOps side).
 * Enforces the same trust as ID tokens — RS256 signature via the SizOps JWKS,
 * issuer + audience (our own OIDC client id) — plus the required `purpose`
 * claim so a token minted for one purpose can never be replayed elsewhere.
 * Returns the verified payload.
 */
export async function verifyServiceToken(token) {
  const oidc = oidcConfig();
  const keys = await getJwks();

  const header = decodeJwtHeader(token);
  const jwk = keys.find((k) => k.kid === header.kid) || keys.find((k) => k.alg === 'RS256') || keys[0];

  let payload;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: oidc.issuer.replace(/\/+$/, ''),
      audience: oidc.clientId,
    });
  } catch (err) {
    throw new SizOpsOidcError(`Service token validation failed: ${err.message}`, 'invalid_service_token');
  }

  if (!payload.sub || payload.purpose !== 'cityflow:disconnect') {
    throw new SizOpsOidcError('Service token missing required claims', 'invalid_service_token');
  }

  return payload;
}
