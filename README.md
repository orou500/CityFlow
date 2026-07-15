<img width="1536" height="1024" alt="logo-text" src="https://github.com/user-attachments/assets/590d9e0b-4b9c-44b9-84a2-353450cfb036" />

<img width="2560" height="1326" alt="Screenshot 2026-07-10 012228" src="https://github.com/user-attachments/assets/e48b6b53-2ef4-42a1-bcb3-9bf3672461fa" />

# CityFlow – Global Real Estate Simulation

A full-stack real-time multiplayer simulation game where players buy, sell, develop, and manage properties across a dynamic global market. Built with Node.js, Express, MongoDB, and React. Deployed on Kubernetes with ArgoCD, Let's Encrypt SSL, and automated CI/CD.

**[See CityFlow on itch.io](https://orou500.itch.io/cityflow)**

## Architecture

```
cityflow/
├── backend/
│   └── src/
│       ├── config/          # DB connection, env vars, scheduler config, backup config
│       ├── engine/          # Simulation logic (tick, market, season reset, property generation)
│       ├── middleware/       # JWT auth, admin guards, rate limiter, maintenance
│       ├── models/          # Mongoose schemas (User, Property, City, Season, GameState, etc.)
│       ├── routes/          # REST API endpoints
│       ├── services/        # Email service (Brevo SMTP) and HTML templates
│       ├── test/            # Test setup, helpers, and MongoDB Memory Server config
│       ├── utils/           # Validation, leveling (XP/XP), and utility functions
│       ├── seed.js          # Database initializer
│       └── index.js         # Express app entry point
├── frontend/
│   └── src/
│       ├── components/      # Reusable UI (Navbar, WorldMap, OnboardingWrapper, WorldStatusWidget, RentCollectionWidget, PeriodBonusWidget, Toast)
│       ├── i18n/            # Internationalization (en, he)
│       ├── pages/           # Route-level page components
│       ├── store/           # Zustand state management
│       └── utils/           # Utility functions (formatCompact, formatMoney)
├── discord-bot/             # CityFlow Discord bot (Node.js, Discord.js 14, MongoDB)
│   └── src/
│       ├── commands/        # Slash commands (moderation, staff, game)
│       ├── events/          # Discord event handlers
│       ├── models/          # Mongoose schemas (GuildConfig, Warning, Ticket, Suggestion)
│       └── utils/           # Command/event loaders, helpers, logger
├── k8s/                     # Kubernetes manifests (namespace, deployments, ingress, etc.)
├── discord/                 # Discord server setup guides, role permissions, bot configs
├── .github/workflows/       # CI/CD pipelines (build, test, deploy)
└── .env                     # Environment variables (not tracked)
```

## Features

| Feature | Description |
| ------- | ----------- |
| **Dynamic Market** | City demand/supply indices fluctuate each month, driving property price changes with 6 market regimes (bull, bear, stable, recovery, correction, boom) |
| **Property Generation** | New properties are automatically created each month based on population, development rate, and demand |
| **Anti-Monopoly** | No player can own more than 5% of a city's total properties |
| **Rent Collection Pool** | Rent is deposited into a collectible pool with a 24-hour timer; players must manually collect or forfeit |
| **Bank System** | Players can take loans with interest; missed payments lead to penalties and repossession |
| **Player-to-Player Offers** | Negotiate property purchases via offers, counter-offers, accept/reject (min 70% of market value) |
| **Construction & Development** | Buy land, build from 8 project types (residential, commercial, hospitality), upgrade buildings with 4 upgrade types |
| **World Map** | Interactive Leaflet map with 18 cities, demand-colored pins, active event markers, and World Status Widget |
| **World Events** | Dynamic events (Boom, Recession, Disaster, Policy) affect local or global markets with real-time impact |
| **Seasons** | Game runs in 720-month seasons with automatic resets, full archive of rankings, and fresh starts |
| **Season Leaderboards** | View past season champions, top-20 player rankings, city statistics, and economic data |
| **Player Season History** | Each profile shows the player's rank and stats across all completed seasons |
| **Player Leveling** | XP-based progression system with lifetime stats; earn XP for buying, selling, loans, construction, and more |
| **Period Login Bonus** | Claim $250–$1,000 cash + 10–50 XP every 6 hours from the dashboard |
| **Notifications** | Real-time alerts for offers, trades, construction, and friend requests; toast popups and bell animations; auto-cleanup after 24h |
| **Friends** | Add, accept, decline, and remove friends; view friends' net worth and portfolios; bidirectional notifications |
| **User Profiles** | Customizable avatars, display names, bio, portfolio visibility, season history, level badge, and achievements |
| **Email Verification** | Required before login; verification emails sent on registration; password reset via email |
| **OAuth Login** | Sign in with Google or Discord (JWT-signed state for multi-replica compatibility) |
| **Rate Limiting** | Per-IP rate limiting on registration, login, and email-sending endpoints |
| **Strong Password Policy** | Enforced 8+ characters with uppercase, lowercase, and number requirements |
| **Legal & Compliance** | Terms of Service, Privacy Policy, Cookie Policy pages with registration acceptance |
| **Onboarding** | 12-step guided tour for new players covering all game features |
| **Admin Panel** | Full control over simulation, users, properties, cities, events, seasons, email testing, and manual tick execution; sortable user tables |
| **Backup & Restore** | Admin-only database backup/restore system with gzip-compressed exports, upload/download, auto-retention, and full-fidelity restore |
| **Maintenance Mode** | Admin-toggleable maintenance mode with custom message, 503 backend protection, logged-in user banner |
| **Discord Bot** | 26-slash-command CityFlow bot with moderation, verification, tickets, suggestions, game integration, and anti-spam |
| **Discord Community** | Official CityFlow Discord server with roles, channels, and bot integration |
| **i18n** | Full English and Hebrew interface with proper RTL support across all components |
| **Dark Mode** | Dark, Light, and System theme toggle |
| **Database-Level Tick Lock** | Prevents duplicate tick execution in multi-replica deployments using MongoDB lock documents |
| **Code of Conduct** | Community guidelines based on the Contributor Covenant |

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| Frontend | React 18, React Router, Zustand, Tailwind CSS |
| Maps | Leaflet + react-leaflet |
| i18n | react-i18next with JSON translation files |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Scheduling | node-cron (fixed schedule: 00:00, 06:00, 12:00, 18:00) |
| Charts | Custom SVG (price history) |
| SSL | Let's Encrypt via Traefik ACME (TLS-ALPN challenge) |
| CI/CD | GitHub Actions + ArgoCD on K3s |
| Containers | Docker multi-stage builds, GHCR |

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

## Simulation Engine

### Months (Ticks)

The simulation advances in discrete **ticks** (displayed to players as **months**). Each tick:

1. Updates city demand/supply indices
2. Adjusts property prices based on market forces
3. Generates new properties in cities below capacity
4. Deposits rent into owner's collectible pool (24h expiry)
5. Processes loan repayments
6. Advances construction projects
7. Balances market supply
8. Advances/deactivates events
9. Generates new properties and events
10. Expires uncollected rent pools older than 24 hours
11. Sends rent expiry warnings to users with <1 hour remaining

Ticks run automatically at fixed times: **00:00, 06:00, 12:00, 18:00** (every 6 hours). Manual tick execution from the admin panel does not shift the schedule. A database-level lock prevents duplicate execution across multiple backend replicas.

### Seasons

The game is organized into **seasons**, each lasting 720 months (approximately 180 days at 6-hour intervals):

1. When tick #720 is reached, the season automatically ends
2. All game data is archived: player rankings, city statistics, market data, economic stats
3. The world resets: all players start with $100,000, cities and properties are regenerated, tick resets to 0
4. A new season begins with the same rules but a clean slate
5. Admins can also manually end/start seasons from the admin panel

Season 1 is automatically created on server startup if no active season exists.

### Market Dynamics

Each property has a **market regime** that persists for 6–18 months, creating distinct behavioral patterns:

| Regime | Bias | Volatility | Description |
| ------ | ---- | ---------- | ----------- |
| `bull` | +0.5%/month | Low | Steady upward growth |
| `bear` | -0.5%/month | Low | Steady decline |
| `stable` | 0 | Very Low | Sideways, minimal movement |
| `recovery` | +0.3%/month | Medium | Recovering from downturn |
| `correction` | -0.3%/month | Medium | Cooling after overheating |
| `boom` | +0.8%/month | High | Rapid growth with high variance |

Regime selection is weighted by city demand — high demand favors bull/boom, low demand favors bear/correction.

**Price calculation per tick:**
1. **Fair value** = basePrice × demandFactor × supplyFactor × growthFactor
2. **Regime bias** adds directional pressure
3. **Mean reversion** (2.5%) pulls price toward fair value
4. **Momentum** (20% of 5-tick average trend) continues recent direction
5. **Noise** scaled by property volatility and regime — adds unpredictability
6. **Soft boundaries** add resistance near 2.5×/0.6× base price (hard clamp at 3.0×/0.5×)

- **Rent**: 0.2%–0.4% of current price per tick (randomized), deposited into player's collectible pool with 24-hour expiry

### Property Generation

Each tick, the engine creates new properties for cities that have room:

```
newProperties = population × developmentRate × (demandIndex / 100)
```

New properties are assigned to the bank (`ownerId: null`) at a price of `city.avgPrice × locationMultiplier × marketCondition`, capped by `city.totalCapacity`.

### Events

Random or admin-created events affect cities with weighted probability and impact categories:

| Scope | Effect |
| ----- | ------ |
| `local` | Affects a single random city |
| `global` | Affects all cities (at 50% impact strength) |

**Event templates** include Interest Rate Change, Economic Boom, Recession, City Development Plan, Housing Crisis, Market Correction, Tech Hub Growth, and Natural Disaster. Events modify demand, supply, and growth indices on affected cities for their duration.

Events are rendered on the world map as colored pins with popups showing name, description, city, duration, and remaining ticks.

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
| GET | `/me` | Get current user profile |
| GET | `/verify-email` | Verify email address via token (query param `?token=...`) |
| POST | `/resend-verification` | Resend verification email |
| POST | `/forgot-password` | Request password reset email (always returns success to prevent enumeration) |
| POST | `/reset-password` | Reset password with token |
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

### Transactions (`/api/transactions`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/user/:id` | Transaction history for a user |

### Banking (`/api/bank`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/summary` | Bank summary and stats |
| GET | `/options` | Available loan options |
| GET | `/my` | Active loans for user |
| POST | `/apply` | Apply for a loan |
| POST | `/repay` | Repay (partial or full) |

### Offers (`/api/offers`) — requires authentication

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/sent` | Offers you've sent |
| GET | `/received` | Offers you've received |
| POST | `/create` | Create an offer on a property (min 70% of market value) |
| POST | `/accept/:id` | Accept an offer |
| POST | `/reject/:id` | Reject an offer |
| POST | `/counter/:id` | Counter an offer |
| POST | `/accept-counter/:id` | Accept a counter-offer |

### Notifications (`/api/notifications`) — requires authentication

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | List notifications (last 50); auto-deletes read notifications older than 24h |
| GET | `/unread-count` | Count of unread notifications |
| PUT | `/:id/read` | Mark notification as read |
| PUT | `/read-all` | Mark all as read |
| DELETE | `/:id` | Delete a single notification |

### Development (`/api/development`) — requires authentication

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

### Friends (`/api/friends`) — requires authentication

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

### Period Bonus (`/api/bonus`) — requires authentication

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/status` | Check if bonus is available and time until next claim |
| POST | `/claim` | Claim $250–$1,000 cash + 10–50 XP (once per 6-hour period) |

### Rent Collection (`/api/rent`) — requires authentication

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

### Admin (`/api/admin`) — requires `admin` role

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/overview` | Global simulation stats |
| GET | `/ticks` | Tick schedule & status (next tick calculated from fixed schedule) |
| POST | `/tick/run` | Execute 1–50 ticks manually |
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
| POST | `/seasons/create` | Create a new season (if none active) |
| POST | `/seasons/end` | End current season and start a new one (requires `confirm: true`) |
| GET | `/construction-projects` | List all construction projects |
| PUT | `/construction-projects/:id` | Update a construction project |
| POST | `/construction-projects/trigger-event` | Trigger a construction event |
| GET | `/development-zones` | List development zones |
| GET | `/maintenance` | Get maintenance mode status |
| POST | `/maintenance/enable` | Enable maintenance mode |
| POST | `/maintenance/disable` | Disable maintenance mode |
| GET | `/backups` | List all backups (newest first) |
| POST | `/backups` | Create a new backup (async background job) |
| GET | `/backups/settings` | Get backup settings (retention count, schedule, directory) |
| GET | `/backups/:id` | Get backup details |
| GET | `/backups/:id/download` | Download backup file (gzipped JSON) |
| POST | `/backups/upload` | Upload and restore from a backup file (multipart/form-data) |
| POST | `/backups/:id/restore` | Restore database from a backup |
| DELETE | `/backups/:id` | Delete a backup file |
| GET | `/backups/:id/logs` | Get backup logs |
| POST | `/backups/retention` | Run retention cleanup now |
| GET | `/email/status` | Get SMTP connection status |
| POST | `/email/test` | Send a test email to verify SMTP configuration |

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
| `theme` | String | `light`, `dark`, or `system` (default `system`) |
| `preferredLanguage` | String | `en` or `he` |
| `avatar` | String | Profile picture URL |
| `displayName` | String | Custom display name |
| `bio` | String | User bio |
| `achievements` | [String] | Earned achievements |
| `acceptedTerms` | Boolean | Terms of Service accepted |
| `acceptedTermsAt` | Date | When terms were accepted |
| `acceptedPrivacy` | Boolean | Privacy Policy accepted |
| `acceptedPrivacyAt` | Date | When privacy policy was accepted |
| `emailVerified` | Boolean | Whether email has been verified (required before login) |
| `emailVerifiedAt` | Date | When email was verified |
| `verificationToken` | String | Email verification token hash (not returned) |
| `verificationExpires` | Date | Email verification token expiry (not returned) |
| `passwordResetToken` | String | Password reset token hash (not returned) |
| `passwordResetExpires` | Date | Password reset token expiry (not returned) |
| `lastLoginAt` | Date | Last login timestamp |
| `lastPeriodBonusClaim` | Date | When last period bonus was claimed |
| `uncollectedRent` | Number | Rent waiting to be collected (default 0) |
| `rentStorageStartedAt` | Date | When current rent pool started accumulating (24h expiry) |
| `level` | Number | Player level (default 1) |
| `xp` | Number | Experience points (default 0) |
| `xpToNextLevel` | Number | XP needed for next level (default 100) |
| `lifetimeStats.totalTransactions` | Number | Total transactions made |
| `lifetimeStats.totalPropertiesOwned` | Number | Total properties ever owned |
| `lifetimeStats.totalMoneyEarned` | Number | Total money earned (rent + sales) |
| `lifetimeStats.totalMoneySpent` | Number | Total money spent |
| `lifetimeStats.totalLoansTaken` | Number | Total loans taken |
| `lifetimeStats.totalFriendsAdded` | Number | Total friends added |
| `lifetimeStats.totalUpgrades` | Number | Total property upgrades |
| `lifetimeStats.totalConstructionStarted` | Number | Total construction projects started |
| `lifetimeStats.totalSeasonsCompleted` | Number | Total seasons completed |
| `onboarding.completed` | Boolean | Whether onboarding tour is completed |
| `onboarding.completedAt` | Date | When onboarding was completed |
| `profileVisibility.portfolio` | Boolean | Show portfolio on public profile |
| `profileVisibility.activity` | Boolean | Show transaction activity on public profile |

### Property

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | Property name |
| `type` | String | apartment, house, commercial, land |
| `cityId` | ObjectId | Reference to City |
| `ownerId` | ObjectId? | Current owner (nullable — null = bank-owned) |
| `basePrice` | Number | Original price |
| `currentPrice` | Number | Current market price |
| `rent` | Number | Rent per tick |
| `condition` | Number | 0–100 condition score |
| `forSale` | Boolean | Listed on marketplace? |
| `lastPurchasePrice` | Number | Price when last purchased |
| `lastPurchaseDate` | Date | When last purchased |
| `volatility` | Number | 0–1 price volatility factor |
| `regime` | String | Current market regime: bull, bear, stable, recovery, correction, boom |
| `regimeEndTick` | Number | Tick when current regime expires |
| `size` | Number | Property size |
| `location` | String | Location description |
| `developmentLevel` | Number | Building development level (0 = raw land) |
| `buildingType` | String | Type of building |
| `units` | [Object] | Rental units within the property |
| `occupancy` | Number | 0–100 occupancy percentage |
| `maintenanceCost` | Number | Maintenance cost per tick |
| `parentBuilding` | ObjectId? | Reference to parent Property (for units) |
| `lastUpgrade` | String | Name of last applied upgrade |
| `upgrades` | [Object] | Applied upgrades |
| `priceHistory` | [{tick, price}] | Array of historical price data points |

### City

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | City name |
| `country` | String | Country |
| `coordinates` | {lat, lng} | Map position |
| `population` | Number | Current population |
| `demandIndex` | Number | 0–100 demand level |
| `supplyIndex` | Number | 0–100 supply level |
| `growthRate` | Number | % change per tick |
| `avgPrice` | Number | Average property price |
| `propertyCount` | Number | Current property count |
| `totalCapacity` | Number | Max properties allowed |
| `developmentRate` | Number | New property generation rate |
| `activeEvents` | [Object] | Active events with tickers |

### Season

| Field | Type | Description |
| ----- | ---- | ----------- |
| `number` | Number | Season number (unique) |
| `name` | String | Season display name |
| `status` | String | `active` or `completed` |
| `startDate` | Date | When season started |
| `endDate` | Date | When season ended |
| `archive.playerRankings` | [{userId, username, displayName, netWorth, balance, portfolioValue, propertiesOwned, rank}] | Top 100 players |
| `archive.cityStatistics` | [{cityId, name, finalAvgPrice, finalDemandIndex, finalSupplyIndex, propertyCount, population}] | City snapshot |
| `archive.marketStatistics` | {totalTransactions, totalVolume, totalPropertiesTraded, avgPropertyPrice} | Market data |
| `archive.economicStatistics` | {totalCashInCirculation, totalProperties, totalActiveLoans, totalConstructionProjects, tickCount} | Economic snapshot |
| `archive.winner` | ObjectId | User with highest net worth |
| `archive.totalPlayers` | Number | Total players in season |
| `archive.totalTransactions` | Number | Total transactions in season |
| `archive.summary` | String | Season summary text |

### GameState

| Field | Type | Description |
| ----- | ---- | ----------- |
| `key` | String | Always `global` (singleton) |
| `tickNumber` | Number | Current simulation tick |
| `lastTickAt` | Date | Last tick execution timestamp |
| `seasonId` | ObjectId | Reference to current active Season |
| `tickLock` | String | Owner ID of the lock holder (prevents duplicate ticks) |
| `tickLockedAt` | Date | When the lock was acquired (auto-expires after 5 min) |
| `maintenanceMode` | Boolean | Whether maintenance mode is active |
| `maintenanceMessage` | String | Custom maintenance message |
| `maintenanceEnabledAt` | Date | When maintenance was enabled |
| `maintenanceEnabledBy` | ObjectId | Admin who enabled maintenance |

### PropertyOffer

| Field | Type | Description |
| ----- | ---- | ----------- |
| `propertyId` | ObjectId | Property being offered on |
| `sellerId` | ObjectId | Property owner |
| `buyerId` | ObjectId | Potential buyer |
| `offerAmount` | Number | Initial offer price |
| `status` | String | pending, accepted, rejected, countered, expired |
| `counterOffer` | Number? | Counter-offer amount (if countered) |
| `counterBy` | ObjectId? | User who made the counter-offer |
| `expiresAt` | Date | Auto-expiry (48 hours) |

### Notification

| Field | Type | Description |
| ----- | ---- | ----------- |
| `userId` | ObjectId | Recipient |
| `type` | String | property_offer, offer_accepted, offer_rejected, offer_countered, offer_expired, construction_complete, friend_request, system |
| `title` | String | Notification title (translated) |
| `message` | String | Notification body |
| `relatedId` | ObjectId? | Reference to related entity |
| `read` | Boolean | Whether user has viewed it |
| `global` | Boolean | Whether notification applies to all users |

### Transaction

| Field | Type | Description |
| ----- | ---- | ----------- |
| `buyerId` | ObjectId | Buyer user |
| `sellerId` | ObjectId? | Seller user (null for bank sales) |
| `propertyId` | ObjectId? | Property involved (null for loan payments and penalties) |
| `price` | Number | Transaction amount |
| `type` | String | buy, sell, rent, loan, loan_payment, loan_repay, penalty, repossess, construction, upgrade, system |
| `global` | Boolean | Whether this is a system-wide notification |
| `tickNumber` | Number | Tick when transaction occurred |

### Event

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | Event name |
| `description` | String | Detailed description |
| `type` | String | `global` or `local` |
| `impact` | Object | `{ demandDelta, supplyDelta, growthDelta }` |
| `affectedCities` | [ObjectId] | Cities this event targets |
| `duration` | Number | Total tick duration |
| `remainingTicks` | Number | Ticks remaining |
| `active` | Boolean | Currently active? |

### Loan

| Field | Type | Description |
| ----- | ---- | ----------- |
| `userId` | ObjectId | Borrower |
| `principal` | Number | Original loan amount |
| `remainingBalance` | Number | Outstanding balance |
| `interestRate` | Number | Interest per tick (0–1) |
| `durationTicks` | Number | Total loan duration in ticks |
| `ticksRemaining` | Number | Ticks left |
| `paymentPerTick` | Number | Scheduled payment per tick |
| `missedPayments` | Number | Consecutive missed payments |
| `active` | Boolean | Loan active? |

### ConstructionProject

| Field | Type | Description |
| ----- | ---- | ----------- |
| `ownerId` | ObjectId | Project owner |
| `landId` | ObjectId | Land property being developed |
| `cityId` | ObjectId | City where project is located |
| `projectType` | String | Type of construction |
| `projectName` | String | Project display name |
| `category` | String | Project category (residential, commercial, hospitality) |
| `totalCost` | Number | Total construction cost |
| `investedAmount` | Number | Amount invested so far |
| `progress` | Number | 0–100% completion |
| `constructionPeriods` | Number | Total periods required |
| `startPeriod` | Number | Tick when construction started |
| `completionPeriod` | Number | Tick when construction completes |
| `status` | String | planning, under_construction, completed, cancelled |
| `delayTicks` | Number | Cumulative delay ticks |

### Backup

| Field | Type | Description |
| ----- | ---- | ----------- |
| `filename` | String | Server filename |
| `originalName` | String | Original upload filename |
| `size` | Number | File size in bytes |
| `type` | String | `manual`, `scheduled`, or `upload` |
| `status` | String | `pending`, `in_progress`, `completed`, or `failed` |
| `createdBy` | ObjectId | Admin who created the backup |
| `error` | String? | Error message if failed |
| `collections` | Number | Number of collections backed up |
| `duration` | Number? | Backup duration in ms |
| `logs` | [{timestamp, level, message}] | Backup log entries |

### FriendRequest

| Field | Type | Description |
| ----- | ---- | ----------- |
| `senderId` | ObjectId | User who sent the request |
| `receiverId` | ObjectId | User who received the request |
| `status` | String | `pending`, `accepted`, `declined` |

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
| `/friends` | FriendsPage | Yes |
| `/notifications` | NotificationsPage | Yes |
| `/profile` | UserProfilePage (own) | Yes |
| `/profile/:username` | UserProfilePage (other) | Yes |
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
| `npm test` | Run all tests (77 tests across 7 test files) |
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

## Deployment

### CI/CD Pipeline

- **CI**: GitHub Actions runs tests on every push
- **CD**: GitHub Actions builds Docker images for backend, frontend, and Discord bot; pushes to GHCR; updates Kubernetes manifests with commit SHA; pushes to trigger ArgoCD sync (with retry loop for race conditions)
- **ArgoCD**: Monitors the `k8s/` directory in the Git repo and auto-deploys when manifests change

### Kubernetes (K3s)

| Component | Description |
| --------- | ----------- |
| Namespace | `cityflow` |
| MongoDB | StatefulSet with persistent storage |
| Backend | 2-replica Deployment with database-level tick lock |
| Frontend | 2-replica Deployment with nginx serving static files |
| Discord Bot | Single-replica Deployment with NetworkPolicy (egress only) |
| Backup PVC | 5Gi PersistentVolumeClaim (`local-path` StorageClass) for backup storage |
| Ingress | Traefik with Let's Encrypt TLS (TLS-ALPN challenge) |
| SSL | Auto-renewed Let's Encrypt certificate for `cityflow.sizops.co.il` |

### Email Infrastructure

Email is sent via **Brevo SMTP** (`smtp-relay.brevo.com:587`) from the `sizops.co.il` domain:

- **Registration**: Verification email + welcome email sent on signup
- **Email Verification**: Required before login; verification link with 24h token expiry
- **Password Reset**: Reset link sent via email (1h token expiry)
- **System Notifications**: Rent expiry warnings, friend requests, construction alerts
- **Admin**: Test email endpoint and SMTP status check in admin panel
- **Templates**: 8 HTML email templates (password reset, verification, welcome, account activated, system notification, friend request, admin alert, test email)
- **Rate Limiting**: In-memory per-IP rate limiter on registration (5/hr), login (10/15min), resend verification (3/15min), forgot password (3/15min)

**Required DNS records**: SPF, DKIM (`s1._domainkey`), DMARC (`v=DMARC1; p=quarantine`)

### Backup & Restore

Backups are managed entirely from the **Admin Panel** (Database tab). The system uses the native MongoDB driver with gzip compression — no CLI tools required.

**How it works:**
- Backups export every collection as EJSON lines (one document per line), preserving all ObjectIds, dates, and types
- Backup files are stored on a PersistentVolumeClaim (`cityflow-backups`, 5Gi)
- Automatic retention keeps the last **5** backups
- Logs are stored per-backup in the `Backup` collection and visible in the admin panel

**Restore process:**
1. Drops each collection and re-inserts documents with proper ObjectId conversion
2. Restores the `users` collection (including balances, portfolios, settings)
3. Preserves the performing admin user to prevent lockout
4. Validates document counts after restore
5. Frontend clears auth state and redirects to login

**Admin endpoints:**

| Action | Method | Endpoint |
| ------ | ------ | -------- |
| Create backup | POST | `/api/admin/backups` |
| List backups | GET | `/api/admin/backups` |
| Download backup | GET | `/api/admin/backups/:id/download` |
| Upload & restore | POST | `/api/admin/backups/upload` |
| Restore from backup | POST | `/api/admin/backups/:id/restore` |
| Delete backup | DELETE | `/api/admin/backups/:id` |
| View logs | GET | `/api/admin/backups/:id/logs` |

### Docker

All services use multi-stage Docker builds:
- **Builder stage**: Installs dependencies and builds assets using `--platform=$BUILDPLATFORM` for fast cross-compilation
- **Production stage**: Minimal image with only runtime dependencies, non-root user, tini init process (backend & Discord bot)
- **Discord bot**: `node:20-alpine` with tini, single-replica deployment

## Community

### Discord

Join the official CityFlow Discord server for community discussions, game updates, and support:
**[Join CityFlow Discord](https://discord.gg/cityflow)**

The server includes:
- **Verification system** with role assignment
- **Ticket system** for support, bug reports, and partnerships
- **Suggestions board** with community voting
- **Moderation tools** (warnings, mutes, kicks, bans, auto-spam detection)
- **Game integration** — view profiles, leaderboards, and stats from Discord

### Contributing

This project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request. For security vulnerabilities, please see our [Security Policy](SECURITY.md).

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

By contributing to this project, you agree that your contributions will be licensed under the same license.
