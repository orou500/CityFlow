# CityFlow AI Development Guide

## Project Overview

CityFlow is a multiplayer real estate simulation game.

Players:

- Buy properties
- Collect rent
- Upgrade buildings
- Build companies
- Compete on leaderboards
- Participate in a dynamic economy

The project aims to become a realistic economic simulator rather than a casual tycoon game.

---

## Tech Stack

Frontend

- React
- Vite
- Zustand
- React Router
- i18next

Backend

- Node.js
- Express
- MongoDB
- Mongoose
- Redis (ioredis) — caching, distributed locking, rate limiting, pub/sub, job queues (BullMQ)

Infrastructure

- Docker / Docker Compose
- Kubernetes (k3s)
- ArgoCD
- GitHub Actions

---

## Development Philosophy

Always prefer:

- Realism
- Scalability
- Multiplayer-first design
- Clean architecture
- Backward compatibility

Avoid:

- Hardcoded values
- Fake data
- Client-side authority
- Duplicate business logic

---

## Game Philosophy

CityFlow is NOT a clicker game.

It is a long-term economic simulation.

Players should:

- Think strategically
- Invest carefully
- Manage risk
- Cooperate through companies

Late-game progression is important.

---

## Existing Major Systems

- Property Market
- Dynamic Pricing Engine
- Property Improvements
- Development Projects
- Loans
- Market Events
- Companies (Stock Market)
- Real Estate Companies (Player-created guilds/clans)
- Property Auctions & Competitive Bidding
- Leaderboards
- Competitive Events
- OAuth
- Notifications

---

## Coding Rules

Never break existing APIs.

Always create migrations if database changes.

Always support EN + HE translations.

Always write reusable components.

Never remove existing functionality unless requested.

---




## Backup Rules

The admin backup system automatically includes **every MongoDB collection** (it enumerates `db.listCollections()`), so new models are covered by default. The following rules keep it that way:

- When adding a new persistent Mongoose model: place it in `backend/src/models/`, do NOT give it a custom collection name, and ensure it is registered (imported) somewhere — the model-coverage test (`backend/src/engine/__tests__/backupIntegration.test.js`) fails if any registered model's collection is missing from a backup.
- Do NOT add collections to a hardcoded backup list — the system is dynamic. If a collection must be excluded, add it to `EXCLUDED_BACKUP_COLLECTIONS` in `backend/src/engine/backup.js` WITH a documented reason (the coverage test exempts only collections listed there).
- Backup format is versioned (`BACKUP_VERSION` in `backend/src/engine/backup.js`). Bump it and document the change in `README.md` whenever the on-disk format changes.
- Serialization uses EJSON (ObjectIds, Dates, Buffers). Do not hand-roll JSON serialization of documents.
- Keep restore safe: it must create a pre-restore safety backup, preserve the performing admin, recreate indexes, validate counts, and leave maintenance mode ON on failure.
- Every new feature that persists data must remain restore-safe — if restoring from a backup would break the feature, fix the backup/restore code in the same PR.

---

## Notification Idempotency Rules

Every notification-producing event must be **at most one notification per user per logical event**. The database, not an `if (!existing)` pre-check, is the final protection.

