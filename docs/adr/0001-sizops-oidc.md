# ADR-0001: CityFlow × SizOps OIDC SSO Integration

- **Status:** Accepted (rolled out behind `SIZOPS_OIDC_ENABLED` flag)
- **Date:** August 2026
- **Deciders:** CityFlow + SizOps maintainers
- **Context:** SizOps SSO integration specification (August 2026) — SizOps as
  central identity provider for CityFlow and future games.

## Context

CityFlow is a live production game with existing users, accounts, balances and
game data. SizOps is the central identity platform. SizOps must become the
central identity provider across games **without** breaking any existing
CityFlow account, session, or game data.

## Decision

CityFlow integrates with SizOps as an **OIDC relying party** (authorization-code
+ PKCE flow). SizOps provides a minimal **OIDC provider** (authorize, token,
userinfo, JWKS, discovery). This is an **identity integration, not a database
migration**.

### Never do these

- **Never share `JWT_SECRET` (or any signing secret) between CityFlow and
  SizOps.** CityFlow keeps its existing HS256 7-day JWT; SizOps signs OIDC
  ID tokens with its own separate RS256 key pair.
- **Never auto-link SizOps accounts by email.** The only trusted identity is the
  verified ID-token `sub`, stored as `User.sizopsUserId`. Emails are never used
  to match or merge accounts.
- **Never modify an existing CityFlow `_id`.** Linking only adds
  `sizopsUserId`/`sizopsLinkedAt` to the existing user document.
- **Never migrate existing users automatically.** Existing users explicitly
  link via Settings → Connect SizOps (requires an authenticated CityFlow
  session + authentication at SizOps).
- **Never replace CityFlow JWTs with SizOps tokens.** SizOps authentication
  only ever results in CityFlow issuing its normal JWT.
- **Never expose OIDC client secrets to the frontend** — server-side env /
  K8s secrets only.
- **Never modify existing Google/Discord/email login behavior.**

### Architecture

```text
CityFlow (OIDC client)  ──authorize──▶  SizOps (OIDC provider, RS256)
        ▲                                    │
        │             code + PKCE            │ login + consent
        └────────── token exchange ◀─────────┘
        │   ID token validation (JWKS, iss, aud, exp, nonce)
        ▼
find/create/link CityFlow user by `sub`
        ▼
issue EXISTING CityFlow HS256 JWT → existing OAuthCallbackPage
```

Complementary server-to-server integration: after OIDC login/link, CityFlow
calls SizOps `POST /api/v1/game/games/connect` with the SizOps game API key
(`SIZOPS_API_KEY`) to register the GamePlayer record on the SizOps side —
identity only, never game data, fire-and-forget. This is **optional**: SSO
never depends on it and its failures are logged, never blocking auth.

SizOps **fails fast** in production when `OIDC_PRIVATE_KEY` is missing
(`assertOidcKeysConfigured()` at startup) — an ephemeral key would invalidate
all previously issued ID tokens on restart. The key pair must live in a
persistent Kubernetes Secret (`sizops-secrets`).

## Bidirectional disconnect (August 2026, post-incident)

Two independent disconnect paths keep the relationship consistent in both
directions, each idempotent and audit-logged:

### CityFlow → SizOps (user unlinks in CityFlow Settings)

1. Authenticated CityFlow session + current password (when present).
2. Local `$unset` of `sizopsUserId`/`sizopsLinkedAt` (never `null` — the sparse
   unique index indexes explicit nulls).
3. A durable outbox record is enqueued (`SizopsOutbox`, event `disconnect`) and
   processed immediately; the scheduler (`* * * * *`) retries failures with
   exponential backoff (max 10 attempts) until SizOps confirms.
4. Processing calls SizOps `POST /api/v1/game/games/disconnect` (game API key)
   which deletes ONLY the CityFlow GamePlayer — never the SizOps user, never
   other games' connections.
