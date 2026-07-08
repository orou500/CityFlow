# CityFlow – Global Real Estate Simulation

A full-stack real-time simulation game where players buy, sell, and manage properties across a dynamic global market. Built with Node.js, Express, MongoDB, and React.

## Architecture

```
cityflow/
├── backend/
│   └── src/
│       ├── config/          # DB connection, env vars, dev project defs
│       ├── engine/          # Simulation logic (tick, market, property generation)
│       ├── middleware/       # JWT auth & admin guards
│       ├── models/          # Mongoose schemas
│       ├── routes/          # REST API endpoints
│       ├── seed.js          # Database initializer
│       └── index.js         # Express app entry point
├── frontend/
│   └── src/
│       ├── components/      # Reusable UI (Navbar, WorldMap, ErrorBoundary)
│       ├── i18n/            # Internationalization (en, he)
│       ├── pages/           # Route-level page components
│       └── store/           # Zustand state management
└── .env                     # Environment variables (not tracked)
```

## Features

| Feature | Description |
| ------- | ----------- |
| **Dynamic Market** | City demand/supply indices fluctuate each tick, driving property price changes |
| **Property Generation** | New properties are automatically created each tick based on population, development rate, and demand |
| **Anti-Monopoly** | No player can own more than 5% of a city's total properties |
| **Bank System** | Players can take loans with interest; missed payments have consequences |
| **Player-to-Player Offers** | Negotiate property purchases via offers, counter-offers, accept/reject |
| **Construction & Development** | Buy land, start construction projects, upgrade buildings, manage units |
| **World Map** | Country-level Leaflet map with city clusters, demand-colored pins, and active event markers with impact-based colors and popups |
| **Notifications** | Real-time alerts for offers, trades, and game events; dedicated notifications page with mark-read, delete, and 24h auto-cleanup |
| **Friends** | Add, accept, decline, and remove friends; friend request notifications |
| **Admin Panel** | Full control over simulation, users, properties, cities, events, and construction projects |
| **i18n** | Full English and Hebrew interface with proper RTL support across all components |
| **RTL Support** | Navbar, sidebar, dropdowns, maps, and profile page use logical CSS properties for correct LTR/RTL layout |

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| Frontend | React 18, React Router, Zustand, Tailwind CSS |
| Maps | Leaflet + react-leaflet |
| i18n | react-i18next with JSON translation files |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Scheduling | node-cron |

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

| User | Password | Role |
| ---- | -------- | ---- |
| `admin` | `admin123` | admin |
| `demo` | `demo123` | user |

## Simulation Engine

### Periods (Ticks)

The simulation advances in discrete **ticks** (displayed to players as **periods**). Each tick:

1. Updates city demand/supply indices
2. Adjusts property prices based on market forces
3. Generates new properties in cities below capacity
4. Collects rent for property owners
5. Processes loan repayments
6. Advances construction projects
7. Advances/deactivates events

Ticks run automatically at `TICK_INTERVAL_MINUTES` (default 60) and can be triggered manually via the admin panel.

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

New properties are assigned to the bank (`__system__` user) at a price of `city.avgPrice × locationMultiplier × marketCondition`, capped by `city.totalCapacity`.

### Events

Random or admin-created events affect cities with weighted probability and impact categories:

| Type | Color | Weight | Effect |
| ---- | ----- | ------ | ------ |
| `positive` | Green | 0.35 | Demand spike, price surge |
| `negative` | Red | 0.35 | Demand drop, price decline |
| `neutral` | Blue | 0.30 | Sustained market shift |

Events are rendered on the world map as colored pins (green/red/blue) with popups showing name, description, city, duration, and remaining ticks.

## API Endpoints

### Health

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Server health check |

### Authentication (`/api/auth`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/register` | Create new user |
| POST | `/login` | Login, receive JWT |
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
| PUT | `/language` | Update preferred language |

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
| POST | `/create` | Create an offer on a property |
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

