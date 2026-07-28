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
│       ├── models/       # Mongoose schemas (25 models)
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
- **Notification queue**: `backend/src/utils/notificationQueue.js` — Redis list-based queue with batch processing
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