5. Audit events: `sizops.unlink`, `sizops.disconnect_notify`,
   `sizops.disconnect_notify_failed`. Socket event
   `sizops:connection-updated` to open clients.

The local unlink NEVER depends on the remote call: if the network/SizOps is
down, the user is still disconnected locally and the outbox reconciles later.

### SizOps → CityFlow (user disconnects CityFlow in SizOps Settings)

1. SizOps deletes the CityFlow GamePlayer locally (idempotent).
2. SizOps calls CityFlow `POST /auth/sizops/disconnect-notify` with an RS256
   service JWT (verified via SizOps JWKS, issuer, audience = our OIDC client
   id, `purpose: cityflow:disconnect`).
3. CityFlow unsets `sizopsUserId` only for the user named in the token `sub`
   (idempotent; 200 with `disconnected:false` when already unlinked).

The notify URL is derived from the OIDC client's registered redirect URI (the
`/api` prefix is reused) — never a hardcoded path.

### SizOps "already signed in" recognition

SizOps login/register (API and OIDC authorize page) set an httpOnly
`sizops_session` cookie (HS256, signed with the SizOps access-token secret,
SameSite=Lax, 7 days). The OIDC `authorize` GET validates it and issues the
authorization code without a second login when valid; forged/invalid cookies
fall through to the login page. The authorize page's sign-in and register
panels share one form — register inputs use `reg_*` names so a browser submit
can never send duplicate `email`/`password` fields (duplicates arrive as
arrays and broke form login).

### Production repair procedure

1. Create a full CityFlow backup (`POST /admin/backups` or the scheduled
   backup) and verify a SizOps backup exists.
2. Read-only audit: `node backend/scripts/auditSizopsConnections.js` (needs
   `SIZOPS_MONGODB_URI`, or `SIZOPS_CONNECTIONS_JSON` fetched read-only when
   cluster NetworkPolicies block cross-namespace DB access).
3. Review the report; ambiguous cases (duplicate `sizopsUserId`, disabled
   SizOps users, CityFlow-linked-but-SizOps-missing) are reported, never
   auto-fixed.
4. `node backend/scripts/repairSizopsConnections.js --dry-run` — no changes.
5. `node backend/scripts/repairSizopsConnections.js --apply` — removes ONLY
   orphaned CityFlow GamePlayers via the authenticated game API. Idempotent.

## Consequences

- Existing CityFlow users keep their `_id`, balance, properties, companies,
  stocks, auctions, missions, achievements, transactions — everything.
- One-to-one mapping enforced by a unique sparse index on `User.sizopsUserId`
  plus atomic `findOneAndUpdate` guards.
- Unlinking is protected: blocked if it would leave no password and no other
  OAuth provider; requires re-authentication (current password) when the
  account has one.
- SizOps data never becomes the source of truth for CityFlow game state.
- Rollback = disable `SIZOPS_OIDC_ENABLED` (routes return 503; the model
  fields are inert).

## References

- CityFlow backend: `backend/src/routes/sizopsAuth.js`,
  `backend/src/services/sizopsOidc.js`,
  `backend/src/services/sizopsDisconnectOutbox.js`,
  `backend/src/models/User.js`, `backend/src/models/SizopsOutbox.js`,
  `backend/scripts/auditSizopsConnections.js`,
  `backend/scripts/repairSizopsConnections.js`
- SizOps backend: `server/src/services/oauth.service.ts`,
  `server/src/services/sessionCookie.ts`,
  `server/src/services/connections.service.ts`,
  `server/src/routes/oauth.routes.ts`, `server/src/models/OAuthClient.ts`,
  `server/src/models/AuthCode.ts`, `server/src/utils/jwks.ts`
- Tests: `backend/src/routes/__tests__/sizopsAuth.test.js`,
  `backend/src/routes/__tests__/sizopsDisconnect.test.js`,
  `SizOps/server/src/oauth.test.ts`,
  `SizOps/server/src/connections.test.ts`