### Admin (`/api/admin`) — requires `admin` role

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/overview` | Global simulation stats |
| GET | `/ticks` | Tick schedule & status |
| POST | `/tick/run` | Execute 1–50 ticks |
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
| GET | `/construction-projects` | List all construction projects |
| PUT | `/construction-projects/:id` | Update a construction project |
| POST | `/construction-projects/trigger-event` | Trigger a construction event |
| GET | `/development-zones` | List city development zones |

## Database Models

### User

| Field | Type | Description |
| ----- | ---- | ----------- |
| `username` | String | Unique display name |
| `email` | String | Unique email |
| `password` | String | bcrypt hash (not returned) |
| `balance` | Number | Cash balance (default 100,000) |
| `ownedProperties` | [ObjectId] | References to Property |
| `role` | String | `user` or `admin` |
| `banned` | Boolean | Whether user is banned |
| `preferredLanguage` | String | `en` or `he` |

### Property

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | Property name |
| `type` | String | apartment, house, commercial, land |
| `cityId` | ObjectId | Reference to City |
| `ownerId` | ObjectId? | Current owner (nullable) |
| `basePrice` | Number | Original price |
| `currentPrice` | Number | Current market price |
| `rent` | Number | Rent per tick |
| `condition` | Number | 0–100 condition score |
| `forSale` | Boolean | Listed on marketplace? |
| `volatility` | Number | 0–1 price volatility factor |
| `developmentLevel` | Number | Building development level |
| `units` | [Object] | Rental units within the property |
| `upgrades` | [Object] | Applied upgrades |
| `priceHistory` | [Object] | Array of {price, tick, date} |

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
| `color` | String | Map marker color |

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
| `type` | String | property_offer, offer_accepted, offer_rejected, offer_countered, offer_expired |
| `title` | String | Notification title (translated) |
| `message` | String | Notification body |
| `relatedId` | ObjectId? | Reference to related entity |
| `read` | Boolean | Whether user has viewed it |

### Transaction

| Field | Type | Description |
| ----- | ---- | ----------- |
| `buyerId` | ObjectId | Buyer user |
| `sellerId` | ObjectId? | Seller user (null for first purchase) |
| `propertyId` | ObjectId | Property involved |
| `price` | Number | Sale price |
| `type` | String | buy, sell, rent, loan, construction, upgrade |
| `tickNumber` | Number | Tick when transaction occurred |

### Event

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | String | Event name |
| `description` | String | Detailed description |
| `type` | String | boom, recession, disaster, policy |
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

### GameState

| Field | Type | Description |
| ----- | ---- | ----------- |
| `key` | String | Always `global` (singleton) |
| `tickNumber` | Number | Current simulation tick |
| `lastTickAt` | Date | Last tick execution timestamp |
| `lastTickDuration` | Number | Last tick duration in ms |

### ConstructionProject

| Field | Type | Description |
| ----- | ---- | ----------- |
| `ownerId` | ObjectId | Project owner |
| `landId` | ObjectId | Land property being developed |
| `cityId` | ObjectId | City where project is located |
| `projectType` | String | Type of construction |
| `projectName` | String | Project display name |
| `category` | String | Project category |
| `totalCost` | Number | Total construction cost |
| `investedAmount` | Number | Amount invested so far |
| `progress` | Number | 0–100% completion |
| `constructionPeriods` | Number | Total periods required |
| `startPeriod` | Number | Tick when construction started |
| `completionPeriod` | Number | Tick when construction completes |
| `status` | String | pending, in_progress, completed, delayed |
| `delayTicks` | Number | Cumulative delay ticks |

## Scripts

### Backend (cd backend/)

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start backend server (port 5000) |
| `npm run seed` | Seed/refresh database with cities and users |
| `npm start` | Start backend in production mode |

### Frontend (cd frontend/)

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start Vite dev server (port 3000) |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |

## Frontend Routes

| Path | Component | Auth Required |
| ---- | --------- | ------------- |
| `/` | MapPage | No |
| `/city/:id` | CityDashboard | No |
| `/property/:id` | PropertyPage | Yes |
| `/dashboard` | PlayerDashboard | Yes |
| `/bank` | BankPage | Yes |
| `/development` | DevelopmentPage | Yes |
| `/marketplace` | Marketplace | Yes |
| `/friends` | FriendsPage | Yes |
| `/notifications` | NotificationsPage | Yes |
| `/profile/:username` | UserProfilePage | No |
| `/admin` | AdminPage | Admin only |
| `/login` | LoginPage | Guest only |
| `*` | NotFoundPage | No |

## License

MIT
