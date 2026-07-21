<img width="1536" height="1024" alt="logo-text" src="https://github.com/user-attachments/assets/590d9e0b-4b9c-44b9-84a2-353450cfb036" />

<img width="2560" height="1326" alt="Screenshot 2026-07-10 012228" src="https://github.com/user-attachments/assets/e48b6b53-2ef4-42a1-bcb3-9bf3672461fa" />

# CityFlow – Global Real Estate Simulation

A full-stack real-time multiplayer simulation game where players buy, sell, develop, and manage properties across a dynamic global market. Features a living economy with demographics, a stock market, banking with credit scores, and an interactive world map. Built with Node.js, Express, MongoDB, and React. Available as a web app and native Android/iOS via Capacitor. Deployed on Kubernetes with ArgoCD, Let's Encrypt SSL, and automated CI/CD.

**[See CityFlow on itch.io](https://orou500.itch.io/cityflow)** · **[Join CityFlow Discord](https://discord.gg/vTav6WYQdQ)**

## Architecture

```
cityflow/
├── backend/
│   └── src/
│       ├── config/          # DB connection, env vars, scheduler, backup, demographics config
│       ├── engine/          # Simulation logic (tick, market, season reset, property generation, property valuation, credit score)
│       ├── middleware/       # JWT auth, admin guards, rate limiter, maintenance
│       ├── models/          # Mongoose schemas (User, Property, City, Season, GameState, Company, StockIndex, Loan, etc.)
│       ├── routes/          # REST API endpoints (26 route files)
│       ├── services/        # Email (Brevo SMTP), push notifications (Firebase), avatar download, HTML templates
│       ├── test/            # Test setup, helpers, and MongoDB Memory Server config
│       ├── utils/           # Validation, leveling, utility functions
│       ├── seed.js          # Database initializer
│       └── index.js         # Express app entry point
├── frontend/
│   └── src/
│       ├── components/      # Reusable UI (Navbar, Sidebar, WorldMap, OnboardingWrapper, Toast, etc.)
│       ├── hooks/           # Custom hooks (useNativeAvatarUrl)
│       ├── i18n/            # Internationalization (en, he)
│       ├── pages/           # 34 route-level page components
│       ├── store/           # Zustand state management (auth, game)
│       └── utils/           # Format utilities, Capacitor platform utils, push/biometric/network/deep link helpers
├── discord-bot/             # CityFlow Discord bot (Node.js, Discord.js 14, MongoDB)
│   └── src/
│       ├── commands/        # Slash commands (moderation, staff, game)
│       ├── events/          # Discord event handlers
│       ├── models/          # Mongoose schemas (GuildConfig, Warning, Ticket, Suggestion)
│       └── utils/           # Command/event loaders, helpers, logger
├── k8s/                     # Kubernetes manifests (namespace, deployments, ingress, etc.)
├── discord/                 # Discord server setup guides, role permissions, bot configs
├── .github/workflows/       # CI/CD pipelines (build, test, deploy, mobile, Play Store)
└── .env                     # Environment variables (not tracked)
```

## Features

| Feature | Description |
| ------- | ----------- |
| **Dynamic Market** | City demand/supply indices fluctuate each tick, driving property price changes with 6 market regimes (bull, bear, stable, recovery, correction, boom) |
| **Living Demographics** | Population birth/death rates, migration, economic conditions (boom/growth/stable/slowdown/recession) affecting demand, rent, and growth |
| **Property Generation** | New properties are automatically created each tick based on population, development rate, and demand |
| **Property Valuation Engine** | Intrinsic value calculated from upgrades, improvements, quality, investments, and city fundamentals; investment caps by property type |
| **Anti-Monopoly** | No player can own more than 5% of a city's total properties |
| **Rent Collection Pool** | Rent is deposited into a collectible pool based on city avg rent and property rating; 24-hour timer; players must manually collect or forfeit |
| **Maintenance Costs** | Ongoing costs based on improvement level: none (0%), basic (10%), standard (25%), premium (40%) of rent income |
| **Banking & Credit Score** | 300-850 credit score system with 6 tiers; 4 loan products (personal, mortgage, business, line of credit); interest rates adjusted by credit tier |
| **Stock Market** | Buy/sell shares in companies across 8 industries; real-time price tracking with performance history |
| **Stock Indexes** | Trade index ETFs (world, industry, city types); diversified investment vehicles |
| **Player-to-Player Offers** | Negotiate property purchases via offers, counter-offers, accept/reject (min 70% of market value) |
| **Construction & Development** | Buy land, build from 8 project types (residential, commercial, hospitality), upgrade buildings with 4 upgrade types |
| **Property Improvements** | 7 improvement types (renovation, interior, parking, landscaping, energy, security, luxury) with progress tracking |
| **World Map** | Interactive Leaflet map with 18 cities, demand-colored pins, active event markers, and World Status Widget |
| **World Events** | Dynamic events (Boom, Recession, Disaster, Policy) affect local or global markets with real-time impact |
| **Seasons** | Game runs in 720-month seasons with automatic resets, 50% net worth starting balance, full archive of rankings |
| **Season Leaderboards** | View past season champions, top-20 player rankings, city statistics, and economic data |
| **Player Season History** | Each profile shows the player's rank and stats across all completed seasons |
| **Player Leveling** | XP-based progression system with lifetime stats; earn XP for buying, selling, loans, construction, and more |
| **Month Login Bonus** | Claim $250-$1,000 cash + 10-50 XP every 6 hours from the dashboard |
| **Notifications** | Real-time alerts for offers, trades, construction, and friend requests; toast popups and bell animations; auto-cleanup after 24h |
| **Friends** | Add, accept, decline, and remove friends; view friends' net worth and portfolios |
| **User Profiles** | Customizable avatars, display names, bio, portfolio visibility, season history, level badge, and achievements |
| **Email Verification** | Required before login; verification emails sent on registration; password reset via email |
| **OAuth Login** | Sign in with Google or Discord (web-only; OAuth disabled on mobile) |
| **OAuth Password Set** | OAuth users can set a password to enable email/password login; status endpoint tracks password state |
| **Compact Formatting** | Smart number display: `$1.25M`, `1.5K`, `$9.50` with tooltips for full values |
| **Mobile App** | Native Android/iOS via Capacitor 8 with push notifications, biometric auth, deep linking, offline detection |
| **Rate Limiting** | Per-IP rate limiting on registration, login, and email-sending endpoints |
| **Strong Password Policy** | Enforced 8+ characters with uppercase, lowercase, and number requirements |
| **Legal & Compliance** | Terms of Service, Privacy Policy, Cookie Policy pages with registration acceptance |
| **Onboarding** | 12-step guided tour for new players covering all game features |
| **Admin Panel** | Full control over simulation, users, properties, cities, events, seasons, email testing, manual tick execution; sortable user tables |
| **Backup & Restore** | Admin-only database backup/restore with gzip-compressed exports, upload/download, auto-retention, and full-fidelity restore |
| **Maintenance Mode** | Admin-toggleable maintenance mode with custom message, 503 backend protection, logged-in user banner |
| **Discord Bot** | 26-slash-command CityFlow bot with moderation, verification, tickets, suggestions, game integration, and anti-spam |
| **i18n** | Full English and Hebrew interface with proper RTL support across all components |
| **Dark Mode** | Dark, Light, and System theme toggle |
| **Database-Level Tick Lock** | Prevents duplicate tick execution in multi-replica deployments using MongoDB lock documents |
| **Image Proxy** | Server-side image proxy for OAuth avatars with redirect following and browser-like headers |

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Backend | Node.js 20, Express, Mongoose |
| Database | MongoDB 7 |
| Frontend | React 18, React Router, Zustand, Tailwind CSS, Recharts |
| Mobile | Capacitor 8 (Android + iOS), Firebase Cloud Messaging, Native Biometric |
| Maps | Leaflet + react-leaflet |
| i18n | react-i18next with JSON translation files (EN, HE) |
| Auth | JWT (jsonwebtoken + bcryptjs), Google OAuth, Discord OAuth |
| Scheduling | node-cron (fixed schedule: 00:00, 06:00, 12:00, 18:00) |
| Charts | Recharts (stock/index price history), custom SVG |
| Email | Brevo SMTP with 8 HTML templates |
| Push | Firebase Admin SDK (FCM) |
| SSL | Let's Encrypt via Traefik ACME (TLS-ALPN challenge) |
| CI/CD | GitHub Actions + ArgoCD on K3s |
| Containers | Docker multi-stage builds, GHCR |
| Play Store | gradle-play-publisher (auto-publish on tag push) |

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB 6+ (or Docker)
- npm

### 1. Clone & Install

```bash
git clone <repo-url> cityflow
cd cityflow

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Environment

Copy `backend/.env.example` to `backend/.env` and configure:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/cityflow
JWT_SECRET=your-secret-key-change-in-production
TICK_INTERVAL_MINUTES=60
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-password
FRONTEND_URL=http://localhost:3000
```

### 3. Start MongoDB

```bash
# Option A: Local MongoDB
mongod

# Option B: Docker
docker run -d -p 27017:27017 --name cityflow-mongo mongo:7
```

### 4. Seed & Start

```bash
# From the backend directory
npm run seed          # Populate DB with cities, users, and properties
npm run dev           # Start backend on port 5000

# From the frontend directory (in a separate terminal)
npm run dev           # Start frontend dev server on port 3000
```

The frontend dev server proxies `/api/*` requests to `http://localhost:5000` with the prefix stripped.

### 5. Login

Credentials are set via the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables (see `backend/.env.example`). The seed script creates an admin user with those credentials.

## Mobile Development

### Prerequisites

- Android Studio (for Android)
- Xcode + Apple Developer account (for iOS)
- Java 17+ (JAVA_HOME configured)
- Android SDK (ANDROID_HOME configured)

### Local Development (Android Emulator)

```bash
cd frontend

# Build frontend and sync to Android
npm run build
npx cap sync android

# Open in Android Studio
npx cap open android
```

Run from Android Studio or:
```bash
cd android
./gradlew assembleDebug
```

The app connects to `http://10.0.2.2:5000` (emulator loopback) by default. For real devices, set `VITE_API_URL` environment variable.

### Mobile Features

| Feature | Implementation |
| ------- | -------------- |
| **Platform Detection** | `isNativePlatform()`, `isAndroid()`, `isIOS()`, `isWeb()` |
| **API URL Resolution** | `VITE_API_URL` env > emulator loopback > localhost > production |
| **Token Storage** | Dual-synced: Capacitor Preferences (native) + localStorage (web) |
| **Push Notifications** | FCM (Android) / APNs (iOS) via Firebase; auto-registered on login |
| **Biometric Auth** | Fingerprint/face unlock via `@capgo/capacitor-native-biometric` |
| **Deep Linking** | `cityflow://` URL scheme with Android intent filters |
| **Offline Detection** | Network status listener with fullscreen offline banner |
| **Avatar Proxy** | Client-side `fetch()` + blob URL for external images (Google OAuth) |
| **CSP Headers** | Allows external image loading from HTTPS sources |

### Mobile Build Scripts

| Command | Description |
| ------- | ----------- |
| `npm run mobile:build:android` | Build frontend + sync + debug APK |
| `npm run mobile:build:ios` | Build frontend + sync for iOS |
| `npx cap sync android` | Copy web assets to Android project |
| `npx cap sync ios` | Copy web assets to iOS project |

## Simulation Engine

### Months (Ticks)

The simulation advances in discrete **ticks** (displayed to players as **months**). Each tick:

1. Updates city demand/supply indices
2. Adjusts property prices based on market forces
3. Generates new properties in cities below capacity
4. Deposits rent into owner's collectible pool (24h expiry)
5. Processes loan repayments
6. Advances construction projects
7. Updates property improvements
8. Balances market supply
9. Advances/deactivates events
10. Updates demographics (population, migration, economic conditions)
11. Generates new properties and events
12. Evaluates credit scores (every 10 ticks)
13. Expires uncollected rent pools older than 24 hours
14. Sends rent expiry warnings to users with <1 hour remaining

Ticks run automatically at fixed times: **00:00, 06:00, 12:00, 18:00** (every 6 hours). Manual tick execution from the admin panel does not shift the schedule. A database-level lock prevents duplicate execution across multiple backend replicas.

### Demographics & Population

Each city has a living demographic system:

| Component | Behavior |
| --------- | -------- |
| **Population** | Bounded 10K-15M; driven by birth/death rates + migration |
| **Economic Condition** | 5 states: boom, growth, stable, slowdown, recession |
| **Migration** | 0.2% of population moves between cities based on attractiveness |
| **Demand Index** | Weighted from population (15%), growth (25%), migration (15%), economic (10%) |
| **Economic Transitions** | 8% chance per tick with probabilistic state machine |
| **Avg Rent** | Smoothed calculation from city conditions |

### Seasons

The game is organized into **seasons**, each lasting 720 months (approximately 180 days at 6-hour intervals):

1. When tick #720 is reached, the season automatically ends
2. All game data is archived: player rankings, city statistics, market data, economic stats
3. The world resets: all players start with **50% of net worth** as starting balance, cities and properties are regenerated, tick resets to 0
4. A new season begins with the same rules but a clean slate
5. Admins can also manually end/start seasons from the admin panel

Season 1 is automatically created on server startup if no active season exists.

### Market Dynamics

Each property has a **market regime** that persists for 6-18 months, creating distinct behavioral patterns:

| Regime | Bias | Volatility | Description |
| ------ | ---- | ---------- | ----------- |
| `bull` | +0.5%/month | Low | Steady upward growth |
| `bear` | -0.5%/month | Low | Steady decline |
| `stable` | 0 | Very Low | Sideways, minimal movement |
| `recovery` | +0.3%/month | Medium | Recovering from downturn |
| `correction` | -0.3%/month | Medium | Cooling after overheating |
| `boom` | +0.8%/month | High | Rapid growth with high variance |

Regime selection is weighted by city demand - high demand favors bull/boom, low demand favors bear/correction.

**Price calculation per tick:**
1. **Fair value** = intrinsicValue x demandFactor x supplyFactor x growthFactor
2. **Regime bias** adds directional pressure
3. **Mean reversion** (2.5%) pulls price toward fair value
4. **Momentum** (20% of 5-tick average trend) continues recent direction
5. **Noise** scaled by property volatility and regime
6. **Investment resilience** protects against downturns for invested properties
7. **Extreme zone correction** pulls prices back toward 0.5x-3.0x intrinsic value
8. **Hard cap:** +/-4% per tick absolute

### Property Valuation Engine

Intrinsic value is calculated from:

```
intrinsicValue = (rawIntrinsic + investmentValue) * cityMultiplier
```

- **rawIntrinsic:** base price + upgrades (depreciating) + improvements + quality grade
- **investmentValue:** up to 15% bonus based on total investment vs type-specific caps
- **cityMultiplier:** combines demand, supply, growth, and economic conditions (clamped 0.5-2.5)

Investment caps by type: land 2.0x, house 3.0x, apartment 4.0x, commercial 5.0x base price.

### Rent Calculation

Rent is based on 60% city average rent + 40% property-price-based rent, modified by property rating and investment level. Deposited into the player's collectible pool with a 24-hour expiry timer.

### Property Generation

Each tick, the engine creates new properties for cities that have room:

```
newProperties = population x developmentRate x (demandIndex / 100)
```

New properties are assigned to the bank (`ownerId: null`) at a price of `city.avgPrice x locationMultiplier x marketCondition`, capped by `city.totalCapacity`.

### Events

Random or admin-created events affect cities with weighted probability and impact categories:

| Scope | Effect |
| ----- | ------ |
| `local` | Affects a single random city |
| `global` | Affects all cities (at 50% impact strength) |

**Event templates** include Interest Rate Change, Economic Boom, Recession, City Development Plan, Housing Crisis, Market Correction, Tech Hub Growth, and Natural Disaster.

### Stock Market

The stock market features companies across 8 industries and tradeable index ETFs:

| Component | Details |
| --------- | ------- |
| **Industries** | Technology, Finance, Manufacturing, Retail, Energy, Healthcare, Logistics, Entertainment |
| **Company Sizes** | Startup, Small, Medium, Large, Corporation |
| **Index Types** | World (all companies), Industry (filtered), City (filtered by HQ) |
| **Trading** | Buy/sell company shares; buy/sell index units |
| **Portfolio** | Track holdings with avg buy price, P/L, and total value |

### Banking & Credit Score

| Credit Tier | Score Range | Interest Modifier | Max Debt Multiplier |
| ----------- | ----------- | ----------------- | ------------------- |
| Excellent | 800+ | 0.7x base | 2.0x net worth |
| Very Good | 740+ | 0.8x base | 1.5x net worth |
| Good | 670+ | 0.9x base | 1.0x net worth |
| Fair | 580+ | 1.1x base | 0.6x net worth |
| Poor | 500+ | 1.3x base | 0.3x net worth |
| Very Poor | <500 | 1.6x base | 0.1x net worth |

Credit score is evaluated every 10 ticks based on: on-time payments, completed loans, active loans, debt-to-income ratio, and net worth growth.

**Loan Products:**
- **Personal Loan:** $10K+, 6-24 tick duration, 6% base rate, min 400 credit
- **Mortgage:** $50K+, 24-60 tick duration, 3.5% base rate, min 600 credit
- **Business Loan:** $100K+, 12-48 tick duration, 4.5% base rate, min 650 credit
- **Line of Credit:** $5K+, 6-12 tick duration, 5% base rate, min 700 credit

## API Endpoints

### Health

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Server health check |
| GET | `/ready` | Readiness check (DB connection) |

### Authentication (`/api/auth`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/register` | Create new user (requires `confirmPassword`, `acceptedTerms`, `acceptedPrivacy`); returns message only (no token) |
| POST | `/login` | Login with username or email, receive JWT; requires email verification first |
| GET | `/me` | Get current user profile (lazy-migrates OAuth avatars) |
| GET | `/verify-email` | Verify email address via token (query param `?token=...`) |
| POST | `/resend-verification` | Resend verification email |
| POST | `/forgot-password` | Request password reset email (always returns success to prevent enumeration) |
| POST | `/reset-password` | Reset password with token |
| POST | `/set-password` | Set password for OAuth users (authenticated, rate-limited) |
| GET | `/status` | OAuth status (has password, linked providers) |
| POST | `/unlink` | Unlink OAuth provider |
| GET | `/google` | Initiate Google OAuth login |
| GET | `/google/callback` | Google OAuth callback |
| GET | `/discord` | Initiate Discord OAuth login |
| GET | `/discord/callback` | Discord OAuth callback |

### Cities (`/api/cities`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | List all cities |
| GET | `/:id` | Get city details with properties and active events |

### Properties (`/api/properties`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | List all properties (public, with search/filter/pagination) |
| GET | `/:id` | Get property details |
| GET | `/:id/detail` | Full property detail (with rent earned) |
| POST | `/buy` | Purchase a property |
| POST | `/sell` | Sell owned property back to bank |

All routes except `GET /` require authentication.

### Stock Market (`/api/stocks`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/buy` | Buy company shares |
| POST | `/sell` | Sell company shares |
| GET | `/transactions` | Last 100 stock transactions |

### Companies (`/api/companies`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | List all companies (filterable by industry, city, search, sort) |
| GET | `/portfolio` | User's stock holdings with P/L |
| GET | `/market/overview` | Total market cap, industry breakdown, top gainers/losers |
| GET | `/:id` | Company detail + user holding |
| GET | `/:id/history` | Performance history |
| GET | `/:id/events` | Expansion history |

### Stock Indexes (`/api/indexes`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | List all indexes (filter by type) |
| GET | `/portfolio` | User's index ETF holdings |
| GET | `/market/overview` | Grouped by type, top gainers/losers |
| GET | `/:id` | Index detail + user holding |
| GET | `/:id/history` | Value history |
| GET | `/:id/constituents` | Member companies |
| POST | `/buy` | Buy index units |
| POST | `/sell` | Sell index units |
| GET | `/user/transactions` | User's index transaction history |

### Users (`/api/users`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/me` | Get current user profile |
| GET | `/search` | Search users by username |
| GET | `/:username` | Get user profile with properties, portfolio value, season history |
| PUT | `/settings` | Update display name, bio, portfolio visibility |
| PUT | `/password` | Change password |
| PUT | `/theme` | Update theme preference (light/dark/system) |
| POST | `/avatar` | Upload profile picture |
| PUT | `/language` | Update preferred language |
| PUT | `/onboarding` | Mark onboarding as completed |
| POST | `/push-token` | Register push notification token (max 5, deduped) |
| DELETE | `/push-token` | Remove push notification token |

### Banking (`/api/bank`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/summary` | Balance, net worth, debt, credit score, tier, DTI, max loan |
| GET | `/options` | Available loan products with computed payments |
| GET | `/my` | Active loans for user |
| GET | `/history` | Last 50 loans |
| GET | `/credit-history` | Last 50 credit score changes (with reasons) |
| POST | `/apply` | Apply for a loan |
| POST | `/repay` | Repay (partial or full) |

### Offers (`/api/offers`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/sent` | Offers you've sent |
| GET | `/received` | Offers you've received |
| POST | `/create` | Create an offer on a property (min 70% of market value) |
| POST | `/accept/:id` | Accept an offer |
| POST | `/reject/:id` | Reject an offer |
| POST | `/counter/:id` | Counter an offer |
| POST | `/accept-counter/:id` | Accept a counter-offer |

### Notifications (`/api/notifications`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | List notifications (last 50); auto-deletes read notifications older than 24h |
| GET | `/unread-count` | Count of unread notifications |
| PUT | `/:id/read` | Mark notification as read |
| PUT | `/read-all` | Mark all as read |
| DELETE | `/:id` | Delete a single notification |

### Development (`/api/development`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/options` | Available construction project types |
| GET | `/options/city/:cityId` | Available project types for a specific city |
| POST | `/estimate` | Get cost estimate for a project |
| GET | `/my-land` | List owned land available for construction |
| POST | `/start` | Start a new construction project |
| GET | `/projects` | List user's construction projects |
| GET | `/projects/:id` | Get project details |
| GET | `/my-buildings` | List user's developed buildings |
| GET | `/upgrades/:propertyId` | Available upgrades for a property |
| POST | `/upgrade` | Upgrade a building |
| GET | `/improvements/status/:propertyId` | Get improvement status, progress, and active improvement |
| GET | `/improvements/available/:propertyId` | List available improvements for a property |
| POST | `/improvements/start` | Start an improvement project |
| GET | `/improvements/requirements/:propertyId` | Get 5-item requirements checklist |

### Friends (`/api/friends`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | List friends |
| GET | `/requests` | List pending friend requests |
| GET | `/status/:username` | Get friendship status with a user |
| POST | `/request/:username` | Send friend request |
| POST | `/accept/:requestId` | Accept friend request |
| POST | `/decline/:requestId` | Decline friend request |
| DELETE | `/request/:requestId` | Cancel sent request |
| DELETE | `/:friendId` | Remove friend |

### World (`/api/world`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/status` | Current tick number, last update, next update time |

### Stats (`/api/stats`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | Global stats (player count, property count, city count, transactions, top players, recent activity) |

### Events (`/api/events`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/active` | List all currently active events |

### Month Bonus (`/api/bonus`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/status` | Check if bonus is available and time until next claim |
| POST | `/claim` | Claim $250-$1,000 cash + 10-50 XP (once per 6-hour period) |

### Rent Collection (`/api/rent`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/status` | Get uncollected rent amount, expiry timer, and balance |
| POST | `/collect` | Collect all uncollected rent into balance (24-hour expiry) |

### Seasons (`/api/seasons`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | List completed seasons with rankings (public) |
| GET | `/player/:userId` | Player's season history across all completed seasons |
| GET | `/:id` | Full season detail with archive data |

### Image Proxy

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/image-proxy?url=<url>` | Proxy external images (OAuth avatars) with redirect following |

### Admin (`/api/admin`) - requires `admin` role

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/overview` | Global simulation stats |
| GET | `/ticks` | Tick schedule and status |
| POST | `/tick/run` | Execute 1-50 ticks manually |
| GET | `/users` | List all users |
| PUT | `/users/:id/balance` | Set user balance |
| PUT | `/users/:id/ban` | Toggle user ban |
| GET | `/properties` | List all properties |
| POST | `/properties` | Create a property |
| PUT | `/properties/:id` | Update property fields |
| DELETE | `/properties/:id` | Delete a property |
| PUT | `/cities/:id` | Update city market stats |
| GET | `/events` | List all events |
| POST | `/events` | Create an event |
| PUT | `/events/:id` | Activate/deactivate event |
| GET | `/seasons` | List all seasons with full archive data |
| GET | `/seasons/current` | Get current active season |
| GET | `/seasons/preview` | Preview what a season end would reset |
| POST | `/seasons/create` | Create a new season |
| POST | `/seasons/end` | End current season and start a new one |
| GET | `/construction-projects` | List all construction projects |
| PUT | `/construction-projects/:id` | Update a construction project |
| POST | `/construction-projects/trigger-event` | Trigger a construction event |
| GET | `/development-zones` | List development zones |
| GET | `/maintenance` | Get maintenance mode status |
| POST | `/maintenance/enable` | Enable maintenance mode |
| POST | `/maintenance/disable` | Disable maintenance mode |
| GET | `/backups` | List all backups |
| POST | `/backups` | Create a new backup |
| GET | `/backups/settings` | Get backup settings |
| GET | `/backups/:id` | Get backup details |
| GET | `/backups/:id/download` | Download backup file |
| POST | `/backups/upload` | Upload and restore from backup |
| POST | `/backups/:id/restore` | Restore database from backup |
| DELETE | `/backups/:id` | Delete a backup |
| GET | `/backups/:id/logs` | Get backup logs |
| POST | `/backups/retention` | Run retention cleanup |
| GET | `/email/status` | Get SMTP connection status |
| POST | `/email/test` | Send a test email |

## Database Models

### User

| Field | Type | Description |
| ----- | ---- | ----------- |
| `username` | String | Unique display name |
| `normalizedUsername` | String | Lowercase username (unique index, case-insensitive lookups) |
| `email` | String | Unique email |
| `password` | String | bcrypt hash (not returned) |
| `oauthProviders` | [{provider, providerId}] | Linked OAuth accounts (google, discord) |
| `balance` | Number | Cash balance (default 100,000) |
| `ownedProperties` | [ObjectId] | References to Property |
| `friends` | [ObjectId] | References to User |
| `role` | String | `user` or `admin` |
| `banned` | Boolean | Whether user is banned |
| `theme` | String | `light`, `dark`, or `system` |
| `preferredLanguage` | String | `en` or `he` |
| `avatar` | String | Profile picture URL or local path |
| `displayName` | String | Custom display name |
| `bio` | String | User bio |
| `achievements` | [String] | Earned achievements |
| `acceptedTerms` | Boolean | Terms of Service accepted |
| `acceptedPrivacy` | Boolean | Privacy Policy accepted |
| `emailVerified` | Boolean | Whether email has been verified |
| `verificationToken` | String | Email verification token hash |
| `verificationExpires` | Date | Email verification token expiry |
| `passwordResetToken` | String | Password reset token hash |
| `passwordResetExpires` | Date | Password reset token expiry |
| `lastLoginAt` | Date | Last login timestamp |
| `lastPeriodBonusClaim` | Date | When last month bonus was claimed |
| `uncollectedRent` | Number | Rent waiting to be collected |
| `rentStorageStartedAt` | Date | When current rent pool started accumulating (24h expiry) |
| `level` | Number | Player level (default 1) |
| `xp` | Number | Experience points (default 0) |
| `xpToNextLevel` | Number | XP needed for next level (default 100) |
| `lifetimeStats` | Object | Total transactions, properties, money earned/spent, loans, friends, upgrades, construction, seasons |
| `onboarding.completed` | Boolean | Whether onboarding tour is completed |
| `profileVisibility.portfolio` | Boolean | Show portfolio on public profile |
| `pushTokens` | [{token, platform, createdAt}] | Push notification tokens (max 5) |
| `pushNotificationsEnabled` | Boolean | Push notifications enabled |
| `stockHoldings` | [ObjectId] | References to StockHolding |
| `indexHoldings` | [ObjectId] | References to IndexHolding |

### Property

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | Property name |
| `type` | String | apartment, house, commercial, land |
| `cityId` | ObjectId | Reference to City |
| `ownerId` | ObjectId? | Current owner (null = bank-owned) |
| `basePrice` | Number | Original price |
| `currentPrice` | Number | Current market price |
| `rent` | Number | Rent per tick |
| `condition` | Number | 0-100 condition score |
| `forSale` | Boolean | Listed on marketplace? |
| `lastPurchasePrice` | Number | Price when last purchased |
| `volatility` | Number | 0-1 price volatility factor |
| `regime` | String | bull, bear, stable, recovery, correction, boom |
| `regimeEndTick` | Number | Tick when current regime expires |
| `developmentLevel` | Number | Building development level (0 = raw land) |
| `buildingType` | String | Type of building |
| `occupancy` | Number | 0-100 occupancy percentage |
| `maintenanceCost` | Number | Maintenance cost per tick |
| `improvements` | [Object] | Completed improvements |
| `activeImprovement` | Object? | Currently in-progress improvement |
| `propertyRating` | String | standard, improved, premium, luxury, elite |
| `priceHistory` | [{tick, price}] | Historical price data points |

### City

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | City name |
| `country` | String | Country |
| `coordinates` | {lat, lng} | Map position |
| `population` | Number | Current population |
| `demandIndex` | Number | Demand level (default 1.0) |
| `supplyIndex` | Number | Supply level (default 1.0) |
| `growthRate` | Number | Growth rate per tick |
| `avgPrice` | Number | Average property price |
| `avgRent` | Number | Average rent (default 500) |
| `propertyCount` | Number | Current property count |
| `totalCapacity` | Number | Max properties allowed |
| `developmentRate` | Number | New property generation rate |
| `economicCondition` | String | boom, growth, stable, slowdown, recession |
| `activeEvents` | [Object] | Active events with tickers |
| `demographicsHistory` | [Object] | Historical demographic snapshots (max 120) |

### Company

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | Company name |
| `ticker` | String | Unique stock ticker |
| `industry` | String | 8 industries (technology, finance, etc.) |
| `size` | String | startup, small, medium, large, corporation |
| `sharePrice` | Number | Current share price |
| `marketCap` | Number | Market capitalization |
| `sharesOutstanding` | Number | Total shares |
| `volatility` | Number | Price volatility |
| `dayChangePercent` | Number | Daily price change |
| `totalReturn` | Number | Total return percentage |
| `performance` | [Object] | Historical tick data |

### StockIndex

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | Index name |
| `ticker` | String | Unique ticker |
| `type` | String | world, industry, city |
| `value` | Number | Current index value |
| `constituents` | [ObjectId] | Member companies |
| `performance` | [Object] | Historical tick data |

### Loan

| Field | Type | Description |
| ----- | ---- | ----------- |
| `userId` | ObjectId | Borrower |
| `principal` | Number | Original loan amount |
| `remainingBalance` | Number | Outstanding balance |
| `interestRate` | Number | Interest per tick |
| `durationTicks` | Number | Total loan duration |
| `ticksRemaining` | Number | Ticks left |
| `paymentPerTick` | Number | Scheduled payment per tick |
| `missedPayments` | Number | Consecutive missed payments |
| `active` | Boolean | Loan active? |

### Season

| Field | Type | Description |
| ----- | ---- | ----------- |
| `number` | Number | Season number |
| `name` | String | Season display name |
| `status` | String | `active` or `completed` |
| `startDate` | Date | When season started |
| `endDate` | Date | When season ended |
| `archive.playerRankings` | [Object] | Top 100 players |
| `archive.cityStatistics` | [Object] | City snapshot |
| `archive.marketStatistics` | Object | Market data |
| `archive.economicStatistics` | Object | Economic snapshot |
| `archive.winner` | ObjectId | Season champion |

### Other Models

- **GameState** - Global singleton: tick number, tick lock, maintenance mode
- **PropertyOffer** - Player-to-player offers with counter-offers and 48h expiry
- **Notification** - User notifications with types and auto-cleanup
- **Transaction** - Full transaction history (12 types)
- **Event** - Dynamic market events with scope and impact
- **ConstructionProject** - Building projects with progress tracking
- **StockHolding** / **IndexHolding** - User stock/index portfolios
- **StockTransaction** / **IndexTransaction** - Trading history
- **Backup** - Database backup metadata with logs
- **FriendRequest** - Bidirectional friend system

## Frontend Routes

| Path | Component | Auth Required |
| ---- | --------- | ------------- |
| `/` | LandingPage | No |
| `/map` | MapPage | No |
| `/city/:id` | CityDashboard | No |
| `/property/:id` | PropertyPage | Yes |
| `/dashboard` | PlayerDashboard | Yes |
| `/bank` | BankPage | Yes |
| `/development` | DevelopmentPage | Yes |
| `/project/:id` | ProjectDetailsPage | Yes |
| `/marketplace` | Marketplace | Yes |
| `/stocks` | StockMarket | Yes |
| `/stocks/portfolio` | StockPortfolio | Yes |
| `/stocks/company/:id` | CompanyPage | Yes |
| `/indexes` | IndexMarket | Yes |
| `/indexes/portfolio` | IndexPortfolio | Yes |
| `/indexes/:id` | IndexPage | Yes |
| `/friends` | FriendsPage | Yes |
| `/notifications` | NotificationsPage | Yes |
| `/profile` | UserProfilePage (own) | Yes |
| `/profile/:username` | UserProfilePage (other) | Yes |
| `/settings` | SettingsPage | Yes |
| `/mobile-settings` | MobileSettingsPage | Yes |
| `/seasons` | SeasonHistoryPage | No |
| `/terms` | TermsPage | No |
| `/privacy` | PrivacyPage | No |
| `/cookies` | CookiesPage | No |
| `/forgot-password` | ForgotPasswordPage | Guest only |
| `/reset-password` | ResetPasswordPage | Guest only |
| `/verify-email` | VerifyEmailPage | No |
| `/contributors` | ContributorsPage | No |
| `/oauth/accept-terms` | OAuthAcceptTermsPage | No |
| `/auth/callback` | OAuthCallbackPage | No |
| `/admin` | AdminPage | Admin only |
| `/login` | LoginPage | Guest only |
| `*` | NotFoundPage | No |

## Scripts

### Backend (cd backend/)

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start backend server (port 5000) |
| `npm run seed` | Seed/refresh database with cities and users |
| `npm start` | Start backend in production mode |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Check code formatting with Prettier |
| `npm run format:fix` | Fix code formatting with Prettier |

### Frontend (cd frontend/)

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start Vite dev server (port 3000) |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |
| `npm test` | Run frontend tests |
| `npm run test:watch` | Run frontend tests in watch mode |
| `npm run test:coverage` | Run frontend tests with coverage |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Check code formatting with Prettier |
| `npm run format:fix` | Fix code formatting with Prettier |
| `npm run cap:sync` | Sync Capacitor platforms |
| `npm run cap:android` | Open Android in Android Studio |
| `npm run cap:ios` | Open iOS in Xcode |
| `npm run mobile:build:android` | Build frontend + sync + debug APK |
| `npm run mobile:build:ios` | Build frontend + sync for iOS |

## Deployment

### CI/CD Pipeline

**Web (every push to main):**
- GitHub Actions runs backend tests
- Builds Docker images for backend, frontend, and Discord bot
- Pushes to GHCR
- Updates Kubernetes manifests with commit SHA
- Pushes to trigger ArgoCD sync

**Mobile (on tag push `v*`):**
- Builds debug APK (uploaded as artifact)
- Decodes keystore and Play service account from GitHub Secrets
- Builds signed release AAB
- Auto-publishes to Google Play Store (Internal Testing track)
- Creates GitHub Release with APK, AAB, and iOS IPA

**GitHub Actions Workflows:**
| Workflow | Trigger | Description |
| -------- | ------- | ----------- |
| `ci.yml` | Push to main, PRs | Run tests, lint, typecheck |
| `deploy.yml` | Push to main | Docker build, push to GHCR, update K8s manifests |
| `mobile.yml` | Push to main, tag `v*` | Build APK/AAB, publish to Play Store |

### Play Store Publishing

Automated via `gradle-play-publisher` plugin. Required GitHub Secrets:

| Secret | Description |
| ------ | ----------- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play service account JSON |

### Kubernetes (K3s)

| Component | Description |
| --------- | ----------- |
| Namespace | `cityflow` |
| MongoDB | StatefulSet with persistent storage |
| Backend | 2-replica Deployment with database-level tick lock |
| Frontend | 2-replica Deployment with nginx serving static files |
| Discord Bot | Single-replica Deployment with NetworkPolicy (egress only) |
| Backup PVC | 5Gi PersistentVolumeClaim for backup storage |
| Ingress | Traefik with Let's Encrypt TLS (TLS-ALPN challenge) |
| SSL | Auto-renewed Let's Encrypt certificate for `cityflow.sizops.co.il` |

### Docker

All services use multi-stage Docker builds:
- **Builder stage:** Installs dependencies and builds assets using `--platform=$BUILDPLATFORM`
- **Production stage:** Minimal image with only runtime dependencies, non-root user, tini init process

### Email Infrastructure

Email is sent via **Brevo SMTP** (`smtp-relay.brevo.com:587`) from the `sizops.co.il` domain:
- Registration, email verification, password reset
- 8 HTML email templates
- Rate limiting on all email-sending endpoints

### Backup & Restore

Managed from the Admin Panel. Uses native MongoDB driver with gzip compression.
- Every collection exported as EJSON lines
- Automatic retention keeps last 5 backups
- Full-fidelity restore with admin preservation

## Compact Number Formatting

| Function | Input | Output | Example |
| -------- | ----- | ------ | ------- |
| `formatMoney(n)` | Number | Compact dollar | `$1.5K`, `$250` |
| `formatMoneyExact(n)` | Number | Full dollar | `$1,500` |
| `formatPrice(n)` | Number | Compact or 2 decimal | `$9.50`, `$1.5K` |
| `formatCompact(n)` | Number | Compact integer | `1.5K`, `2M` |
| `formatCount(n)` | Number | Compact or locale | `500`, `1.5K` |
| `formatPercent(n)` | Decimal | Percentage | `5.0%` |
| `formatDiff(n)` | Number | Signed compact | `+$500`, `-$1.5K` |

## Community

### Discord

Join the official CityFlow Discord server:
**[Join CityFlow Discord](https://discord.gg/cityflow)**

- Verification system with role assignment
- Ticket system for support, bug reports, and partnerships
- Suggestions board with community voting
- Moderation tools (warnings, mutes, kicks, bans, auto-spam detection)
- Game integration - view profiles, leaderboards, and stats from Discord

### Contributing

This project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request. For security vulnerabilities, please see our [Security Policy](SECURITY.md).

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

By contributing to this project, you agree that your contributions will be licensed under the same license.
