<img width="1536" height="1024" alt="logo-text" src="https://github.com/user-attachments/assets/590d9e0b-4b9c-44b9-84a2-353450cfb036" />

<img width="2560" height="1326" alt="Screenshot 2026-07-10 012228" src="https://github.com/user-attachments/assets/e48b6b53-2ef4-42a1-bcb3-9bf3672461fa" />

# CityFlow – Global Real Estate Simulation

A full-stack real-time multiplayer simulation game where players buy, sell, develop, and manage properties across a dynamic global market. Built with Node.js, Express, MongoDB, and React. Deployed on Kubernetes with ArgoCD, Let's Encrypt SSL, and automated CI/CD.

## Architecture

```
cityflow/
├── backend/
│   └── src/
│       ├── config/          # DB connection, env vars, dev project defs
│       ├── engine/          # Simulation logic (tick, market, season reset, property generation)
│       ├── middleware/       # JWT auth & admin guards
│       ├── models/          # Mongoose schemas (User, Property, City, Season, GameState, etc.)
│       ├── routes/          # REST API endpoints
│       ├── test/            # Test setup, helpers, and MongoDB Memory Server config
│       ├── seed.js          # Database initializer
│       └── index.js         # Express app entry point
├── frontend/
│   └── src/
│       ├── components/      # Reusable UI (Navbar, WorldMap, OnboardingWrapper, WorldStatusWidget)
│       ├── i18n/            # Internationalization (en, he)
│       ├── pages/           # Route-level page components
│       └── store/           # Zustand state management
├── k8s/                     # Kubernetes manifests (namespace, deployments, ingress, etc.)
├── .github/workflows/       # CI/CD pipelines (build, test, deploy)
└── .env                     # Environment variables (not tracked)
```

## Features

| Feature | Description |
| ------- | ----------- |
| **Dynamic Market** | City demand/supply indices fluctuate each month, driving property price changes |
| **Property Generation** | New properties are automatically created each month based on population, development rate, and demand |
| **Anti-Monopoly** | No player can own more than 5% of a city's total properties |
| **Bank System** | Players can take loans with interest; missed payments lead to penalties and repossession |
| **Player-to-Player Offers** | Negotiate property purchases via offers, counter-offers, accept/reject (min 70% of market value) |
| **Construction & Development** | Buy land, build from 8 project types (residential, commercial, hospitality), upgrade buildings with 4 upgrade types |
| **World Map** | Interactive Leaflet map with 18 cities, demand-colored pins, active event markers, and World Status Widget |
| **World Events** | Dynamic events (Boom, Recession, Disaster, Policy) affect local or global markets with real-time impact |
| **Seasons** | Game runs in 720-month seasons with automatic resets, full archive of rankings, and fresh starts |
| **Season Leaderboards** | View past season champions, top-20 player rankings, city statistics, and economic data |
| **Player Season History** | Each profile shows the player's rank and stats across all completed seasons |
| **Notifications** | Real-time alerts for offers, trades, construction, and friend requests; auto-cleanup after 24h |
| **Friends** | Add, accept, decline, and remove friends; view friends' net worth and portfolios |
| **User Profiles** | Customizable avatars, display names, bio, portfolio visibility, season history, achievements |
| **Legal & Compliance** | Terms of Service, Privacy Policy, Cookie Policy pages with registration acceptance |
| **Onboarding** | 10-step guided tour for new players covering all game features |
| **Admin Panel** | Full control over simulation, users, properties, cities, events, seasons, and manual tick execution |
| **i18n** | Full English and Hebrew interface with proper RTL support across all components |
| **Dark Mode** | Dark, Light, and System theme toggle |
| **Database-Level Tick Lock** | Prevents duplicate tick execution in multi-replica deployments using MongoDB lock documents |

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

- Node.js 18+
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
4. Collects rent for property owners
5. Processes loan repayments
6. Advances construction projects
7. Balances market supply
8. Advances/deactivates events
9. Generates new properties and events

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

- **Demand Index** (0–100): fluctuates per city each tick
- **Supply Index**: inversely related to demand
- **Price Movement**: `currentPrice += currentPrice × volatility × (demandIndex/100 - 0.5)`
- **Rent**: 0.4% of current price per tick

### Property Generation

Each tick, the engine creates new properties for cities that have room:

```
newProperties = population × developmentRate × (demandIndex / 100)
```

New properties are assigned to the bank (`ownerId: null`) at a price of `city.avgPrice × locationMultiplier × marketCondition`, capped by `city.totalCapacity`.

