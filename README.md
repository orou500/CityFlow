<img width="1536" height="1024" alt="logo-text" src="https://github.com/user-attachments/assets/590d9e0b-4b9c-44b9-84a2-353450cfb036" />

<img width="2560" height="1326" alt="Screenshot 2026-07-10 012228" src="https://github.com/user-attachments/assets/e48b6b53-2ef4-42a1-bcb3-9bf3672461fa" />

# CityFlow – Global Real Estate Simulation

A full-stack real-time multiplayer simulation game where players buy, sell, develop, and manage properties across a dynamic global market. Features a living economy with demographics, a stock market, banking with credit scores, an interactive world map, and cooperative real estate companies. Built with Node.js, Express, MongoDB, Redis, and React. Available as a web app and native Android/iOS via Capacitor. Deployed on Kubernetes with ArgoCD, Let's Encrypt SSL, and automated CI/CD.

**[See CityFlow on itch.io](https://orou500.itch.io/cityflow)** · **[Join CityFlow Discord](https://discord.gg/vTav6WYQdQ)**

## Architecture

```
cityflow/
├── backend/
│   └── src/
│       ├── config/          # DB connection, env vars, Redis client, scheduler, demographics config, property risk config
│       ├── engine/          # Simulation logic (tick, market, season reset, property generation, valuation, credit score, company processing, city contracts, treasury investments, property risk, auction processing)
│       ├── middleware/       # JWT auth, admin guards, Redis rate limiter, maintenance
│       ├── models/          # Mongoose schemas (User, Property, City, Season, GameState, Company, RealEstateCompany, etc.)
│       ├── routes/          # REST API endpoints (34 route files)
│       ├── services/        # Email (Brevo SMTP), push notifications (Firebase), avatar download, HTML templates
│       ├── socket/          # Socket.IO server, Redis adapter, event constants, room management
│       ├── test/            # Test setup, helpers, and MongoDB Memory Server config
│       ├── utils/           # Redis cache, cache keys, cache invalidation, idempotent lock, job queue (BullMQ),
│       │                   # job processors, notification queue, presence tracking, pub/sub, delayed jobs, analytics
│       ├── seed.js          # Database initializer
│       └── index.js         # Express + Socket.IO + job processor entry point
├── frontend/
│   └── src/
│       ├── components/      # Reusable UI (Navbar, Sidebar, WorldMap, OnboardingWrapper, Toast, etc.)
│       ├── hooks/           # Custom hooks (useSocket, useCompanySocket, useSocketEvent, useNativeAvatarUrl)
│       ├── i18n/            # Internationalization (en, he)
│       ├── pages/           # 46 route-level page components
│       ├── store/           # Zustand state management (auth, game, company, leaderboard, audio)
│       └── utils/           # Socket.IO client, format utilities, Capacitor platform utils, push/biometric/network/deep link helpers
├── discord-bot/             # CityFlow Discord bot (Node.js, Discord.js 14, MongoDB, 31 slash commands)
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

| Feature                        | Description                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Market**             | City demand/supply indices fluctuate each tick, driving property price changes with 6 market regimes (bull, bear, stable, recovery, correction, boom). Property risk score (0-100) adds volatility and growth potential variability                                                                                                                                                         |
| **Property Risk System**       | Dynamic risk scoring per property based on location, city economy, demand, supply, condition, and maintenance. 5 risk levels (Very Low to Very High) with proportional growth multipliers. Hazard events: hurricanes, floods, earthquakes, wildfires, storms cause condition damage and value drops. Risk dashboard with factor breakdown, historical tracking, and reduction tips          |
| **Living Demographics**        | Population birth/death rates, migration, economic conditions (boom/growth/stable/slowdown/recession) affecting demand, rent, and growth                                                                                                                                                                                                                                                     |
| **Property Generation**        | New properties are automatically created each tick based on population, development rate, and demand                                                                                                                                                                                                                                                                                        |
| **Property Valuation Engine**  | Intrinsic value calculated from upgrades, improvements, quality, investments, and city fundamentals; investment caps by property type                                                                                                                                                                                                                                                       |
| **Anti-Monopoly**              | No player can own more than 5% of a city's total properties                                                                                                                                                                                                                                                                                                                                 |
| **Rent Collection Pool**       | Rent is deposited into a collectible pool based on city avg rent and property rating; 24-hour timer; players must manually collect or forfeit                                                                                                                                                                                                                                               |
| **Maintenance Costs**          | Ongoing costs based on improvement level: none (0%), basic (10%), standard (25%), premium (40%) of rent income                                                                                                                                                                                                                                                                              |
| **Banking & Credit Score**     | 300-850 credit score system with 6 tiers; 4 loan products (personal, mortgage, business, line of credit); interest rates adjusted by credit tier                                                                                                                                                                                                                                            |
| **Stock Market**               | Buy/sell shares in companies across 8 industries; real-time price tracking with performance history                                                                                                                                                                                                                                                                                         |
| **Stock Indexes**              | Trade index ETFs (world, industry, city types); diversified investment vehicles                                                                                                                                                                                                                                                                                                             |
| **Player-to-Player Offers**    | Negotiate property purchases via offers, counter-offers, accept/reject (min 70% of market value)                                                                                                                                                                                                                                                                                            |
| **Real Estate Companies**      | Form companies with friends: share properties, treasury, loans, and revenue; role-based access (CEO/Director/Officer/Member/Recruit); shares system; application system; level progression with XP; 24 milestones; company leaderboards                                                                                                                                                     |
| **City Contracts**             | Companies take on city contracts (renovation, housing, infrastructure); member vote to approve; earn reward + XP + reputation on completion                                                                                                                                                                                                                                                 |
| **Company Investments**        | Invest company treasury in bonds, REITs, and funds; small investments instant, large require member vote; maturity-based returns with economic modifiers                                                                                                                                                                                                                                    |
| **Development Requests**       | Propose upgrades, improvements, or construction for company properties; member vote to approve; auto-executed on threshold                                                                                                                                                                                                                                                                  |
| **Account Deletion**           | Self-service account deletion with 24-hour restore window; admin panel restore/permanent-delete controls                                                                                                                                                                                                                                                                                    |
| **Construction & Development** | Buy land, build from 8 project types (residential, commercial, hospitality), upgrade buildings with 4 upgrade types                                                                                                                                                                                                                                                                         |
| **Property Improvements**      | 7 improvement types (renovation, interior, parking, landscaping, energy, security, luxury) with progress tracking                                                                                                                                                                                                                                                                           |
| **Property Auctions**          | Competitive bidding system with bank-generated and player-listed properties; live Socket.IO activity feed; anti-sniping protection; 6-tab dashboard with featured, analytics, watchlist, and history; scaled bank generation based on player count                                                                                                                                            |
| **Auction Watchlist**          | Follow auctions without bidding; notifications for outbid, reserve reached, ending soon, extension, and completion; persistent across sessions                                                                                                                                                                                                                                               |
| **Seller Reputation**          | Lifetime auction stats per player: auctions won/sold, total volume, win rate, highest bid, average profit; updated automatically on auction completion                                                                                                                                                                                                                                        |
| **Company Auction Bidding**    | Real Estate Companies can participate in auctions via governance votes; members propose → vote → treasury places bid if approved; follows same voting system as loans and property purchases                                                                                                                                                                                                  |
| **World Map**                  | Interactive Leaflet map with 18 cities, demand-colored pins, active event markers, and World Status Widget                                                                                                                                                                                                                                                                                  |
| **World Events**               | Dynamic events (Boom, Recession, Disaster, Policy) affect local or global markets with real-time impact                                                                                                                                                                                                                                                                                     |
| **Seasons**                    | Game runs in 720-month seasons with automatic resets, 50% net worth starting balance, full archive of rankings                                                                                                                                                                                                                                                                              |
| **Season Leaderboards**        | View past season champions, top-20 player rankings, city statistics, and economic data                                                                                                                                                                                                                                                                                                      |
| **Company Leaderboards**       | 5 company categories: Net Worth, Properties, Income, Reputation, Growth; tracked alongside player rankings                                                                                                                                                                                                                                                                                  |
| **Player Season History**      | Each profile shows the player's rank and stats across all completed seasons                                                                                                                                                                                                                                                                                                                 |
| **Player Leveling**            | XP-based progression system with lifetime stats; earn XP for buying, selling, loans, construction, and more                                                                                                                                                                                                                                                                                 |
| **Month Login Bonus**          | Claim $250-$1,000 cash + 10-50 XP every 6 hours from the dashboard                                                                                                                                                                                                                                                                                                                          |
| **Notifications**              | Real-time alerts for offers, trades, construction, and friend requests; toast popups and bell animations; auto-cleanup after 24h                                                                                                                                                                                                                                                            |
| **Friends**                    | Add, accept, decline, and remove friends; view friends' net worth and portfolios                                                                                                                                                                                                                                                                                                            |
| **User Profiles**              | Customizable avatars, display names, bio, portfolio visibility, season history, level badge, and achievements                                                                                                                                                                                                                                                                               |
| **Email Verification**         | Required before login; verification emails sent on registration; password reset via email                                                                                                                                                                                                                                                                                                   |
| **OAuth Login**                | Sign in with Google or Discord (web-only; OAuth disabled on mobile)                                                                                                                                                                                                                                                                                                                         |
| **OAuth Password Set**         | OAuth users can set a password to enable email/password login; status endpoint tracks password state                                                                                                                                                                                                                                                                                        |
| **Compact Formatting**         | Smart number display: `$1.25M`, `1.5K`, `$9.50` with tooltips for full values                                                                                                                                                                                                                                                                                                               |
| **Mobile App**                 | Native Android/iOS via Capacitor 8 with push notifications, biometric auth, deep linking, offline detection                                                                                                                                                                                                                                                                                 |
| **Rate Limiting**              | Per-IP rate limiting on registration, login, and email-sending endpoints                                                                                                                                                                                                                                                                                                                    |
| **Strong Password Policy**     | Enforced 8+ characters with uppercase, lowercase, and number requirements                                                                                                                                                                                                                                                                                                                   |
| **Legal & Compliance**         | Terms of Service, Privacy Policy, Cookie Policy pages with registration acceptance                                                                                                                                                                                                                                                                                                          |
| **Onboarding**                 | 13-step guided tour for new players covering all game features (world map, marketplace, property details, dashboard, bank, rent, development, leveling, events, seasons, friends, auctions)                                                                                                                                                                                                    |
| **Marketplace Size Filter**    | Filter properties by minimum/maximum size (sq ft) on the marketplace with URL-synced query parameters                                                                                                                                                                                                                                                                                        |
| **Missions**                   | Goal-oriented missions with 22 condition types (buying, rent, auctions, development, company activity); automatic progress tracking from gameplay actions and engine ticks; claimable rewards with atomic completed→claimed transitions preventing double-claims                                                                                                                               |
| **Career Progression**         | Persistent career page tracking lifetime stats, achievements, and leveling; all gameplay and engine events flow through a unified XP pipeline with `career:updated` socket events                                                                                                                                                                                                              |
| **District Control**           | Neighborhood districts with player influence scores, rankings, and territory competition                                                                                                                                                                                                                                                                                                    |
| **Market Intelligence**        | Advanced market analysis page with trends, demand heatmaps, and investment signals                                                                                                                                                                                                                                                                                                         |
| **Competitive Events**         | Time-limited multiplayer events with objectives, rankings, and rewards                                                                                                                                                                                                                                                                                                                      |
| **Donations & Supporter Tiers**| Support the project; supporter recognition page and tiers                                                                                                                                                                                                                                                                                                                                  |
| **Admin Panel**                | Full control over simulation, users, properties, cities, events, seasons, email testing, manual tick execution; sortable user tables                                                                                                                                                                                                                                                        |
| **Backup & Restore**           | Admin-only database backup/restore with gzip-compressed exports, upload/download, auto-retention, and full-fidelity restore                                                                                                                                                                                                                                                                 |
| **Maintenance Mode**           | Admin-toggleable maintenance mode with custom message, 503 backend protection, logged-in user banner                                                                                                                                                                                                                                                                                        |
| **Discord Bot**                | 31-slash-command CityFlow bot with moderation, verification, tickets, suggestions, game integration, and anti-spam                                                                                                                                                                                                                                                                          |
| **Discord Community**          | Official CityFlow Discord server with roles, channels, and bot integration                                                                                                                                                                                                                                                                                                                  |
| **In-Game Music Player**       | Built-in audio player in the sidebar with play/pause, next/prev, volume control, and auto-start toggle; supports MP3, WAV, OGG, FLAC, and M4A files                                                                                                                                                                                                                                         |
| **i18n**                       | Full English and Hebrew interface with proper RTL support across all components                                                                                                                                                                                                                                                                                                             |
| **Dark Mode**                  | Dark, Light, and System theme toggle                                                                                                                                                                                                                                                                                                                                                        |
| **Redis Caching**              | Redis-backed cache layer with automatic invalidation on all data mutations; hit-rate tracking via /metrics                                                                                                                                                                                                                                                                                  |
| **Socket.IO Real-Time**        | Redis-adapter-powered Socket.IO for instant push updates; company rooms with member presence tracking                                                                                                                                                                                                                                                                                       |
| **BullMQ Delayed Jobs**        | Event-driven job processing for vote expirations, contract completions, investment maturities, and offer expirations — no tick polling needed                                                                                                                                                                                                                                               |
| **Redis Presence System**      | Real-time online/idle/offline tracking with 20-second heartbeat; batch user status queries                                                                                                                                                                                                                                                                                                  |
| **Redis Pub/Sub**              | 14 channels for broadcasting game events across backend instances (tick, market, property, company, contract, investment, loan, development)                                                                                                                                                                                                                                                |
| **Redis Distributed Lock**     | Multiple backend replicas safely coordinate tick execution via Redis SET NX EX, falling back to MongoDB when Redis is unavailable                                                                                                                                                                                                                                                           |
| **Redis Notification Queue**   | Async notification processing via Redis lists, drained every minute; 22 notification sites switched from direct DB writes                                                                                                                                                                                                                                                                   |
| **Live Notifications**         | New notifications, votes, treasury changes, contract completions, and investment maturities pushed instantly via Socket.IO to connected clients                                                                                                                                                                                                                                             |
| **Property Risk System**       | Every property has a dynamic risk score (0-100) based on location, city economy, demand, condition, and maintenance. Higher risk = higher volatility and growth potential. Properties face hazard events (hurricanes, floods, earthquakes, wildfires, storms) with damage, recovery, and risk history tracking. Risk dashboard on property pages shows factor breakdown and reduction tips. |
| **Image Proxy**                | Server-side image proxy for OAuth avatars with redirect following and browser-like headers                                                                                                                                                                                                                                                                                                  |

## Tech Stack

| Layer         | Technology                                                              |
| ------------- | ----------------------------------------------------------------------- |
| Backend       | Node.js 20, Express, Mongoose                                           |
| Database      | MongoDB 7                                                               |
| Cache & Queue | Redis 7 (ioredis + BullMQ for delayed jobs)                             |
| Real-Time     | Socket.IO + @socket.io/redis-adapter                                    |
| Frontend      | React 18, React Router, Zustand, Tailwind CSS, Recharts                 |
| Mobile        | Capacitor 8 (Android + iOS), Firebase Cloud Messaging, Native Biometric |
| Maps          | Leaflet + react-leaflet                                                 |
| i18n          | react-i18next with JSON translation files (EN, HE)                      |
| Auth          | JWT (jsonwebtoken + bcryptjs), Google OAuth, Discord OAuth              |
| Scheduling    | node-cron + BullMQ delayed jobs                                         |
| Charts        | Recharts (stock/index price history), custom SVG                        |
| Email         | Brevo SMTP with 8 HTML templates                                        |
| Push          | Firebase Admin SDK (FCM)                                                |
| SSL           | Let's Encrypt via Traefik ACME (TLS-ALPN challenge)                     |
| CI/CD         | GitHub Actions + ArgoCD on K3s                                          |
| Containers    | Docker multi-stage builds, GHCR                                         |
| Play Store    | gradle-play-publisher (auto-publish on tag push)                        |

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB 6+ (or Docker)
- Redis 7+ (or Docker)
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

### 3. Start Infrastructure

```bash
# Option A: Docker Compose (recommended)
docker compose up -d redis mongodb

# Option B: Individual containers
docker run -d -p 6379:6379 --name cityflow-redis redis:7-alpine
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

### API URL Resolution

| Build | Platform | URL |
|-------|----------|-----|
| Development (`npm run dev`) | Web (Vite proxy) | `/api` |
| Production (`npm run build`) | Web (Nginx reverse proxy) | `/api` |
| Dev + Android emulator | Native | `http://10.0.2.2:5000` |
| Dev + iOS simulator | Native | `http://localhost:5000` |
| **Production APK** | **Native (Android/iOS)** | **`https://cityflow.sizops.co.il/api`** |

Override via `VITE_API_URL` environment variable at build time for any platform.

### Mobile Features

| Feature                | Implementation                                                      |
| ---------------------- | ------------------------------------------------------------------- |
| **Platform Detection** | `isNativePlatform()`, `isAndroid()`, `isIOS()`, `isWeb()`           |
| **API URL Resolution** | `VITE_API_URL` env > dev native URLs > production API fallback (Android production APK auto-connects to `cityflow.sizops.co.il`)     |
| **Token Storage**      | Dual-synced: Capacitor Preferences (native) + localStorage (web)    |
| **Push Notifications** | FCM (Android) / APNs (iOS) via Firebase; auto-registered on login   |
| **Biometric Auth**     | Fingerprint/face unlock via `@capgo/capacitor-native-biometric`     |
| **Deep Linking**       | `cityflow://` URL scheme with Android intent filters                |
| **Offline Detection**  | Network status listener with fullscreen offline banner              |
| **Avatar Proxy**       | Client-side `fetch()` + blob URL for external images (Google OAuth) |
| **CSP Headers**        | Allows external image loading from HTTPS sources                    |

### Mobile Build Scripts

| Command                        | Description                        |
| ------------------------------ | ---------------------------------- |
| `npm run mobile:build:android` | Build frontend + sync + debug APK  |
| `npm run mobile:build:ios`     | Build frontend + sync for iOS      |
| `npx cap sync android`         | Copy web assets to Android project |
| `npx cap sync ios`             | Copy web assets to iOS project     |

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
15. Processes company rent collection (deposits to company treasuries)
16. Processes company loan repayments
17. Processes company loan requests (CEO auto-vote after 4 ticks, expiry after 8)
18. Processes company development requests (CEO auto-vote after 4 ticks)
19. Evaluates company level-ups and reputation gains
20. Prunes treasury transactions older than 4 ticks
21. Generates new city contracts for eligible companies
22. Processes active city contracts (progress, rewards, failures)
23. Processes city contract proposals (CEO auto-vote, expiry)
24. Expires unclaimed city contracts
25. Generates investment opportunities
26. Processes company investments (maturity returns, proposal resolution)
27. Computes leaderboards
28. Manages competitive events lifecycle
29. Processes property risks — recalculates risk scores, triggers hazard events (hurricanes, floods, earthquakes, wildfires, storms), applies condition damage and value drops, adjusts volatility based on risk level
30. Hard-deletes expired user accounts (>24h grace period)
31. Season reset (at tick 720)

Ticks run automatically at fixed times: **00:00, 06:00, 12:00, 18:00** (every 6 hours). Manual tick execution from the admin panel does not shift the schedule. A Redis-backed distributed lock prevents duplicate execution across multiple backend replicas, falling back to MongoDB when Redis is unavailable.

**Event-Driven Jobs (BullMQ):** Vote expirations, contract completions, and investment maturities use **BullMQ delayed jobs** instead of tick polling. When a vote is created, a delayed job fires exactly 8 ticks later to expire it. When a contract starts, a job fires at its duration to complete it. This eliminates the need to check every single pending item during each tick.

### Demographics & Population

Each city has a living demographic system:

| Component                | Behavior                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- |
| **Population**           | Bounded 10K-15M; driven by birth/death rates + migration                      |
| **Economic Condition**   | 5 states: boom, growth, stable, slowdown, recession                           |
| **Migration**            | 0.2% of population moves between cities based on attractiveness               |
| **Demand Index**         | Weighted from population (15%), growth (25%), migration (15%), economic (10%) |
| **Economic Transitions** | 8% chance per tick with probabilistic state machine                           |
| **Avg Rent**             | Smoothed calculation from city conditions                                     |

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

| Regime       | Bias        | Volatility | Description                     |
| ------------ | ----------- | ---------- | ------------------------------- |
| `bull`       | +0.5%/month | Low        | Steady upward growth            |
| `bear`       | -0.5%/month | Low        | Steady decline                  |
| `stable`     | 0           | Very Low   | Sideways, minimal movement      |
| `recovery`   | +0.3%/month | Medium     | Recovering from downturn        |
| `correction` | -0.3%/month | Medium     | Cooling after overheating       |
| `boom`       | +0.8%/month | High       | Rapid growth with high variance |

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

| Scope    | Effect                                      |
| -------- | ------------------------------------------- |
| `local`  | Affects a single random city                |
| `global` | Affects all cities (at 50% impact strength) |

**Event templates** include Interest Rate Change, Economic Boom, Recession, City Development Plan, Housing Crisis, Market Correction, Tech Hub Growth, and Natural Disaster.

### Stock Market

The stock market features companies across 8 industries and tradeable index ETFs:

| Component         | Details                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| **Industries**    | Technology, Finance, Manufacturing, Retail, Energy, Healthcare, Logistics, Entertainment |
| **Company Sizes** | Startup, Small, Medium, Large, Corporation                                               |
| **Index Types**   | World (all companies), Industry (filtered), City (filtered by HQ)                        |
| **Trading**       | Buy/sell company shares; buy/sell index units                                            |
| **Portfolio**     | Track holdings with avg buy price, P/L, and total value                                  |

### Company Progression

Companies earn XP through activities and level up (1-50), unlocking benefits:

| Activity               | XP Formula                     |
| ---------------------- | ------------------------------ |
| Property purchased     | `max(50, price × 0.0005)`      |
| Property sold          | `max(25, price × 0.0003)`      |
| Development executed   | `max(40, cost × 0.005)`        |
| Construction completed | `max(60, totalCost × 0.003)`   |
| Contract completed     | Contract's xpReward or 100     |
| Loan repaid            | `max(20, principal × 0.0005)`  |
| Vote completed         | 3                              |
| Rent collected         | `max(1, rentIncome × 0.00005)` |
| Investment matured     | `max(15, profit × 0.002)`      |

**Level Benefits (examples):**

| Level | Max Members | Max Loan Amount | Key Unlock            |
| ----- | ----------- | --------------- | --------------------- |
| 1     | 10          | $7M             | —                     |
| 2     | 11          | $9M             | Property management   |
| 3     | 12          | $11M            | City contracts        |
| 4     | 13          | $13M            | Direct loans          |
| 5     | 15          | $15M            | Investments, projects |
| 10    | 21          | $25M            | Premium contracts     |
| 15    | 26          | $35M            | Advanced governance   |
| 25    | 38          | $55M            | Global reputation     |
| 50    | 50          | $105M           | Maximum               |

**24 Milestones** with tiered rewards (XP, reputation, treasury bonus): Property Empire, Rental Tycoon, Corporate Giant, Master Developer, Government Partner, and more.

Level-up rewards include treasury bonus, XP bonus, and reputation gains. Level is derived from total accumulated XP via `getLevelFromTotalXP()`.

### Banking & Credit Score

| Credit Tier | Score Range | Interest Modifier | Max Debt Multiplier |
| ----------- | ----------- | ----------------- | ------------------- |
| Excellent   | 800+        | 0.7x base         | 2.0x net worth      |
| Very Good   | 740+        | 0.8x base         | 1.5x net worth      |
| Good        | 670+        | 0.9x base         | 1.0x net worth      |
| Fair        | 580+        | 1.1x base         | 0.6x net worth      |
| Poor        | 500+        | 1.3x base         | 0.3x net worth      |
| Very Poor   | <500        | 1.6x base         | 0.1x net worth      |

Credit score is evaluated every 10 ticks based on: on-time payments, completed loans, active loans, debt-to-income ratio, and net worth growth.

**Loan Products:**

- **Personal Loan:** $10K+, 6-24 tick duration, 6% base rate, min 400 credit
- **Mortgage:** $50K+, 24-60 tick duration, 3.5% base rate, min 600 credit
- **Business Loan:** $100K+, 12-48 tick duration, 4.5% base rate, min 650 credit
- **Line of Credit:** $5K+, 6-12 tick duration, 5% base rate, min 700 credit

## API Endpoints

### Health & Metrics

| Method | Path           | Description                                             |
| ------ | -------------- | ------------------------------------------------------- |
| GET    | `/health`      | Server health check                                     |
| GET    | `/ready`       | Readiness check (DB, Redis, Socket.IO connection)       |
| GET    | `/metrics`     | Cache hit rate, Pub/Sub stats, BullMQ queues, WebSocket |
| GET    | `/maintenance` | Maintenance mode status                                 |

### Authentication (`/api/auth`)

| Method | Path                   | Description                                                                                                       |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| POST   | `/register`            | Create new user (requires `confirmPassword`, `acceptedTerms`, `acceptedPrivacy`); returns message only (no token) |
| POST   | `/login`               | Login with username or email, receive JWT; requires email verification first                                      |
| GET    | `/me`                  | Get current user profile (lazy-migrates OAuth avatars)                                                            |
| GET    | `/verify-email`        | Verify email address via token (query param `?token=...`)                                                         |
| POST   | `/resend-verification` | Resend verification email                                                                                         |
| POST   | `/forgot-password`     | Request password reset email (always returns success to prevent enumeration)                                      |
| POST   | `/reset-password`      | Reset password with token                                                                                         |
| POST   | `/set-password`        | Set password for OAuth users (authenticated, rate-limited)                                                        |
| GET    | `/status`              | OAuth status (has password, linked providers)                                                                     |
| POST   | `/unlink`              | Unlink OAuth provider                                                                                             |
| GET    | `/google`              | Initiate Google OAuth login                                                                                       |
| GET    | `/google/callback`     | Google OAuth callback                                                                                             |
| GET    | `/discord`             | Initiate Discord OAuth login                                                                                      |
| GET    | `/discord/callback`    | Discord OAuth callback                                                                                            |

### Cities (`/api/cities`)

| Method | Path   | Description                                        |
| ------ | ------ | -------------------------------------------------- |
| GET    | `/`    | List all cities                                    |
| GET    | `/:id` | Get city details with properties and active events |

### Properties (`/api/properties`)

| Method | Path          | Description                                                 |
| ------ | ------------- | ----------------------------------------------------------- |
| GET    | `/`           | List all properties (public, with search/filter/pagination) |
| GET    | `/:id`        | Get property details                                        |
| GET    | `/:id/detail` | Full property detail (with rent earned)                     |
| POST   | `/buy`        | Purchase a property                                         |
| POST   | `/sell`       | Sell owned property back to bank                            |

All routes except `GET /` require authentication.

### Stock Market (`/api/stocks`)

| Method | Path            | Description                 |
| ------ | --------------- | --------------------------- |
| POST   | `/buy`          | Buy company shares          |
| POST   | `/sell`         | Sell company shares         |
| GET    | `/transactions` | Last 100 stock transactions |

### Companies (`/api/companies`)

| Method | Path               | Description                                                     |
| ------ | ------------------ | --------------------------------------------------------------- |
| GET    | `/`                | List all companies (filterable by industry, city, search, sort) |
| GET    | `/portfolio`       | User's stock holdings with P/L                                  |
| GET    | `/market/overview` | Total market cap, industry breakdown, top gainers/losers        |
| GET    | `/:id`             | Company detail + user holding                                   |
| GET    | `/:id/history`     | Performance history                                             |
| GET    | `/:id/events`      | Expansion history                                               |

### Real Estate Companies (`/api/real-estate-companies`)

| Method | Path                                          | Description                                              |
| ------ | --------------------------------------------- | -------------------------------------------------------- |
| GET    | `/`                                           | List all companies (search, sort, pagination)            |
| GET    | `/my`                                         | User's companies                                         |
| GET    | `/invitations`                                | Pending invitations                                      |
| POST   | `/`                                           | Create a company ($500K fee)                             |
| GET    | `/:id`                                        | Company detail                                           |
| PUT    | `/:id`                                        | Update company settings (CEO only)                       |
| POST   | `/:id/invite`                                 | Invite a member                                          |
| POST   | `/:id/invite/:invitationId/accept`            | Accept invitation                                        |
| POST   | `/:id/invite/:invitationId/decline`           | Decline invitation                                       |
| POST   | `/:id/leave`                                  | Leave company                                            |
| DELETE | `/:id/members/:userId`                        | Remove a member                                          |
| PUT    | `/:id/members/:userId/role`                   | Change member role (CEO only)                            |
| POST   | `/:id/treasury/deposit`                       | Deposit funds to treasury                                |
| POST   | `/:id/treasury/withdraw`                      | Withdraw funds from treasury (directors+)                |
| GET    | `/:id/treasury/transactions`                  | Treasury transaction history (paginated, 4-tick prune)   |
| POST   | `/:id/properties/purchase`                    | Purchase a property for the company                      |
| POST   | `/:id/properties/:propertyId/sell`            | Sell a company property                                  |
| GET    | `/:id/properties`                             | List company properties                                  |
| POST   | `/:id/apply`                                  | Apply to join a company                                  |
| GET    | `/:id/applications`                           | List applications (officers+)                            |
| POST   | `/:id/applications/:appId/approve`            | Approve an application (officers+)                       |
| POST   | `/:id/applications/:appId/reject`             | Reject an application (officers+)                        |
| POST   | `/:id/applications/:appId/cancel`             | Cancel own application                                   |
| POST   | `/:id/loan-requests`                          | Create a loan request (member vote)                      |
| GET    | `/:id/loan-requests`                          | List all loan requests                                   |
| POST   | `/:id/loan-requests/:reqId/vote`              | Vote on a loan request                                   |
| POST   | `/:id/loan-requests/:reqId/execute`           | Execute an approved loan request (CEO only)              |
| GET    | `/:id/loan-options`                           | Get available loan products (CEO only)                   |
| POST   | `/:id/direct-loan`                            | Take a direct loan (CEO only, no vote)                   |
| POST   | `/:id/property-purchase-requests`             | Propose a property purchase (member vote)                |
| GET    | `/:id/property-purchase-requests`             | List property purchase requests                          |
| POST   | `/:id/property-purchase-requests/:reqId/vote` | Vote on property purchase request                        |
| POST   | `/:id/development-requests`                   | Propose a development (upgrade/improvement/construction) |
| GET    | `/:id/development-requests`                   | List development requests                                |
| POST   | `/:id/development-requests/:reqId/vote`       | Vote on a development request                            |
| GET    | `/:id/investments/products`                   | Get available investment products                        |
| GET    | `/:id/investments`                            | List all company investments                             |
| GET    | `/:id/investments/performance`                | Get investment performance summary                       |
| POST   | `/:id/investments`                            | Create an investment (small=instant, large=voted)        |
| POST   | `/:id/investments/:invId/vote`                | Vote on a large investment proposal                      |
| POST   | `/:id/investments/:invId/cancel`              | Cancel a proposed investment                             |
| POST   | `/:id/ipo`                                    | Initiate IPO — list on stock market (CEO only)           |
| GET    | `/:id/progression`                            | Get progression data (level, XP, benefits, milestones)   |
| GET    | `/:id/milestones`                             | Get all milestones with completion status                |
| GET    | `/:id/audit`                                  | Company audit log (paginated, filterable)                |
| GET    | `/:id/stats`                                  | Company statistics                                       |

### City Contracts (`/api/real-estate-companies/:id/contracts`)

| Method | Path                                 | Description                                        |
| ------ | ------------------------------------ | -------------------------------------------------- |
| GET    | `/:id/contracts`                     | List available/proposed/active contracts           |
| GET    | `/:id/contracts/history`             | List completed/failed/rejected contracts (last 50) |
| POST   | `/:id/contracts/:contractId/propose` | Propose a contract (directors/CEO)                 |
| POST   | `/:id/contracts/:contractId/vote`    | Vote on a contract proposal                        |

### Stock Indexes (`/api/indexes`)

| Method | Path                 | Description                         |
| ------ | -------------------- | ----------------------------------- |
| GET    | `/`                  | List all indexes (filter by type)   |
| GET    | `/portfolio`         | User's index ETF holdings           |
| GET    | `/market/overview`   | Grouped by type, top gainers/losers |
| GET    | `/:id`               | Index detail + user holding         |
| GET    | `/:id/history`       | Value history                       |
| GET    | `/:id/constituents`  | Member companies                    |
| POST   | `/buy`               | Buy index units                     |
| POST   | `/sell`              | Sell index units                    |
| GET    | `/user/transactions` | User's index transaction history    |

### Users (`/api/users`)

| Method | Path          | Description                                                       |
| ------ | ------------- | ----------------------------------------------------------------- |
| GET    | `/me`         | Get current user profile                                          |
| GET    | `/search`     | Search users by username                                          |
| GET    | `/:username`  | Get user profile with properties, portfolio value, season history |
| PUT    | `/settings`   | Update display name, bio, portfolio visibility                    |
| PUT    | `/password`   | Change password                                                   |
| PUT    | `/theme`      | Update theme preference (light/dark/system)                       |
| POST   | `/avatar`     | Upload profile picture                                            |
| PUT    | `/language`   | Update preferred language                                         |
| PUT    | `/onboarding` | Mark onboarding as completed                                      |
| POST   | `/push-token` | Register push notification token (max 5, deduped)                 |
| DELETE | `/push-token` | Remove push notification token                                    |

### Banking (`/api/bank`)

| Method | Path              | Description                                                 |
| ------ | ----------------- | ----------------------------------------------------------- |
| GET    | `/summary`        | Balance, net worth, debt, credit score, tier, DTI, max loan |
| GET    | `/options`        | Available loan products with computed payments              |
| GET    | `/my`             | Active loans for user                                       |
| GET    | `/history`        | Last 50 loans                                               |
| GET    | `/credit-history` | Last 50 credit score changes (with reasons)                 |
| POST   | `/apply`          | Apply for a loan                                            |
| POST   | `/repay`          | Repay (partial or full)                                     |

### Offers (`/api/offers`)

| Method | Path                  | Description                                             |
| ------ | --------------------- | ------------------------------------------------------- |
| GET    | `/sent`               | Offers you've sent                                      |
| GET    | `/received`           | Offers you've received                                  |
| POST   | `/create`             | Create an offer on a property (min 70% of market value) |
| POST   | `/accept/:id`         | Accept an offer                                         |
| POST   | `/reject/:id`         | Reject an offer                                         |
| POST   | `/counter/:id`        | Counter an offer                                        |
| POST   | `/accept-counter/:id` | Accept a counter-offer                                  |

### Notifications (`/api/notifications`)

| Method | Path            | Description                                                                  |
| ------ | --------------- | ---------------------------------------------------------------------------- |
| GET    | `/`             | List notifications (last 50); auto-deletes read notifications older than 24h |
| GET    | `/unread-count` | Count of unread notifications                                                |
| PUT    | `/:id/read`     | Mark notification as read                                                    |
| PUT    | `/read-all`     | Mark all as read                                                             |
| DELETE | `/:id`          | Delete a single notification                                                 |

### Development (`/api/development`)

| Method | Path                                     | Description                                              |
| ------ | ---------------------------------------- | -------------------------------------------------------- |
| GET    | `/options`                               | Available construction project types                     |
| GET    | `/options/city/:cityId`                  | Available project types for a specific city              |
| POST   | `/estimate`                              | Get cost estimate for a project                          |
| GET    | `/my-land`                               | List owned land available for construction               |
| POST   | `/start`                                 | Start a new construction project                         |
| GET    | `/projects`                              | List user's construction projects                        |
| GET    | `/projects/:id`                          | Get project details                                      |
| GET    | `/my-buildings`                          | List user's developed buildings                          |
| GET    | `/upgrades/:propertyId`                  | Available upgrades for a property                        |
| POST   | `/upgrade`                               | Upgrade a building                                       |
| GET    | `/improvements/status/:propertyId`       | Get improvement status, progress, and active improvement |
| GET    | `/improvements/available/:propertyId`    | List available improvements for a property               |
| POST   | `/improvements/start`                    | Start an improvement project                             |
| GET    | `/improvements/requirements/:propertyId` | Get 5-item requirements checklist                        |

### Friends (`/api/friends`)

| Method | Path                  | Description                       |
| ------ | --------------------- | --------------------------------- |
| GET    | `/`                   | List friends                      |
| GET    | `/requests`           | List pending friend requests      |
| GET    | `/status/:username`   | Get friendship status with a user |
| POST   | `/request/:username`  | Send friend request               |
| POST   | `/accept/:requestId`  | Accept friend request             |
| POST   | `/decline/:requestId` | Decline friend request            |
| DELETE | `/request/:requestId` | Cancel sent request               |
| DELETE | `/:friendId`          | Remove friend                     |

### World (`/api/world`)

| Method | Path      | Description                                        |
| ------ | --------- | -------------------------------------------------- |
| GET    | `/status` | Current tick number, last update, next update time |

### Stats (`/api/stats`)

| Method | Path | Description                                                                                         |
| ------ | ---- | --------------------------------------------------------------------------------------------------- |
| GET    | `/`  | Global stats (player count, property count, city count, transactions, top players, recent activity) |

### Events (`/api/events`)

| Method | Path      | Description                      |
| ------ | --------- | -------------------------------- |
| GET    | `/active` | List all currently active events |

### Month Bonus (`/api/bonus`)

| Method | Path      | Description                                                |
| ------ | --------- | ---------------------------------------------------------- |
| GET    | `/status` | Check if bonus is available and time until next claim      |
| POST   | `/claim`  | Claim $250-$1,000 cash + 10-50 XP (once per 6-hour period) |

### Rent Collection (`/api/rent`)

| Method | Path       | Description                                                |
| ------ | ---------- | ---------------------------------------------------------- |
| GET    | `/status`  | Get uncollected rent amount, expiry timer, and balance     |
| POST   | `/collect` | Collect all uncollected rent into balance (24-hour expiry) |

### Seasons (`/api/seasons`)

| Method | Path              | Description                                          |
| ------ | ----------------- | ---------------------------------------------------- |
| GET    | `/`               | List completed seasons with rankings (public)        |
| GET    | `/player/:userId` | Player's season history across all completed seasons |
| GET    | `/:id`            | Full season detail with archive data                 |

### Presence (`/api/presence`)

| Method | Path             | Description                                    |
| ------ | ---------------- | ---------------------------------------------- |
| GET    | `/:userId`       | Get user online status (online/idle/offline)   |
| GET    | `/batch?ids=...` | Batch status for multiple user IDs (comma-sep) |

### Image Proxy

| Method | Path                     | Description                                                   |
| ------ | ------------------------ | ------------------------------------------------------------- |
| GET    | `/image-proxy?url=<url>` | Proxy external images (OAuth avatars) with redirect following |

### Admin (`/api/admin`) - requires `admin` role

| Method | Path                                   | Description                             |
| ------ | -------------------------------------- | --------------------------------------- |
| GET    | `/overview`                            | Global simulation stats                 |
| GET    | `/ticks`                               | Tick schedule and status                |
| POST   | `/tick/run`                            | Execute 1-50 ticks manually             |
| GET    | `/users`                               | List all users                          |
| PUT    | `/users/:id/balance`                   | Set user balance                        |
| PUT    | `/users/:id/ban`                       | Toggle user ban                         |
| PUT    | `/companies/:id/level`                 | Override company level and XP           |
| GET    | `/properties`                          | List all properties                     |
| POST   | `/properties`                          | Create a property                       |
| PUT    | `/properties/:id`                      | Update property fields                  |
| DELETE | `/properties/:id`                      | Delete a property                       |
| PUT    | `/cities/:id`                          | Update city market stats                |
| GET    | `/events`                              | List all events                         |
| POST   | `/events`                              | Create an event                         |
| PUT    | `/events/:id`                          | Activate/deactivate event               |
| GET    | `/seasons`                             | List all seasons with full archive data |
| GET    | `/seasons/current`                     | Get current active season               |
| GET    | `/seasons/preview`                     | Preview what a season end would reset   |
| POST   | `/seasons/create`                      | Create a new season                     |
| POST   | `/seasons/end`                         | End current season and start a new one  |
| GET    | `/construction-projects`               | List all construction projects          |
| PUT    | `/construction-projects/:id`           | Update a construction project           |
| POST   | `/construction-projects/trigger-event` | Trigger a construction event            |
| GET    | `/development-zones`                   | List development zones                  |
| GET    | `/maintenance`                         | Get maintenance mode status             |
| POST   | `/maintenance/enable`                  | Enable maintenance mode                 |
| POST   | `/maintenance/disable`                 | Disable maintenance mode                |
| GET    | `/backups`                             | List all backups                        |
| POST   | `/backups`                             | Create a new backup                     |
| GET    | `/backups/settings`                    | Get backup settings                     |
| GET    | `/backups/:id`                         | Get backup details                      |
| GET    | `/backups/:id/download`                | Download backup file                    |
| POST   | `/backups/upload`                      | Upload and restore from backup          |
| POST   | `/backups/:id/restore`                 | Restore database from backup            |
| DELETE | `/backups/:id`                         | Delete a backup                         |
| GET    | `/backups/:id/logs`                    | Get backup logs                         |
| POST   | `/backups/retention`                   | Run retention cleanup                   |
| GET    | `/email/status`                        | Get SMTP connection status              |
| POST   | `/email/test`                          | Send a test email                       |

### Auctions (`/api/auctions`)

| Method | Path                                | Description                                                   |
| ------ | ----------------------------------- | ------------------------------------------------------------- |
| GET    | `/featured`                         | Featured auctions (scored: value, bids, watchers, rarity)     |
| GET    | `/analytics`                        | Global auction stats                                          |
| GET    | `/`                                 | List auctions (filter by status, page)                        |
| GET    | `/:id`                              | Auction detail                                                |
| POST   | `/`                                 | Create an auction (property listing, rate-limited)            |
| POST   | `/:id/bid`                          | Place a bid (anti-sniping extends ending auctions)            |
| POST   | `/:id/watch`                        | Add/remove auction to watchlist                               |
| POST   | `/:id/cancel`                       | Cancel an auction                                             |
| POST   | `/:id/company-bid`                  | Propose a company auction bid (member vote)                   |
| POST   | `/:id/company-bid/:reqId/vote`      | Vote on a company bid proposal                                |
| GET    | `/reputation/:userId`               | Seller auction reputation                                     |
| GET    | `/history/list`                     | Auction history (limit, pagination)                           |
| GET    | `/my/bids`                          | User's bid history                                            |
| GET    | `/my/watchlist`                     | User's watchlist (max 50)                                     |

### Missions (`/api/missions`)

| Method | Path                    | Description                                        |
| ------ | ----------------------- | -------------------------------------------------- |
| GET    | `/definitions`          | Mission catalog (22 condition types)               |
| GET    | `/dashboard`            | Active missions with progress                      |
| GET    | `/active`               | Currently active missions                          |
| GET    | `/completed`            | Completed missions                                |
| GET    | `/claimed`              | Claimed missions                                  |
| GET    | `/chain/:chainId`       | Mission chain by ID                               |
| GET    | `/stats`                | Mission statistics                                |
| POST   | `/claim/:missionId`     | Claim reward (atomic completed→claimed)           |
| POST   | `/refresh`              | Refresh daily/weekly missions                     |
| POST   | `/admin/reset-periods`  | Reset mission periods (admin)                     |

### Career (`/api/career`)

| Method | Path                    | Description                                        |
| ------ | ----------------------- | -------------------------------------------------- |
| GET    | `/`                     | Career stats, titles, prestige, achievements       |
| GET    | `/achievements`         | Earned achievements list                          |
| POST   | `/title`                | Set active title                                  |
| POST   | `/prestige`             | Prestige reset for career bonuses                 |
| POST   | `/check-achievements`   | Re-run achievement checks                         |

### Districts (`/api/districts`)

| Method | Path                     | Description                                    |
| ------ | ------------------------ | ---------------------------------------------- |
| GET    | `/`                      | List all districts                             |
| GET    | `/leaderboard/top`       | Top districts by influence                     |
| GET    | `/city/:cityId`          | Districts within a city                        |
| GET    | `/:id`                   | District detail (public, optional auth)        |
| GET    | `/:id/history`           | District influence history                     |
| GET    | `/:id/influence`         | Player influence breakdown for a district      |

### Leaderboards (`/api/leaderboards`)

| Method | Path                     | Description                                    |
| ------ | ------------------------ | ---------------------------------------------- |
| GET    | `/rankings/:category`    | Rankings for a category (net-worth, etc.)      |
| GET    | `/my-rank`               | Current user rank across categories            |
| GET    | `/history/:category`     | Ranking history                                |
| GET    | `/player/:userId`        | Player ranks across categories                 |
| GET    | `/summary`               | Leaderboard summary                            |

### Market Intelligence (`/api/market-intelligence`)

| Method | Path                     | Description                                    |
| ------ | ------------------------ | ---------------------------------------------- |
| GET    | `/catalog`               | Available report catalog                       |
| GET    | `/trends/:cityId`        | City market trends                             |
| POST   | `/purchase`              | Purchase a market report                       |
| GET    | `/reports`               | User's purchased reports                       |
| GET    | `/reports/:id`           | Report details                                |
| GET    | `/performance`           | Report/strategy performance summary            |

### Transactions (`/api/transactions`)

| Method | Path           | Description                              |
| ------ | -------------- | ---------------------------------------- |
| GET    | `/user/:id`    | User transaction history (authenticated) |

### Property Management (`/api/management`)

| Method | Path                      | Description                       |
| ------ | ------------------------- | --------------------------------- |
| GET    | `/:propertyId`            | Property management overview      |
| GET    | `/:propertyId/history`    | Property management history       |
| POST   | `/:propertyId/rent`       | Set property rent                 |
| POST   | `/:propertyId/maintenance`| Set property maintenance level    |

### Donations (`/api/donations`)

| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | `/config`            | Donation configuration                   |
| POST   | `/create`            | Create a donation intent                 |
| POST   | `/capture`           | Capture a completed donation             |
| GET    | `/history`           | User donation history                    |
| GET    | `/top-supporters`    | Top supporters (public, optional auth)   |
| GET    | `/admin/stats`       | Donation stats (admin)                   |

## Database Models

### SizOps SSO Integration (OIDC)

CityFlow integrates with **SizOps** as its central identity provider using
OIDC authorization-code + PKCE flow.

**Architecture:**

```text
CityFlow (OIDC client) ──authorize──▶ SizOps (OIDC provider, RS256)
        ▲                                  │
        │          code + PKCE             │ SizOps login + consent
        └──────── token exchange ◀─────────┘
        │  ID-token validation: JWKS signature, issuer, audience, exp, nonce
        ▼
find/create/link CityFlow user by `sub` (User.sizopsUserId)
        ▼
issue the EXISTING CityFlow HS256 7-day JWT
```

**Rules (non-negotiable):**

- `JWT_SECRET` is never shared or modified — SizOps signs OIDC tokens with its
  own RS256 key pair.
- Accounts are **never** auto-linked by email. The only trusted identity is the
  verified ID-token `sub` → `User.sizopsUserId`.
- Existing users keep the same `_id` and all game data; linking only adds the
  identity fields.
- Existing email/password, Google and Discord login continue unchanged.
- SizOps auth always results in CityFlow issuing its normal JWT — a raw SizOps
  token is never accepted as a game session.

**Backend routes** (`backend/src/routes/sizopsAuth.js`):

| Route | Purpose |
|---|---|
| `GET /auth/sizops` | Start SizOps login (redirects to SizOps authorize) |
| `POST /auth/sizops/link-start` | Start linking (authenticated CityFlow session) |
| `GET /auth/sizops/callback` | Code exchange, ID-token validation, login/link |
| `GET /auth/sizops/status` | Connection status (masked SizOps ID) |
| `POST /auth/sizops/unlink` | Unlink (guarded: needs password or another login method) |

**Environment variables:**

```env
SIZOPS_OIDC_ENABLED=false            # feature flag — enable after verification
SIZOPS_OIDC_ISSUER=https://sizops.co.il
SIZOPS_OIDC_CLIENT_ID=szoc_...       # OIDC client (registered on SizOps)
SIZOPS_OIDC_CLIENT_SECRET=...        # server-side only
SIZOPS_OIDC_REDIRECT_URI=https://cityflow.sizops.co.il/api/auth/sizops/callback
SIZOPS_OIDC_SCOPE=openid profile email
SIZOPS_API_KEY=szak_...              # OPTIONAL — only for GamePlayer registration on the SizOps side
SIZOPS_CLIENT_ID=szp_...             # OPTIONAL — SizOps game application ID
```

- **`SIZOPS_API_KEY` is optional.** OIDC SSO works without it; it is only used
  for the optional, fire-and-forget GamePlayer registration (identity only),
  and failures there never block login/linking.
- **SizOps must use a persistent RS256 key in production** (`OIDC_PRIVATE_KEY`
  as a Kubernetes Secret). SizOps fails fast at startup if the key is missing
  in production — ephemeral keys would invalidate every previously issued ID
  token after a restart.

See `docs/adr/0001-sizops-oidc.md` and the SizOps repo
(`server/src/services/oauth.service.ts`) for details.

### User

| Field                         | Type                           | Description                                                                                         |
| ----------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `username`                    | String                         | Unique display name                                                                                 |
| `normalizedUsername`          | String                         | Lowercase username (unique index, case-insensitive lookups)                                         |
| `email`                       | String                         | Unique email                                                                                        |
| `password`                    | String                         | bcrypt hash (not returned)                                                                          |
| `oauthProviders`              | [{provider, providerId}]       | Linked OAuth accounts (google, discord)                                                             |
| `sizopsUserId`                | String (unique, sparse)        | SizOps central identity link (verified OIDC `sub`; null until explicit linking)                     |
| `sizopsLinkedAt`              | Date                           | When the SizOps link was established                                                                |
| `balance`                     | Number                         | Cash balance (default 100,000)                                                                      |
| `ownedProperties`             | [ObjectId]                     | References to Property                                                                              |
| `friends`                     | [ObjectId]                     | References to User                                                                                  |
| `role`                        | String                         | `user` or `admin`                                                                                   |
| `banned`                      | Boolean                        | Whether user is banned                                                                              |
| `theme`                       | String                         | `light`, `dark`, or `system`                                                                        |
| `preferredLanguage`           | String                         | `en` or `he`                                                                                        |
| `avatar`                      | String                         | Profile picture URL or local path                                                                   |
| `displayName`                 | String                         | Custom display name                                                                                 |
| `bio`                         | String                         | User bio                                                                                            |
| `achievements`                | [String]                       | Earned achievements                                                                                 |
| `acceptedTerms`               | Boolean                        | Terms of Service accepted                                                                           |
| `acceptedPrivacy`             | Boolean                        | Privacy Policy accepted                                                                             |
| `emailVerified`               | Boolean                        | Whether email has been verified                                                                     |
| `verificationToken`           | String                         | Email verification token hash                                                                       |
| `verificationExpires`         | Date                           | Email verification token expiry                                                                     |
| `passwordResetToken`          | String                         | Password reset token hash                                                                           |
| `passwordResetExpires`        | Date                           | Password reset token expiry                                                                         |
| `lastLoginAt`                 | Date                           | Last login timestamp                                                                                |
| `lastPeriodBonusClaim`        | Date                           | When last month bonus was claimed                                                                   |
| `uncollectedRent`             | Number                         | Rent waiting to be collected                                                                        |
| `rentStorageStartedAt`        | Date                           | When current rent pool started accumulating (24h expiry)                                            |
| `level`                       | Number                         | Player level (default 1)                                                                            |
| `xp`                          | Number                         | Experience points (default 0)                                                                       |
| `xpToNextLevel`               | Number                         | XP needed for next level (default 100)                                                              |
| `lifetimeStats`               | Object                         | Total transactions, properties, money earned/spent, loans, friends, upgrades, construction, seasons |
| `onboarding.completed`        | Boolean                        | Whether onboarding tour is completed                                                                |
| `profileVisibility.portfolio` | Boolean                        | Show portfolio on public profile                                                                    |
| `pushTokens`                  | [{token, platform, createdAt}] | Push notification tokens (max 5)                                                                    |
| `pushNotificationsEnabled`    | Boolean                        | Push notifications enabled                                                                          |
| `stockHoldings`               | [ObjectId]                     | References to StockHolding                                                                          |
| `indexHoldings`               | [ObjectId]                     | References to IndexHolding                                                                          |
| `deletedAt`                   | Date?                          | Soft-deleted timestamp (24h restore window)                                                         |
| `companyId`                   | ObjectId?                      | Reference to RealEstateCompany                                                                      |

### Property

| Field               | Type            | Description                                    |
| ------------------- | --------------- | ---------------------------------------------- |
| `name`              | String          | Property name                                  |
| `type`              | String          | apartment, house, commercial, land             |
| `cityId`            | ObjectId        | Reference to City                              |
| `ownerId`           | ObjectId?       | Current owner (null = bank-owned)              |
| `basePrice`         | Number          | Original price                                 |
| `currentPrice`      | Number          | Current market price                           |
| `rent`              | Number          | Rent per tick                                  |
| `condition`         | Number          | 0-100 condition score                          |
| `forSale`           | Boolean         | Listed on marketplace?                         |
| `lastPurchasePrice` | Number          | Price when last purchased                      |
| `volatility`        | Number          | 0-1 price volatility factor                    |
| `regime`            | String          | bull, bear, stable, recovery, correction, boom |
| `regimeEndTick`     | Number          | Tick when current regime expires               |
| `developmentLevel`  | Number          | Building development level (0 = raw land)      |
| `buildingType`      | String          | Type of building                               |
| `occupancy`         | Number          | 0-100 occupancy percentage                     |
| `maintenanceCost`   | Number          | Maintenance cost per tick                      |
| `improvements`      | [Object]        | Completed improvements                         |
| `activeImprovement` | Object?         | Currently in-progress improvement              |
| `propertyRating`    | String          | standard, improved, premium, luxury, elite     |
| `priceHistory`      | [{tick, price}] | Historical price data points                   |
| `companyId`         | ObjectId?       | Reference to RealEstateCompany (company-owned) |

### City

| Field                 | Type       | Description                                |
| --------------------- | ---------- | ------------------------------------------ |
| `name`                | String     | City name                                  |
| `country`             | String     | Country                                    |
| `coordinates`         | {lat, lng} | Map position                               |
| `population`          | Number     | Current population                         |
| `demandIndex`         | Number     | Demand level (default 1.0)                 |
| `supplyIndex`         | Number     | Supply level (default 1.0)                 |
| `growthRate`          | Number     | Growth rate per tick                       |
| `avgPrice`            | Number     | Average property price                     |
| `avgRent`             | Number     | Average rent (default 500)                 |
| `propertyCount`       | Number     | Current property count                     |
| `totalCapacity`       | Number     | Max properties allowed                     |
| `developmentRate`     | Number     | New property generation rate               |
| `economicCondition`   | String     | boom, growth, stable, slowdown, recession  |
| `activeEvents`        | [Object]   | Active events with tickers                 |
| `demographicsHistory` | [Object]   | Historical demographic snapshots (max 120) |

### Company

| Field               | Type     | Description                                |
| ------------------- | -------- | ------------------------------------------ |
| `name`              | String   | Company name                               |
| `ticker`            | String   | Unique stock ticker                        |
| `industry`          | String   | 8 industries (technology, finance, etc.)   |
| `size`              | String   | startup, small, medium, large, corporation |
| `sharePrice`        | Number   | Current share price                        |
| `marketCap`         | Number   | Market capitalization                      |
| `sharesOutstanding` | Number   | Total shares                               |
| `volatility`        | Number   | Price volatility                           |
| `dayChangePercent`  | Number   | Daily price change                         |
| `totalReturn`       | Number   | Total return percentage                    |
| `performance`       | [Object] | Historical tick data                       |

### StockIndex

| Field          | Type       | Description           |
| -------------- | ---------- | --------------------- |
| `name`         | String     | Index name            |
| `ticker`       | String     | Unique ticker         |
| `type`         | String     | world, industry, city |
| `value`        | Number     | Current index value   |
| `constituents` | [ObjectId] | Member companies      |
| `performance`  | [Object]   | Historical tick data  |

### Loan

| Field              | Type      | Description                                   |
| ------------------ | --------- | --------------------------------------------- |
| `userId`           | ObjectId  | Borrower                                      |
| `principal`        | Number    | Original loan amount                          |
| `remainingBalance` | Number    | Outstanding balance                           |
| `interestRate`     | Number    | Interest per tick                             |
| `durationTicks`    | Number    | Total loan duration                           |
| `ticksRemaining`   | Number    | Ticks left                                    |
| `paymentPerTick`   | Number    | Scheduled payment per tick                    |
| `missedPayments`   | Number    | Consecutive missed payments                   |
| `active`           | Boolean   | Loan active?                                  |
| `companyId`        | ObjectId? | Reference to RealEstateCompany (company loan) |

### RealEstateCompany

| Field                      | Type                                                                    | Description                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                     | String                                                                  | Company name (unique)                                                                                                                                                               |
| `description`              | String                                                                  | Company description                                                                                                                                                                 |
| `logo`                     | String                                                                  | Company logo URL                                                                                                                                                                    |
| `founderId`                | ObjectId                                                                | Reference to User (company creator)                                                                                                                                                 |
| `members`                  | [{userId, role, shares, joinedAt, invitedBy}]                           | Members with roles (CEO/Director/Officer/Member/Recruit) and share allocation                                                                                                       |
| `totalShares`              | Number                                                                  | Total shares (default 100)                                                                                                                                                          |
| `invitations`              | [{userId, invitedBy, status, createdAt}]                                | Pending/accepted/declined invitations                                                                                                                                               |
| `applications`             | [{userId, message, status, reviewedBy, reviewedAt}]                     | Player applications to join                                                                                                                                                         |
| `loanRequests`             | [{requestedBy, principal, durationTicks, status, votes, ...}]           | Loan proposals with member voting                                                                                                                                                   |
| `propertyPurchaseRequests` | [{requestedBy, propertyId, status, votes, ...}]                         | Property purchase proposals with member voting                                                                                                                                      |
| `developmentRequests`      | [{requestedBy, propertyId, actionType, actionData, status, votes, ...}] | Development proposals (upgrade/improvement/construction) with voting                                                                                                                |
| `milestones`               | [{milestoneId, name, xpReward, treasuryReward, completedAt, ...}]       | Completed milestones with rewards                                                                                                                                                   |
| `treasury`                 | {balance, transactions}                                                 | Shared treasury with typed transaction log (4-tick retention)                                                                                                                       |
| `properties`               | [ObjectId]                                                              | References to Property                                                                                                                                                              |
| `ipo`                      | {listed, stockCompanyId, ticker, sharePrice, sharesOutstanding, ...}    | IPO status for stock market listing                                                                                                                                                 |
| `stats`                    | Object                                                                  | netWorth, propertiesOwned, totalRentalIncome, totalTreasuryDeposits, activeProjects, totalLoanBalance, totalDevelopments, contractsCompleted, loansRepaid, totalVotes, ticksExisted |
| `reputation`               | Number                                                                  | Company reputation score (0-1000)                                                                                                                                                   |
| `level`                    | Number                                                                  | Company level (derived from total XP, 1-50)                                                                                                                                         |
| `xp`                       | Number                                                                  | Total accumulated XP (level derived via `getLevelFromTotalXP()`)                                                                                                                    |
| `xpToNextLevel`            | Number                                                                  | XP threshold for next level                                                                                                                                                         |
| `maxMembers`               | Number                                                                  | Maximum members (10 + 1.2 per level, capped at 50)                                                                                                                                  |
| `active`                   | Boolean                                                                 | Whether company is active                                                                                                                                                           |
| `foundedTick`              | Number                                                                  | Tick when company was created                                                                                                                                                       |
| `creationFee`              | Number                                                                  | Fee paid to create the company                                                                                                                                                      |

### CompanyAuditLog

| Field       | Type     | Description                                                                                              |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `companyId` | ObjectId | Reference to RealEstateCompany                                                                           |
| `userId`    | ObjectId | Reference to User (who performed the action)                                                             |
| `action`    | String   | Action type (20+ types: member_joined, treasury_deposit, property_purchased, loan_taken, level_up, etc.) |
| `details`   | Object   | Action-specific metadata                                                                                 |
| `tick`      | Number   | Game tick when action occurred                                                                           |

### CompanyInvestment

| Field              | Type     | Description                                                                       |
| ------------------ | -------- | --------------------------------------------------------------------------------- |
| `companyId`        | ObjectId | Reference to RealEstateCompany                                                    |
| `investmentType`   | String   | government_bond, corporate_bond, reit_fund, fixed_term, infrastructure_fund, etc. |
| `name`             | String   | Investment name                                                                   |
| `principal`        | Number   | Initial investment amount                                                         |
| `currentValue`     | Number   | Current value (updated each tick)                                                 |
| `annualReturnRate` | Number   | Current annual return rate                                                        |
| `durationTicks`    | Number   | Investment duration                                                               |
| `startTick`        | Number   | Tick when investment started                                                      |
| `maturityTick`     | Number   | Tick when investment matures                                                      |
| `risk`             | String   | Risk level (low, medium, high)                                                    |
| `requiresVote`     | Boolean  | Whether the investment required member voting                                     |
| `proposal`         | Object   | Vote tracking: proposedBy, status, votes[], expiresAtTick                         |
| `status`           | String   | proposed, active, matured, withdrawn, rejected                                    |

### CityContract

| Field              | Type     | Description                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `companyId`        | ObjectId | Reference to RealEstateCompany                                       |
| `cityId`           | ObjectId | Reference to City                                                    |
| `contractType`     | String   | renovation, small_housing, hotel, office_tower, infrastructure, etc. |
| `contractTier`     | Number   | Contract tier (1+)                                                   |
| `name`             | String   | Contract name                                                        |
| `requiredLevel`    | Number   | Minimum company level to take the contract                           |
| `requiredTreasury` | Number   | Minimum treasury balance required                                    |
| `cost`             | Number   | Upfront cost to accept                                               |
| `reward`           | Number   | Payment on completion                                                |
| `reputationReward` | Number   | Reputation bonus on completion                                       |
| `xpReward`         | Number   | XP bonus on completion                                               |
| `durationTicks`    | Number   | Contract duration                                                    |
| `status`           | String   | available, proposed, active, completed, failed, rejected             |
| `proposal`         | Object   | Vote tracking (same structure as investments)                        |

### Season

| Field                        | Type     | Description             |
| ---------------------------- | -------- | ----------------------- |
| `number`                     | Number   | Season number           |
| `name`                       | String   | Season display name     |
| `status`                     | String   | `active` or `completed` |
| `startDate`                  | Date     | When season started     |
| `endDate`                    | Date     | When season ended       |
| `archive.playerRankings`     | [Object] | Top 100 players         |
| `archive.cityStatistics`     | [Object] | City snapshot           |
| `archive.marketStatistics`   | Object   | Market data             |
| `archive.economicStatistics` | Object   | Economic snapshot       |
| `archive.winner`             | ObjectId | Season champion         |

### Other Models

- **GameState** - Global singleton: tick number, tick lock, maintenance mode
- **PropertyOffer** - Player-to-player offers with counter-offers and 48h expiry
- **Notification** - User notifications with types and auto-cleanup
- **Transaction** - Full transaction history (12 types), supports company transactions via `companyId`
- **Event** - Dynamic market events with scope and impact
- **ConstructionProject** - Building projects with progress tracking; supports company ownership via `companyId`
- **CompanyInvestment** - Company treasury investments (bonds, REITs, funds) with maturity and voting
- **InvestmentOpportunity** - Available investment products generated each tick
- **CityContract** - City contracts for companies with tiers, voting, and completion rewards
- **StockHolding** / **IndexHolding** - User stock/index portfolios
- **StockTransaction** / **IndexTransaction** - Trading history
- **Backup** - Database backup metadata with logs
- **FriendRequest** - Bidirectional friend system

## Frontend Routes

| Path                         | Component               | Auth Required |
| ---------------------------- | ----------------------- | ------------- |
| `/`                          | LandingPage             | No            |
| `/map`                       | MapPage                 | No            |
| `/city/:id`                  | CityDashboard           | No            |
| `/property/:id`              | PropertyPage            | Yes           |
| `/dashboard`                 | PlayerDashboard         | Yes           |
| `/bank`                      | BankPage                | Yes           |
| `/development`               | DevelopmentPage         | Yes           |
| `/project/:id`               | ProjectDetailsPage      | Yes           |
| `/marketplace`               | Marketplace             | Yes           |
| `/stocks`                    | StockMarket             | Yes           |
| `/stocks/portfolio`          | StockPortfolio          | Yes           |
| `/company/:id`               | CompanyPage             | Yes           |
| `/index/:id`                 | IndexPage               | Yes           |
| `/leaderboards`              | LeaderboardPage         | Yes           |
| `/events`                    | CompetitiveEventsPage   | Yes           |
| `/auctions`                  | AuctionDashboardPage    | Yes           |
| `/auctions/:id`              | AuctionDashboardPage    | Yes           |
| `/districts`                 | DistrictListPage        | Yes           |
| `/district/:id`              | DistrictPage            | Yes           |
| `/market-intelligence`       | MarketIntelligencePage  | Yes           |
| `/missions`                  | MissionsPage            | Yes           |
| `/career`                    | CareerPage              | Yes           |
| `/friends`                   | FriendsPage             | Yes           |
| `/notifications`             | NotificationsPage       | Yes           |
| `/profile`                   | UserProfilePage (own)   | Yes           |
| `/profile/:username`         | UserProfilePage (other) | Yes           |
| `/settings`                  | SettingsPage            | Yes           |
| `/mobile-settings`           | MobileSettingsPage      | Yes           |
| `/seasons`                   | SeasonHistoryPage       | No            |
| `/terms`                     | TermsPage               | No            |
| `/privacy`                   | PrivacyPage             | No            |
| `/cookies`                   | CookiesPage             | No            |
| `/forgot-password`           | ForgotPasswordPage      | Guest only    |
| `/reset-password`            | ResetPasswordPage       | Guest only    |
| `/verify-email`              | VerifyEmailPage         | No            |
| `/contributors`              | ContributorsPage        | No            |
| `/donate`                    | DonationsPage           | No            |
| `/supporters`                | SupporterRecognitionPage| No            |
| `/oauth/accept-terms`        | OAuthAcceptTermsPage    | No            |
| `/auth/callback`             | OAuthCallbackPage       | No            |
| `/admin`                     | AdminPage               | Admin only    |
| `/real-estate-companies`     | CompaniesListPage       | Yes           |
| `/real-estate-companies/:id` | CompanyDetailPage       | Yes           |
| `/login`                     | LoginPage               | Guest only    |
| `*`                          | NotFoundPage            | No            |

## Scripts

### Backend (cd backend/)

| Command                 | Description                                 |
| ----------------------- | ------------------------------------------- |
| `npm run dev`           | Start backend server (port 5000)            |
| `npm run seed`          | Seed/refresh database with cities and users |
| `npm start`             | Start backend in production mode            |
| `npm test`              | Run all tests                               |
| `npm run test:watch`    | Run tests in watch mode                     |
| `npm run test:coverage` | Run tests with coverage report              |
| `npm run lint`          | Run ESLint                                  |
| `npm run lint:fix`      | Run ESLint with auto-fix                    |
| `npm run format`        | Check code formatting with Prettier         |
| `npm run format:fix`    | Fix code formatting with Prettier           |

### Frontend (cd frontend/)

| Command                        | Description                         |
| ------------------------------ | ----------------------------------- |
| `npm run dev`                  | Start Vite dev server (port 3000)   |
| `npm run build`                | Build frontend for production       |
| `npm run preview`              | Preview production build            |
| `npm test`                     | Run frontend tests                  |
| `npm run test:watch`           | Run frontend tests in watch mode    |
| `npm run test:coverage`        | Run frontend tests with coverage    |
| `npm run lint`                 | Run ESLint                          |
| `npm run lint:fix`             | Run ESLint with auto-fix            |
| `npm run format`               | Check code formatting with Prettier |
| `npm run format:fix`           | Fix code formatting with Prettier   |
| `npm run cap:sync`             | Sync Capacitor platforms            |
| `npm run cap:android`          | Open Android in Android Studio      |
| `npm run cap:ios`              | Open iOS in Xcode                   |
| `npm run mobile:build:android` | Build frontend + sync + debug APK   |
| `npm run mobile:build:ios`     | Build frontend + sync for iOS       |

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

| Workflow     | Trigger                | Description                                      |
| ------------ | ---------------------- | ------------------------------------------------ |
| `ci.yml`     | Push to main, PRs      | Run tests, lint, typecheck                       |
| `deploy.yml` | Push to main           | Docker build, push to GHCR, update K8s manifests |
| `mobile.yml` | Push to main, tag `v*` | Build APK/AAB, publish to Play Store             |

### Play Store Publishing

Automated via `gradle-play-publisher` plugin. Required GitHub Secrets:

| Secret                      | Description                      |
| --------------------------- | -------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded release keystore  |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                |
| `ANDROID_KEY_ALIAS`         | Key alias                        |
| `ANDROID_KEY_PASSWORD`      | Key password                     |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play service account JSON |

### Kubernetes (K3s)

| Component   | Description                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Namespace   | `cityflow`                                                                                                  |
| MongoDB     | StatefulSet with persistent storage                                                                         |
| Redis       | Deployment with persistent storage, noeviction policy, healthcheck                                          |
| Backend     | 2-replica Deployment with Redis distributed tick lock; Service with ClientIP session affinity for Socket.IO |
| Frontend    | 2-replica Deployment with nginx serving static files                                                        |
| Discord Bot | Single-replica Deployment with NetworkPolicy (egress only)                                                  |
| Backup PVC  | 5Gi PersistentVolumeClaim for backup storage                                                                |
| Ingress     | Traefik with Let's Encrypt TLS + sticky cookie for Socket.IO                                                |
| SSL         | Auto-renewed Let's Encrypt certificate for `cityflow.sizops.co.il`                                          |

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

Managed from the Admin Panel (**Admin → Database tab**). Uses the native MongoDB driver with gzip compression.

- **Format**: versioned (`backupVersion: 2`) gzip NDJSON. A header line carries the version, timestamp, collection list and excluded collections; each following line is `EJSON {collection, documents, indexes}`. EJSON preserves ObjectIds, Dates and Buffers exactly.
- **What is backed up**: every MongoDB collection automatically (discovered via `listCollections()` at backup time). The only excluded collection is `backups` (backup metadata is recreated by the system). A regression test (`backupIntegration.test.js`) fails if any registered Mongoose model's collection is not covered.
- **Versioning**: `BACKUP_VERSION = 2` in `backend/src/engine/backup.js`. Restores reject files with a newer version. Legacy v1 files (no header line) restore with backward compatibility.
- **Backup metadata**: each backup records size, duration, collection count, document count, backup version, creator and a log trail — visible in the Admin UI.
- **Restore**: enables maintenance mode, automatically creates a **pre-restore safety backup** (rollback point), drops each backed-up collection (including empty ones), re-inserts documents, **recreates indexes**, re-inserts the performing admin user (prevents lockout), validates document counts per collection, refreshes the engine tick and clears Redis caches. On failure the database is left in maintenance mode so a half-restored state is never served — restore the pre-restore backup to roll back.
- **Retention**: automatic retention keeps the newest `BACKUP_RETENTION_COUNT` backups (default **10**).
- **Scheduling**: optional daily/weekly/monthly backups via `BACKUP_SCHEDULE` (`daily` | `weekly` | `monthly`).
- **Storage**: files on the `cityflow-backups` PVC (mounted at `/app/backups`).

## Persistent Collections

All persistent Mongoose collections (39) are included in backups automatically:

| Collection | Stores |
|---|---|
| `users` | Player accounts: balance, reserved auction funds, XP/level, achievements, onboarding, push tokens, OAuth, lifetime stats |
| `properties` | Properties: price, rent, condition, units, improvements, risk, history |
| `cities` | Cities: demand/supply/population, economic condition, demographics history |
| `districts` | Districts: economy, player influence, history |
| `seasons` | Seasons + archive (rankings, hall of fame, rewards) |
| `gamestates` | Global engine state: tick number, season id, maintenance, tick lock |
| `transactions` | Game transaction ledger |
| `notifications` | User notifications |
| `loans` | Player loans |
| `creditscorehistories` | Credit score changes |
| `missions` → `missionprogresses` | Mission progress per user |
| `realestatecompanies` | Player companies: members, shares, treasury, requests, IPO |
| `companyauditlogs` | Company action audit trail |
| `companyinvestments` | Company treasury investments |
| `investmentopportunities` | Investment products |
| `citycontracts` | City contracts + votes |
| `companies` | Stock-market companies: prices, revenue, dividends, IPO |
| `stockholdings` | User stock positions incl. locked shares + dividends |
| `stocktransactions` | Stock buy/sell/dividend ledger |
| `stockindexes` | Market indices |
| `indexholdings` | Index fund positions |
| `indextransactions` | Index buy/sell ledger |
| `stockmarketevent` | Stock news/events |
| `auctions` | Auctions: bids, watchers, activity, status |
| `auctionreservations` | Reserved auction funds per user+auction |
| `auctionreputations` | Per-user auction stats |
| `leaderboardsnapshots` | Ranking snapshots |
| `leaderboardrewards` | Season leaderboard payouts |
| `competitiveevents` | Competitive events + participants |
| `constructionprojects` | Building projects |
| `propertyoffers` | Buy offers/counter-offers |
| `marketreports` | Purchased market intelligence reports |
| `friendrequests` | Friend requests |
| `uservisits` | Profile/city/district/market visit tracking |
| `events` | Global/local market events |
| `discordnotificationsettings` | Discord notification preferences |
| `donations` | Donations/supporter status |
| `adminauditlogs` | Admin action audit trail |
| `backups` | **Excluded** — backup metadata, recreated by the system |

## Compact Number Formatting

| Function              | Input   | Output               | Example           |
| --------------------- | ------- | -------------------- | ----------------- |
| `formatMoney(n)`      | Number  | Compact dollar       | `$1.5K`, `$250`   |
| `formatMoneyExact(n)` | Number  | Full dollar          | `$1,500`          |
| `formatPrice(n)`      | Number  | Compact or 2 decimal | `$9.50`, `$1.5K`  |
| `formatCompact(n)`    | Number  | Compact integer      | `1.5K`, `2M`      |
| `formatCount(n)`      | Number  | Compact or locale    | `500`, `1.5K`     |
| `formatPercent(n)`    | Decimal | Percentage           | `5.0%`            |
| `formatDiff(n)`       | Number  | Signed compact       | `+$500`, `-$1.5K` |

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