- All notifications MUST be created via `enqueueNotification()` / `createNotification()` in `backend/src/utils/notificationQueue.js` — never `Notification.create()` directly in routes/engine (except tests).
- Every call site MUST pass a stable, content-free `eventKey` identifying the logical event, e.g. `mission:{missionProgressId}:completed`, `auction:{auctionId}:won:{userId}`, `company:{companyId}:loan:{requestId}:approved:{userId}`, `season:{seasonId}:reward:{userId}`, `levelup:{userId}:{level}`.
- `eventKey` is unique per `(userId, eventKey)` at the DB level (unique partial index on the Notification model) — concurrent requests, engine retries, tick re-runs and socket reconnects can never create a second record.
- NEVER derive the key from `title`/`message` text — amounts and wording drift between versions and would create duplicates (or suppress distinct events). Never reuse one key for a fan-out to multiple users; include `userId` (or a per-user id) in every key.
- Socket events (`emitToUser`) are delivery, not creation: `createNotification()` returns `{ created, notification }` and the socket emit only fires on actual creation. Reconnects/polls must never create a notification.
- New notification types/sites are covered by `backend/src/engine/__tests__/notificationIdempotency.test.js` (one event → one notification, including concurrency and dual-path cases).
- Read/unread state, deletion, pagination and the `eventId` legacy field are unchanged; `eventKey` is nullable for pre-existing notifications.
- Notification deletion is server-side and ownership-checked (`DELETE /notifications/:id` → 403 for other users' records). The route emits `notification:deleted` (payload: `{ notificationId }`) so all open clients remove the record; frontend removes optimistically and rolls back on failure. Never restore a deleted notification from stale state.

### Priority, Categories, Preferences, Merging & Retention (August 2026)

- **Priority (`critical/high/medium/low`) and `category`** are derived from the logical `eventKey` structure by `getNotificationMeta()` in `backend/src/config/notificationConfig.js` — never from title/message text. Callers may override via explicit `priority`/`category` on the payload. Config also holds `MAX_UNREAD_NOTIFICATIONS` (300), `READ_RETENTION_DAYS` (7) / `CRITICAL_READ_RETENTION_DAYS` (30), `MIN_RENT_READY_AMOUNT` and `RENT_READY_EVENT_KEY(userId)`.
- **Category preferences**: `User.notificationPreferences` subdoc gates delivery per category. CRITICAL notifications ALWAYS bypass preferences. Gate is enforced inside `createNotification()`/`bulkCreateNotifications()` via `isNotificationAllowed()` in `backend/src/utils/notificationPreferences.js` (cached via `cf:notif:prefs:{userId}`, TTL 30s). Endpoints: `GET/PUT /notifications/preferences` (PUT only accepts boolean keys listed in `DEFAULT_PREFERENCES`).
- **Bulk fan-outs**: use `bulkCreateNotifications(items)` in `notificationQueue.js` for tick/engine loops and multi-member company notifications. It batches via `bulkWrite({ ordered: false })`, dedupes on the same (userId, eventKey) unique index, filters by preferences (one cached lookup per user), drops LOW-priority items for users at/over the unread cap, and emits a socket event only for records actually inserted.
- **Merge mode**: pass `{ merge: true }` to `createNotification()`/`bulkCreateNotifications()` for recurring reminders that must stay ONE notification (e.g. the rent-ready notice refreshing its amount). Merge updates `title`/`message` on the existing record, never re-emits a socket event, and keeps a single DB row per (user, eventKey).
- **Rent-ready notification**: created by `ensureRentReadyNotification()` in `backend/src/engine/rentProcessing.js` when `uncollectedRent >= MIN_RENT_READY_AMOUNT` (merged on `rent:ready:{userId}`), removed by `clearRentReadyNotification()` on collect (`routes/rent.js` POST /collect) or forfeiture (`expireUncollectedRent()`). Do not add a second rent notification path.
- **Retention**: `runNotificationRetention()` in `backend/src/engine/notificationRetention.js` prunes READ notifications older than the window (critical kept 30 days, others 7; legacy rows without `readAt` fall back to `updatedAt`). Unread notifications are never auto-deleted. Runs nightly via `scheduler.js` (03:00) and opportunistically from `GET /notifications`. `readAt` is stamped when a notification is marked read.
- **Frontend**: `NotificationsPage.jsx` renders priority badges + filter tabs (all/unread/critical/high); `Navbar.jsx` only shows toasts for `critical`/`high` priority (`notification:new` payload now carries `priority`/`category`). `useGameStore.fetchNotifications(page, limit, filters)` supports `{ priority, category, unread }` (GET `/notifications?priority=&category=&unread=`).

---

## World Map Rules

The world map (`/map`, `frontend/src/pages/MapPage.jsx` + `frontend/src/components/WorldMap.jsx`) is a Leaflet/react-leaflet v4 instance inside the `.app-shell` layout.

- **Never unmount/remount the map for loading data.** `MapPage` renders `WorldMap` unconditionally and shows the loader as an absolutely-positioned OVERLAY (`absolute inset-0 z-[500]`) — the old code swapped the map for the loader whenever the shared `useGameStore.loading` flag flipped, which destroyed and recreated Leaflet on every visit (double init, camera reset, blank flash). Keep the map mounted; any future `loading` gating must stay an overlay.
- **Keep the flex height chain shrunken so the map never stretches the page.** The `.app-shell` is a document-flow container at `min-height: 100vh/100dvh` (`Layout.jsx`) — the DOCUMENT is the scroll container, and the footer is an ordinary in-flow element below the content (it is NOT sticky/fixed and `<main>` has NO `overflow-y-auto`). The map fills the available viewport ABOVE the footer, while the footer scrolls into view below it. Every flex container between `.app-shell` and the map wrapper still needs `min-h-0` (`main` → content wrapper in `Layout.jsx` → `MapPage` root → map wrapper `flex-1 min-h-0`) so the map can shrink on short/landscape viewports instead of pushing the footer below the fold. Never reintroduce a tall pixel floor like `min-h-[500px]` on the map wrapper, and never reintroduce the viewport-locked inner scroll shell (`overflow-hidden` + `height:100vh` + `overflow-y-auto`) that glued the footer to the screen — regression coverage: `frontend/e2e/footer.spec.js` + `src/components/__tests__/Layout.test.jsx`.
- **Do not cover Leaflet's controls.** `.leaflet-container` is `z-index: 0`, so a `z-10` card at the map's top-left hides the zoom in/out buttons. `WorldStatusWidget` owns the LEFT side and sits at `top-20 left-4` (below Leaflet's top-left zoom control); `MapLegend` owns bottom-right; keep overlay panels out of the top-left corner (Leaflet zoom control) and away from `MapLegend` bottom-right. The `world-status-panel` class anchors e2e geometry assertions.
- **Camera:** `FitBounds` fits exactly once per dataset, keyed on city ids/coordinates (never refit on refetch re-renders or resize), deferred via `map.whenReady`. Keep that pattern. `MapContainer` starts at `minZoom={0}` + `zoomSnap={0.25}`; `FitBounds` then raises the run-time floor to `minZoomForWidth(containerWidth)` — the smallest fractional zoom whose world (256·2^z px) fills the viewport — so the **whole playfield fits on every screen with no edge repetition or cropping**. "Zoomed out of existence" is prevented by `maxBounds={[[-85,-180],[85,180]]}` + `maxBoundsViscosity={0.8}` locking the world edges. Zoom-level 0/duplicated-continents must never be reachable at fit: below the clean-world floor the world is SMALLER than the viewport and repeats side-by-side. The floor is re-derived on `map 'resize'` (never refits the camera).
- **Country badges are compact** (dot + short label, `iconSize [70,36]`, bottom-center anchor) — a per-country "N cities" meta line made labels overlap (38+ collisions at world zoom) and is gone; the city list lives in the popup.
- **Resize:** `MapResize` (ResizeObserver + window `resize`/`orientationchange`, 150ms debounce, full cleanup) is the single resize system — reuse it; never add a second `invalidateSize()` path or a `setTimeout(schedule, 0)` retry loop.
- E2E geometry/interaction regression coverage lives in `frontend/e2e/worldmap.spec.js` (single-instance, no-overflow at 1366x768/390x844/844x390/412x915, **whole-playfield visibility — every country marker must be on-screen per viewport**, uncovered zoom controls + zoom both ways, world-status LEFT below the zoom control, mobile fit zoom < 2 + world-fills-viewport (no duplicated continents), world→city popup navigation). Run it with `BASE_URL` set to the deployed site (see the auctions spec for the run-after-deploy pattern).

---

## Onboarding Tour Rules

- New-player guided tour state lives in `User.onboardingV2` (`{ status, currentStep, completedSteps, startedAt, completedAt, skippedAt }`) — persisted server-side, never client-only.
- Steps are defined in `backend/src/config/onboardingTour.js`. Informational steps advance via `POST /onboarding/tour/advance`; event-gated steps (`buy_property`, `collect_rent`, `upgrade_property`, `missions`) ONLY advance when the real gameplay event fires server-side (wired through `processPlayerProgress()` and the mission engine) — the client can never claim them.
- Migration is lazy and runs once: existing players get event steps marked complete when their history proves them (owned properties, rent collected, upgrades, completed missions) and never see first-time steps.
- Skip (`POST /onboarding/tour/skip`) persists; completion creates exactly one idempotent notification (`onboarding:{userId}:completed`).
## Before Every Task

Understand the existing architecture.

Search before creating new code.

Reuse existing components.

Maintain backward compatibility.

Think about future scalability.

## Long-Term Vision

Future systems include:

- Public Companies (IPO)
- Stock Market
- Population Simulation
- Neighborhood Control
- Risk System
- Missions
- Banking Expansion
- Discord Integration

Every new feature should integrate naturally with these systems whenever possible.

---

## Commands

### Backend

```bash
cd backend
npm run dev          # Start dev server (port 5000)
npm run test         # Run all tests (Vitest, serial, no parallelism)
npm run test:coverage # Run with coverage
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix lint
npm run format       # Prettier check
npm run format:fix   # Auto-fix formatting
```

### Frontend

```bash
cd frontend
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run test         # Run tests
npm run lint         # ESLint check
npm run format       # Prettier check
```

### Discord Bot

```bash
cd discord-bot
npm run start        # Start bot
npm run dev          # Start with file watching
npm run deploy       # Register slash commands with Discord
npm run setup        # Auto-create guild roles and channels
```

---

## Project Structure

```
cityflow/
├── backend/              # Node.js/Express API + simulation engine
│   └── src/
│       ├── config/       # Environment, DB, simulation constants
│       ├── engine/       # Tick-based simulation logic (22 files) (22 files)
│       ├── middleware/    # JWT auth, admin, maintenance, rate limiting
│       ├── models/       # Mongoose schemas (39 models)
│       ├── routes/       # Express routes (27 files)
│       ├── services/     # Email, push notifications, Discord bot API
│       ├── test/         # Vitest setup, helpers, MongoDB Memory Server
│       └── utils/        # Leveling, password validation
├── frontend/             # React/Vite SPA + Capacitor mobile
│   └── src/
│       ├── components/   # Reusable UI (25 files)
│       ├── hooks/        # Custom hooks
│       ├── i18n/         # EN + HE translation files + error translation
│       ├── pages/        # Route-level components (38 pages)
│       ├── store/        # Zustand stores (5 stores)
│       └── utils/        # Platform detection, formatting, biometric
├── discord-bot/          # Discord.js bot (31 slash commands)
│   └── src/
│       ├── commands/     # Slash commands (game, moderation, staff)
│       ├── events/       # Discord event handlers
│       ├── models/       # Mongoose schemas for bot data
│       └── utils/        # Command/event loaders, logger
├── k8s/                  # Kubernetes manifests (Kustomize)
└── .github/workflows/    # CI/CD (ci.yml, cd.yml, mobile.yml)
```

---

## Key Architecture Facts

### Tick-Based Simulation

- **1 tick = 6 real-life hours**
- Ticks run at 00:00, 06:00, 12:00, 18:00 (every 6 hours)
- **24 hours = 4 ticks**, 48 hours = 8 ticks
- Seasons last 720 ticks (~180 days), then world resets
- When user says "24h", they mean 4 ticks
- All time-sensitive game logic should use tick numbers, not wall-clock time

### Backend Engine

- 22 engine files execute simulation phases each tick
- `tick.js` is the master orchestrator (25+ phases)
- **Auction processing runs first** (before city simulation, markets, rent, etc.) to eliminate race conditions between tick advancement and auction state transitions
- Engine processes are ordered: e.g., for company loans: auto-vote → auto-execution → expiration
- Use `bulkWrite()` with 500-document batches for performance
- Distributed tick locking via Redis `SET NX EX` (falls back to MongoDB when Redis unavailable)
- Cache invalidation runs after each tick (leaderboard + stats + auctions)

### Redis Infrastructure

- **Client**: `backend/src/config/redis.js` — ioredis, lazy connect, auto-reconnect, graceful fallback
- **Cache utility**: `backend/src/utils/cache.js` — `cacheGet`, `cacheSet`, `cacheDel`, `cacheGetOrSet`, `cacheMget`, `cacheDelPattern`
- **Distributed lock**: `backend/src/utils/redisLock.js` — `acquireLock`, `releaseLock` with Lua script for owner verification
- **Rate limiting**: `backend/src/middleware/rateLimit.js` — Redis sliding window (sorted set), falls back to in-memory
- **Notification queue**: `backend/src/utils/notificationQueue.js` — `createNotification()`/`bulkCreateNotifications()` write directly to MongoDB (the DB-level unique `(userId, eventKey)` index is the dedup guard) and emit socket events there; the legacy Redis list `notifications:queue` is NOT a write path. `processNotificationQueue()` (run by `scheduler.js` every minute) only drains stale items left by older versions and must NEVER call `createNotification()` for a popped item — that would `upsert` and resurrect a notification the user deleted. `getNotificationQueueSize()` feeds `/metrics`.
- **Pub/Sub**: `backend/src/utils/pubsub.js` — `publish`, `subscribe` for real-time events
- **Job queues**: `backend/src/utils/jobQueue.js` — BullMQ for tick, email, backup, discord, notifications, analytics

**Caching keys**:
- `lb:rankings:{category}:{season}:{offset}:{limit}` — leaderboard rankings (TTL: 3min)
- `lb:summary:{season}` — leaderboard summary (TTL: 2min)
- `lb:myrank:{userId}:{season}:{categories}` — player rank (TTL: 3min)
- `lb:player:{userId}` — player profile ranks (TTL: 3min)
- `lb:history:{category}:{season}:{limit}` — leaderboard history (TTL: 3min)
- `stats:global` — public stats (TTL: 1min)
- `lock:tick:lock` — distributed tick lock (TTL: 3min)

**Fallback behavior**: If Redis is unavailable, all features gracefully degrade to MongoDB/in-memory equivalents. Application never crashes due to Redis failure.

### Dual Company Systems

- **RealEstateCompany**: Player-created companies with treasury, voting, shares, members
- **Company**: Auto-generated stock market companies for player trading
- These are separate systems with separate models and routes

#### Real Estate Company Details

- **Model**: `backend/src/models/RealEstateCompany.js` (embedded subdocuments: members, invitations, applications, loanRequests, propertyPurchaseRequests, treasury)
- **Routes**: `backend/src/routes/realEstateCompanies.js` (~1800 lines, all endpoints under `/real-estate-companies`)
- **Engine**: `backend/src/engine/companyProcessing.js` (rent, loan payments, level-up, loan request processing)
- **Frontend**: `frontend/src/pages/CompanyDetailPage.jsx` (7 tabs: overview, members, applications, treasury, properties, loans, audit)
- **Store**: `frontend/src/store/useCompanyStore.js` (~448 lines, 30+ functions)

**Role hierarchy**: ceo > director > officer > member > recruit

**Permission system** (`hasPermission()` in routes file):
- **ceo**: ALL permissions (short-circuits to true)
- **director**: invite_members, manage_properties, initiate_investments, view_treasury, manage_treasury, manage_settings, manage_applications, manage_loan_requests, remove_members
- **officer**: invite_members, view_treasury, manage_applications
- **member/recruit**: view_company, contribute_funds

**Voting system** (used for both loans and property purchases):
- Any member (excluding proposer) can vote yes/no
- Threshold: 50% of `totalVoters` (members.length - 1)
- Minimum 2 members required for a vote
- CEO auto-votes YES after 4 ticks of inactivity (loan requests only)
- Requests expire after 8 ticks without resolution (loan requests only)
- Property purchase requests: auto-execute when threshold met (no CEO execute step)
- Loan requests: CEO must manually execute after approval

**Application flow**:
- Player applies via `POST /:id/apply` (checks: not in another company, no existing pending application)
- Application stored in `company.applications` subdocument array with status 'pending'
- Notifications sent to founder + directors + officers (using company member roles, NOT User.role)
- Officers+ approve/reject via `POST /:id/applications/:appId/approve|reject`
- On approval: new member added as 'recruit', applicant's `companyId` set

**Treasury operations**:
- Any member can deposit (transfers personal balance to company treasury)
- Directors+ can withdraw (transfers company treasury to personal balance)
- Transaction types: deposit, withdrawal, rent_income, loan_disbursement, loan_payment, property_purchase, property_sale, construction, contract_reward, investment_withdrawal, investment_return, development
- Treasury transactions are retained for 4 ticks (24 hours) plus a createdAt fallback for legacy entries, then pruned each tick to keep the DB light
- In-memory hard cap of 100 transactions still applies before pruning

#### Property Auction System

- **Model**: `backend/src/models/Auction.js` (status: upcoming/active/ending/ended/cancelled, embedded bid/activity subdocs, watchers array, reputation tracking)
- **Routes**: `backend/src/routes/auctions.js` (~1000 lines, 13 endpoints under `/auctions`)
- **Engine**: `backend/src/engine/auctionProcessing.js` — tick-based lifecycle, settlement, bank generation, anti-sniping
- **Config**: `backend/src/config/auctions.js` — 18 property templates (3 tiers), rarity weights, auction constants
- **Frontend**: `frontend/src/pages/AuctionDashboardPage.jsx` — 6 tabs, featured section, analytics panel, live activity feed, watchlist, company bid modal, reputation display

**State machine**: Upcoming → Active → Ending (2 ticks) → Ended → History
- Auctions process at the start of every world tick (before all other simulation)
- **Ending** phase: lasts 2 ticks, no new bids allowed, settlement occurs (winner charged, seller paid, property transferred, notifications sent)
- **Bank generation**: Scales with player count (`baseUpcoming + playerCount * 0.03`, max 12 upcoming, max 15 active)

**Seller types**: bank, player, event
**Auction types**: standard, reserve (with reserve price)

**Anti-sniping**: When a bid is placed within 2 ticks of end, auction extends by 1 tick

**Featured scoring** (composite algorithm):
- valueScore (30%) + bidsScore (25%) + watchersScore (20%) + rarityBonus (0-30) + endingSoonBonus (20)

**Company participation**: Members with `initiate_investments` permission can propose bids → company vote → if approved, treasury places bid

**Watchlist**: Up to 50 per player, auto-add when user bids, notifications for outbid/reserve/ending/extension/cancellation

---

### Redis Caching Keys (Auction)

- `cf:auction:{id}` — individual auction detail (TTL: 15s)
- `cf:auctions:{status}` — auction list by status (TTL: 20s)
- `cf:auctions:featured` — featured auctions (TTL: 30s)
- `cf:auctions:analytics` — global auction stats (TTL: 60s)
- `cf:auctions:watchlist:{userId}` — user watchlist (TTL: 30s)
- `cf:auctions:rep:{userId}` — user auction reputation (TTL: 120s)

Cache invalidation on: new bid, auction completed, auction cancelled, watchlist updated, tick completed (`cacheDelPattern('cf:auction*')`)

---

### i18n (Internationalization)

- **Two languages**: English (`en.json`) and Hebrew (`he.json`)
- **Always update both files** when adding new UI strings
- RTL support is built-in for Hebrew
- Error translation uses regex patterns in `frontend/src/i18n/errors.js`
- Dynamic keys like `companies.audit${CamelCaseAction}` require exact key naming

### Mobile (Capacitor)

- Full native Android/iOS support via Capacitor 8
- Push notifications (FCM), biometric auth, deep linking
- Platform detection: `isNativePlatform()`, `isAndroid()`, `isIOS()`, `isWeb()`
- Token storage: dual-synced (Capacitor Preferences + localStorage)

---

## Coding Conventions

### API Design

- All routes return JSON
- Use `authenticate` middleware from `middleware/auth.js` for protected routes
- Use `requireAdmin` middleware for admin-only routes
- Rate limiting applied via `middleware/rateLimit.js` factory

### Database

- Mongoose models with embedded subdocuments where appropriate (e.g., `RealEstateCompany` has nested members, invitations, loan requests)
- Use `bulkWrite()` for batch operations in engine files
- All models use `{ timestamps: true }` for `createdAt`/`updatedAt`
- Indexes defined explicitly on models

### Testing

- Vitest with `mongodb-memory-server` for backend tests
- Tests run serially (`fileParallelism: false`)
- Test timeout: 30 seconds
- Global setup creates in-memory MongoDB, per-file setup connects/disconnects
- Backend uses `supertest` for HTTP testing
- Frontend uses `@testing-library/react`

### Code Style

- ESLint flat config (no `.eslintrc`)
- Prettier for formatting
- ES modules (`"type": "module"` in all packages)
- Unused vars: warn with `argsIgnorePattern: "^_"`

---

## Deployment

### GitOps Flow

1. Push to `main` triggers CI (lint + test + build)
2. CD pipeline builds Docker images, pushes to GHCR
3. CD updates `k8s/*/deployment.yml` with new image tags
4. ArgoCD detects Git changes and auto-syncs K8s cluster

### Services

- **Frontend**: React/Nginx, 2 replicas, port 80
- **Backend**: Node.js/Express, 2 replicas, port 5000
- **Discord Bot**: Discord.js, 1 replica (Recreate strategy), port 5001
- **MongoDB**: Mongo 7 StatefulSet, 1 replica, port 27017

### Environment

- Domain: `cityflow.sizops.co.il`
- TLS: Let's Encrypt via Traefik
- Secrets: K8s Secrets (not committed to Git)

---

## Common Pitfalls

1. **Tick timing**: Always use tick numbers for game logic timing, not `Date.now()` or wall-clock time
2. **i18n sync**: Every new UI string needs both `en.json` and `he.json` entries
3. **Engine ordering**: Simulation phases in `tick.js` execute in a specific order; changing order can cause bugs
4. **Company systems**: Don't confuse `RealEstateCompany` (player companies) with `Company` (stock market)
5. **Mobile platform**: Always check `isNativePlatform()` before using web-only APIs
6. **Test isolation**: Tests use in-memory MongoDB; each test file gets a fresh connection
7. **API backward compatibility**: Never break existing API contracts; add new fields, don't remove old ones
8. **User.role vs company member role**: The User model's `role` field (`user`/`admin`) is different from company member roles (`ceo`/`director`/`officer`/`member`/`recruit`). When querying permissions within a company, always use the member's role from `company.members[]`, never query `User.role`
9. **Company permissions**: The `hasPermission()` function defines per-role permissions. Always verify new endpoints use the correct permission name and that it's granted to the intended roles
10. **Voting threshold**: For company votes, `totalVoters = members.length - 1` (excludes the proposer). Threshold is 50% of totalVoters
11. **Auction engine ordering**: `processAuctions()` must run immediately after `global.currentTick = tickNumber` in `tick.js` — before any other simulation — to prevent race conditions where API requests see the new tick before auctions are activated/finalized
12. **MongoDB transactions**: `settleAuction()` runs without MongoDB sessions/transactions (standalone MongoDB doesn't support them). All saves are direct `findById` + `save()` with individual error handling
13. **Auction state machine**: Every auction must always progress through `upcoming → active → ending (2 ticks) → ended`. Never skip the `ending` phase
14. **Bank auction scaling**: Generation targets are calculated per tick based on player count. If `currentTotal >= targetTotal`, no new bank auctions are generated until existing ones complete
15. **No `new` operator on `mongoose.Types.ObjectId`**: When creating ObjectIds in routes/engine, use `new mongoose.Types.ObjectId(string)` not bare strings

---

## Mission & Career System (Completed July 2026)

### evaluateCondition() — Authoritative Data Sources

All 22 condition types in `evaluateCondition()` read from MongoDB directly (not stale User doc counter fields):

| Condition | Source |
|-----------|--------|
| `properties_owned` | `Property.countDocuments({ ownerId, forSale: true omitted })` |
| `total_rent_collected` | `Transaction.countDocuments({ buyerId, type: 'rent' })` |
| `total_upgrades` | `Transaction.countDocuments({ buyerId, type: { $in: ['upgrade', 'grade_upgrade'] } })` |
| `total_properties_sold` | `Transaction.countDocuments({ sellerId, type: { $in: ['sell', 'buy'] } })` |
| `auctions_won` | `Auction.countDocuments({ winnerId, status: 'ended' })` |
| `rare_auctions_won` | `Auction.countDocuments({ winnerId, status: 'ended', propertyRating: 'elite' })` |
| `total_construction_completed` | `ConstructionProject.countDocuments({ ownerId, status: 'completed' })` |
| `company_votes_cast` | `RealEstateCompany.aggregate` counting votes subdocs by `userId` |
| `company_projects_completed` | `ConstructionProject.countDocuments({ companyId, status: 'completed' })` |
| `district_leader` | In-memory sort of `District.influence[]` by `score` |
| `money_earned_this_week` | Aggregation of Transaction types `sell`+`rent` this tick week |
| `company_properties_purchased` | `Property.countDocuments({ companyId })` |
| `total_loans_taken` | `Loan.countDocuments({ userId, active: true })` |
| `rent_collected_today` / `upgrades_today` | Transaction count in current tick period |
| `auctions_won_this_week` | Auction count by `winnerId` in tick week window |

### Two Progression Pipelines (now unified)

**Before (July 2026 fix):**
- `processPlayerProgress()` (routes) — full pipeline: missions + achievements + XP + cache + `career:updated` socket
- `triggerMissionProgress()` (engine ticks) — fire-and-forget, missions only, no achievements/XP/sockets

**After:** `triggerMissionProgress()` now calls `processPlayerProgress()` internally — same full pipeline, still fire-and-forget. All 10 engine call sites (auctionProcessing, companyProcessing, cityContracts, loanProcessing, constructionProcessing, treasuryInvestments, rentProcessing) automatically get achievements, XP, career cache, and socket emissions.

### Reward Atomicity

`claimMissionReward()` uses `findOneAndUpdate({ userId, missionId, status: 'completed' }, { status: 'claimed' })` — atomically transitions from completed→claimed, preventing double-claims from concurrent requests.

### Route Coverage

Every gameplay action route calls `processPlayerProgress()` with the correct event name. See `playerProgress.js` `XP_REWARDS` map for all 29 supported events. Engine tick events now also flow through the full pipeline via `triggerMissionProgress()` → `processPlayerProgress()`.

### Android Production API

`frontend/src/utils/capacitor.js`:
- Android native: `isDev ? 'http://10.0.2.2:5000' : 'https://cityflow.sizops.co.il/api'`
- Production APK on real devices auto-connects to production API (no `VITE_API_URL` needed)

---

## SizOps SSO Integration (OIDC, August 2026)

### Non-negotiable rules

> Never modify or replace the production CityFlow JWT secret when implementing SizOps integration. Never migrate or merge users based solely on email. All identity linking must preserve the existing CityFlow user `_id` and all existing game data.

- Never share `JWT_SECRET` (or any signing secret) between CityFlow and SizOps. CityFlow keeps its HS256 7-day JWT; SizOps OIDC uses its **own RS256 key pair** (`OIDC_PRIVATE_KEY`).
- Never auto-link SizOps accounts by email — the only trusted identity is the verified ID-token `sub` → `User.sizopsUserId`.
- Never modify an existing CityFlow `_id`; never recreate/migrate/duplicate users; linking only adds `sizopsUserId`/`sizopsLinkedAt`.
- Never replace CityFlow JWTs with SizOps tokens — SizOps auth only ever issues the existing CityFlow session.
- Never expose OIDC client secrets / `SIZOPS_OIDC_CLIENT_SECRET` / `OIDC_PRIVATE_KEY` to the frontend or logs.
- Never change existing Google/Discord/email login behavior.

### Key files (CityFlow)

- `backend/src/routes/sizopsAuth.js` — `GET /auth/sizops` (login start), `POST /auth/sizops/link-start` (authenticated), `GET /auth/sizops/callback` (code exchange + ID-token validation), `GET /auth/sizops/status`, `POST /auth/sizops/unlink`, `POST /auth/sizops/disconnect-notify` (SizOps→CityFlow, RS256 service JWT, idempotent).
- `backend/src/services/sizopsOidc.js` — discovery/JWKS (cached), RS256 ID-token validation (issuer, audience, exp, nonce), PKCE code exchange, `registerGamePlayer()`/`unregisterGamePlayer()` (SizOps game API, identity only, fire-and-forget).
- `backend/src/services/sizopsDisconnectOutbox.js` + `backend/src/models/SizopsOutbox.js` — durable disconnect outbox: unlink enqueues `disconnect`, scheduler (`* * * * *`, backoff, max 10 attempts) calls SizOps `/api/v1/game/games/disconnect` until done; audit `sizops.disconnect_notify` / `sizops.disconnect_notify_failed`. The local unlink NEVER depends on the remote call.
- `backend/src/models/User.js` — `sizopsUserId` (unique sparse index — the one-to-one guard), `sizopsLinkedAt`. **Unlink must `$unset` these fields** — writing explicit `null` collides with the sparse unique index.
- `backend/src/models/SizopsAuditLog.js` — audit events `sizops.login/link/unlink/login_failed/oauth_error/disconnect_notify/disconnect_notify_failed`; never log passwords, secrets, or tokens.
- Config block: `config.sizops.oidc` (`SIZOPS_OIDC_*`) + `config.sizops.api` (`SIZOPS_API_KEY`, `SIZOPS_CLIENT_ID`; `baseUrl` falls back to the OIDC issuer).
- `backend/scripts/auditSizopsConnections.js` / `repairSizopsConnections.js` — read-only audit + dry-run-by-default repair of CityFlow↔SizOps link inconsistencies (removes ONLY orphaned CityFlow GamePlayers via the game API; ambiguous cases are reported, never auto-fixed).

### Key files (SizOps, sibling repo `../SizOps`)

- `server/src/services/oauth.service.ts` + `server/src/routes/oauth.routes.ts` — OIDC provider (authorize/token/userinfo/jwks, PKCE S256, single-use hashed auth codes). The authorize page's register-panel inputs use `reg_*` names — never duplicate `email`/`password` names in one form (duplicates arrive as arrays and break login). An httpOnly `sizops_session` cookie (signed HS256, SameSite=Lax) lets `authorize` skip login for already-signed-in users; forged cookies fall through to the page.
- `server/src/services/sessionCookie.ts` — shared session-cookie helpers (set on login/register + OIDC authorize sign-in/register).
- `server/src/services/connections.service.ts` — SizOps-side disconnect: deletes ONLY the CityFlow GamePlayer and notifies CityFlow with a signed service JWT (`aud` = OIDC client id, `purpose: cityflow:disconnect`); notify URL derived from the client redirect URI.
- `server/src/models/OAuthClient.ts`, `server/src/models/AuthCode.ts`, `server/src/utils/jwks.ts` (RS256).
- Client registration: admin `POST /api/v1/admin/oauth-clients` or `npm run seed` with `SEED_OIDC_CLIENT_*`.

### Env vars

- `SIZOPS_OIDC_ENABLED` (feature flag; start `false`), `SIZOPS_OIDC_ISSUER`, `SIZOPS_OIDC_CLIENT_ID`, `SIZOPS_OIDC_CLIENT_SECRET`, `SIZOPS_OIDC_REDIRECT_URI`, `SIZOPS_OIDC_SCOPE`.
- `SIZOPS_API_KEY` + `SIZOPS_CLIENT_ID` — **optional** server-to-server game API credentials for GamePlayer registration only; OIDC SSO must never depend on them. Registration failures are logged, never block login/link.
- SizOps side requires a **persistent** `OIDC_PRIVATE_KEY` in production — SizOps fails fast at startup if it is missing (`assertOidcKeysConfigured()` in `server/src/utils/jwks.ts`). Never allow an ephemeral key in production: restarts would invalidate all previously issued ID tokens.
- Tests: `backend/src/routes/__tests__/sizopsAuth.test.js` mocks the SizOps OIDC endpoints with a local RS256 key pair; keep the production-safety regression test green (linking must not change any user data).

### ADR

See `docs/adr/0001-sizops-oidc.md`.

---

## Rewarded Video Ads (HilltopAds VAST, September 2026)

Players watch an ad from a **real** HilltopAds VAST tag and earn cash. The ad
source and reward are server-controlled; the frontend only ever watches.

### Security model (what the server enforces vs. what it cannot)

- The VAST protocol has **no server-verifiable completion callback** (no SSAI:
  tracking is client-side only). Completion is therefore **client-reported** —
  this is a documented limitation, NOT fraud-proof. Tell the client it completed,
  never claim it did on the server.
- The backend is the authority for everything else: reward **amount** (from the
  server-created session, never from the request body), single-use **sessions**,
  **cooldown**, **daily limit**, rate limiting and per-user locking.
- Session security: `POST /rewarded-ads/start` creates a short-lived `pending`
  session with a `vastUrl` + `rewardAmount` snapshot and an `expiresAt`. Reward
  is granted only by `POST /rewarded-ads/:id/complete`, which transitionally
  flips `pending → completed` with a guarded `findOneAndUpdate`
  (`{ status: 'pending', expiresAt: { $gt: now } }`) so concurrent completes can
  never double-pay. Payout = `creditUserBalance` + `Transaction.create({ type:
  'rewarded_ad' })`. If the payout DB write fails, the session is reverted to
  `pending` (never pay twice, never lose the reward). All completion logic runs
  inside `withUserLock` plus a best-effort distributed Redis lock
  (`lock:rewarded-ad:{userId}:lock`).
- Cooldown + daily limit are enforced at completion by querying the user's
  completed sessions; daily window is the UTC calendar day.
- The client **never embeds the VAST URL**: the player fetches
  `GET /rewarded-ads/session/:id/vast` — an ownership-checked backend proxy that
  serves the session's `vastUrl` as `text/xml`. `GET /rewarded-ads/config` is
  public but only exposes non-secret flags (`enabled`, `rewardAmount`,
  `cooldownSeconds`, `dailyLimit`); it never leaks the VAST url.
- Notifications use eventKey `rewardedad:{sessionId}:completed` → category
  `system`, priority `low` (see `getNotificationMeta()` in
  `backend/src/config/notificationConfig.js`).
- `processPlayerProgress(userId, 'rewarded_ad_watch')` awards 5 XP per completed
  ad (add `rewarded_ad_watch: 5` to `XP_REWARDS` in
  `backend/src/utils/playerProgress.js` — it's already there).

### Key files

- `backend/src/config/index.js` → `config.rewardedAds` (env-driven, `ready` =
  `enabled && vastUrl`).
- `backend/src/models/RewardedAdSession.js` — session model (`pending` /
  `completed` / `expired` / `aborted`). Sessions are lazily marked `expired`
  when past `expiresAt`; `POST /start` reaps stale `pending` sessions first.
- `backend/src/routes/rewardedAds.js` — `GET /config`, `GET /status`,
  `POST /start`, `GET /session/:id/vast`, `POST /:id/complete`, `GET /history`.
- `backend/src/models/Transaction.js` — `type` enum includes `'rewarded_ad'`
  (Mongoose validation at create — no DB migration needed).
- `frontend/src/utils/vastParser.js` — dependency-free VAST 3.0 InLine parser.
- `frontend/src/components/RewardedAdPlayer.jsx` — plays each Linear creative
  sequentially, falls back through MediaFiles, fires Impression/TrackingEvent
  beacons, reports `onComplete` only when the last ad `ended`. Single-instance
  lifecycle: an explicit `loading → playing → error` phase machine renders
  EXACTLY ONE loading block (removed as soon as the first media src is assigned)
  and a 15s VAST-fetch timeout fails the flow instead of leaving a stuck
  "Loading…" screen; `settledRef` absorbs duplicate completion callbacks.
- `frontend/src/pages/RewardedAdsPage.jsx` — `/rewards`, protected route. The
  start button is hidden while a session is loading/playing and an in-flight
  guard absorbs rapid double-clicks, so one click can never create two
  sessions/players.
- `frontend/nginx.conf` — CSP `media-src 'self' https:` (ad media comes from the
  ad network's HTTPS CDN and the host rotates; the VAST itself is same-origin
  through `/api`).

### Env vars (backend Secret)

- `REWARDED_AD_ENABLED` (default off)
- `REWARDED_AD_VAST_URL` — the HilltopAds tag
- `REWARDED_AD_REWARD_AMOUNT` (default `2000`)
- `REWARDED_AD_COOLDOWN_MINUTES` (default `5`)
- `REWARDED_AD_DAILY_LIMIT` (default `10`)
- `REWARDED_AD_SESSION_TTL_MINUTES` (default `10`)

Overriding the ad source is pure ops config — no frontend code change required.

### Admin dashboard (Monetization → Rewarded Ads)

- Route: `backend/src/routes/adminRewardedAds.js`, mounted at
  `/admin/rewarded-ads` behind `requireAdmin` (mounted in `index.js` and
  `test/createApp.js`). Never exposed to non-admins.
- `GET /dashboard` — per-range (`today`/`7d`/`30d`/`all`) blocks of real counts
  (`totalSessions` by status, `impressions`, `completionAttempts`,
  `failedCompletions`, `completed`, `rewarded`, `completionRate`) + CPM-projected
  `estimatedRevenue` + real `spend` (from `Transaction` type `rewarded_ad`) +
  env `limits` + provider links. Never contains the VAST URL.
- `GET /daily?days=7|30|90` — zero-filled day series (sessions/impressions/
  completed) for the chart. `GET /sessions` — paginated admin table with
  `username`, status, counters. `GET/PUT /config` — read/set the estimated CPM
  (stored in the singleton `RewardedAdConfig` doc, `key: 'default'`);
  `estimatedCpm` must be a finite non-negative number and the change is audited
  via `AdminAuditLog` action `rewarded_ads_config_updated`.
- Data honesty rules: reward amounts/limits come from the env config; only the
  estimated CPM is DB-tunable. `estimatedRevenue = impressions/1000 × cpm` and
  is always labeled **estimate** — it is NOT measured ad revenue (the VAST
  protocol exposes no server-verifiable earnings; no HilltopAds API credentials
  are stored or exposed to the frontend). The funnel is worst-case (impressions
  ≥ completed sessions). Completion is client-reported — the dashboard reflects
  that contract and never claims verified ad completion.
- Session counters (`RewardedAdSession`): `impressions` ($inc on each VAST proxy
  serve), `completionAttemptCount` ($inc on every `POST /:id/complete`),
  `failedCompletionCount` ($inc when a completion attempt for a pending session
  is rejected by cooldown/daily-limit/race). All increments are fire-and-forget
  and never block the request.
- Frontend: `frontend/src/components/RewardedAdsAdminPanel.jsx`, rendered as the
  **Monetization** tab in `frontend/src/pages/AdminPage.jsx` (`admin.monetization`
  + `rewardedAdsAdmin.*` i18n keys in `en.json`/`he.json`). Stat cards per range,
  `7/30/90`-day Recharts chart, funnel, server-limits card, CPM editor,
  HilltopAds publisher-dashboard/help links (default
  `https://hilltopads.com/login`, overridable via `REWARDED_AD_PUBLISHER_URL`),
  recent-sessions table with status filter + pagination.

### Tests

`backend/src/routes/__tests__/rewardedAds.test.js` (auth, disable 503, session
snapshot/no URL leak, resume-pending, VAST proxy ownership + failure/expiry,
one-time reward, concurrent completes → single payout, client amount ignored,
cooldown, daily limit, expiry, idempotent notification),
`backend/src/routes/__tests__/adminRewardedAds.test.js` (401/403/200, empty
defaults, 1000 impressions × $2 CPM = $2, completion rate 50%, range exclusion,
persisted CPM reflected, spend aggregation, daily fill, session pagination +
status filter, config GET/PUT + audit + validation) and
`frontend/src/utils/__tests__/vastParser.test.js`,
`frontend/src/components/__tests__/RewardedAdPlayer.test.jsx`,
`frontend/src/pages/__tests__/RewardedAdsPage.test.jsx`,
`frontend/src/components/__tests__/RewardedAdsAdminPanel.test.jsx`.