### Events

Random or admin-created events affect cities with weighted probability and impact categories:

| Type | Color | Weight | Effect |
| ---- | ----- | ------ | ------ |
| `positive` | Green | 0.35 | Demand spike, price surge |
| `negative` | Red | 0.35 | Demand drop, price decline |
| `neutral` | Blue | 0.30 | Sustained market shift |

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
| POST | `/register` | Create new user (requires `confirmPassword`, `acceptedTerms`, `acceptedPrivacy`) |
| POST | `/login` | Login with username or email, receive JWT |
| GET | `/me` | Get current user profile |

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
| GET | `/:username` | Get user profile with properties, portfolio value, season history |
| PUT | `/settings` | Update display name, bio, portfolio visibility |
| PUT | `/password` | Change password |
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
| POST | `/upgrade` | Upgrade a building |

### Friends (`/api/friends`) — requires authentication

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | List friends |
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

## Database Models

### User

| Field | Type | Description |
| ----- | ---- | ----------- |
| `username` | String | Unique display name |
| `normalizedUsername` | String | Lowercase username (unique index, case-insensitive lookups) |
| `email` | String | Unique email |
| `password` | String | bcrypt hash (not returned) |
| `balance` | Number | Cash balance (default 100,000) |
| `ownedProperties` | [ObjectId] | References to Property |
| `role` | String | `user` or `admin` |
| `banned` | Boolean | Whether user is banned |
| `preferredLanguage` | String | `en` or `he` |
| `avatar` | String | Profile picture URL |
| `displayName` | String | Custom display name |
| `bio` | String | User bio |
| `achievements` | [String] | Earned achievements |
| `acceptedTerms` | Boolean | Terms of Service accepted |
| `acceptedPrivacy` | Boolean | Privacy Policy accepted |
| `onboarding.completed` | Boolean | Whether onboarding tour is completed |
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
| `volatility` | Number | 0–1 price volatility factor |
| `developmentLevel` | Number | Building development level |
| `units` | [Object] | Rental units within the property |
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
| `type` | String | property_offer, offer_accepted, offer_rejected, offer_countered, offer_expired, construction_complete, friend_request |
| `title` | String | Notification title (translated) |
| `message` | String | Notification body |
| `relatedId` | ObjectId? | Reference to related entity |
| `read` | Boolean | Whether user has viewed it |

### Transaction

| Field | Type | Description |
| ----- | ---- | ----------- |
| `buyerId` | ObjectId | Buyer user |
| `sellerId` | ObjectId? | Seller user (null for bank sales) |
| `propertyId` | ObjectId | Property involved |
| `price` | Number | Sale price |
| `type` | String | BUY, SELL, RENT, LOAN, LOAN PMT, REPAY, PENALTY, REPOSSESS, BUILD, UPGRADE |
| `tickNumber` | Number | Tick when transaction occurred |

### Event

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | Event name |
| `description` | String | Detailed description |
| `type` | String | boom, recession, disaster, policy |
| `scope` | String | local or global |
| `impact` | Object | Effect on demand/price |
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
| `status` | String | pending, under_construction, completed |
| `delayTicks` | Number | Cumulative delay ticks |

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
| `npm test` | Run all tests (59 tests across 5 test files) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run format` | Check code formatting with Prettier |

### Frontend (cd frontend/)

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start Vite dev server (port 3000) |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |

## Deployment

### CI/CD Pipeline

- **CI**: GitHub Actions runs tests on every push
- **CD**: GitHub Actions builds Docker images, pushes to GHCR, updates Kubernetes manifests with commit SHA, and pushes to trigger ArgoCD sync
- **ArgoCD**: Monitors the `k8s/` directory in the Git repo and auto-deploys when manifests change

### Kubernetes (K3s)

| Component | Description |
| --------- | ----------- |
| Namespace | `cityflow` |
| MongoDB | StatefulSet with persistent storage |
| Backend | 2-replica Deployment with database-level tick lock |
| Frontend | 2-replica Deployment with nginx serving static files |
| Ingress | Traefik with Let's Encrypt TLS (TLS-ALPN challenge) |
| SSL | Auto-renewed Let's Encrypt certificate for `cityflow.sizops.co.il` |

### Docker

Both backend and frontend use multi-stage Docker builds:
- **Builder stage**: Installs dependencies and builds assets using `--platform=$BUILDPLATFORM` for fast cross-compilation
- **Production stage**: Minimal image with only runtime dependencies, non-root user, tini init process (backend)

## License

MIT
