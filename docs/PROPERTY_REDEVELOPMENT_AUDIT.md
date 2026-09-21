# Property Demolition & Redevelopment — Design & Audit

- **Status:** Implemented (backend + frontend, EN/HE/RTL)
- **Date:** September 2026
- **Type:** Gameplay feature audit (post-implementation review)

## Overview

Every developed building can be **demolished** into cleared land, and that
cleared land can be **redeveloped** into a new building via the standard
development project catalog. The lifecycle is strictly server-authoritative and
tick-driven:

```
building  --demolish-->  land  --redevelop-->  redeveloping  --tick-->  building'
```

- Property `_id`, city, district, owner/company identity and history are
  **preserved** across the whole lifecycle.
- Economy is **server-derived** (`backend/src/config/redevelopment.js`) — the
  client never sends amounts.
- Completion is **tick-driven** (`backend/src/engine/redevelopmentProcessing.js`
  wired after construction in `tick.js`) — no timers, no workers, no client
  authority.
- Acquiring a property after the feature was deployed is safe: purchase resets
  `redevelopment.status` to `none`.

## Money model

| Value | Formula | Notes |
|-------|---------|-------|
| `demolitionCost` | `clamp(demolitionCostBase + value × demolitionCostPercentOfValue, min, max)` | `500,000 + 2%` of `currentPrice`, floor 500k / cap 5M |
| `demolitionSalvage` | `value × demolitionSalvagePercent` (= 40%) | credited back to the player on demolish |
| `clearedLandValue` | `city.avgPrice × locationMultiplier × demandModifier`, **capped at `value × (1 − salvagePercent)`** | cap guarantees `land + salvage ≤ building value` — demolition can never inflate net worth (exploit-proof) |
| net to player | `salvage − cost` (can be positive for very valuable buildings, negative for cheap ones) | credited/debited atomically inside the player lock |

All three constants live in `backend/src/config/redevelopment.js`
(`REDEVELOPMENT_CONFIG`) and are env-overridable; `calculateDemolitionCost`,
`calculateDemolitionSalvage` and `calculateClearedLandValue` are pure and unit
verified in the redevelopment route test (smoke-tested values: cost(50M)=1.5M,
salvage(50M)=20M, land Downtown with avgPrice 100k = 123,500).

## Server authority & concurrency

- **Claim-first CAS**: each mutation re-reads the property, verifies the
  expected `type`/`redevelopment.status`, then applies with a guarded
  `findOneAndUpdate`. A concurrent second demolish/redevelop sees
  `type: 'land'` / `type: 'building'` on re-read and fails with 400/409 — no
  double-charge, no double-demolish, no double-build.
- **Wallet atomicity**: `debitUserBalance` / `creditUserBalance` run inside
  `withUserLock`; company-owned properties charge the company treasury. The
  demolition refund and redevelopment charge settle in the same request.
- **Rollback on failure**: if the payout/charge DB write fails mid-way the
  write is reverted and the property state restored — never pay twice, never
  lose the money, never lose the land.
- **Ledger**: every demolish/redevelop creates a `Transaction` with
  `type: 'demolition'` / `type: 'redevelopment'` (`Transaction` enum extended;
  `RealEstateCompany.treasury.transactions[].type` also extended so company
  deeds don't 500).
- Double-submit protection on the client: the panel's in-flight guard absorbs
  rapid double-clicks, and the server's claim-first CAS is the final authority.

## Guards (server-side, in `backend/src/routes/properties.js`)

Blocked from demolition while any of these hold:

- not an owned building (`type === 'land'`, top-level `developmentLevel === 1`,
  not owned/authorized)
- listed for sale (`forSale`)
- under construction or active improvement (`activeImprovement?.improvementId`,
  `redevelopment.status` in an unfinished state)
- part of a larger building (`parentBuilding`) or has sub-properties
  (`Property.exists({ parentBuilding })`)
- an auction is live on the property (`hasLiveAuction`)

Blocked from redevelopment while: not owned cleared land, listed for sale, in
an auction, or land too small for the chosen project (`Land too small…`).
Management (rent/maintenance) and grade upgrades are blocked while
`redeveloping`; auction creation is blocked while `redeveloping`. Because
auction creation is blocked for `redeveloping` properties **and** demolish/
redevelop are blocked while an auction is live, a property can never be in
`redeveloping` state during auction settlement — the lifecycle states and the
auction lifecycle are mutually exclusive by construction.

## Notifications (idempotent)

- `redevelopment:{propertyId}:demolished` — sent to owner on demolish
- `redevelopment:{propertyId}:started` — sent to owner when redevelopment begins
- `redevelopment:{propertyId}:completed` — sent to owner when the tick engine
  completes the building; company-owned properties fan out with
  `:{userId}` suffix per member (bulk-create, deduped by the `(userId, eventKey)`
  unique index)
- `getNotificationMeta()` (`backend/src/config/notificationConfig.js`)
  categorizes `redevelopment:*` as `CATEGORY.PROPERTY`, `PRIORITY.HIGH`.

All via `createNotification()`/`bulkCreateNotifications()` — never
`Notification.create()` directly in routes.

## Progression integration

- Career engine (`backend/src/engine/careerProcessing.js`): new cases
  `demolitions_completed` and `redevelopments_completed`.
- Achievements (`backend/src/config/achievements.js`): `wrecker_ach`,
  `urban_renewal`, `redeveloper_1`, `redeveloper_10`, `redeveloper_50` (category
  `development`).
- `triggerMissionProgress()` → full pipeline (missions + achievements + XP +
  career cache + `career:updated` socket) on demolish and on redevelopment
  completion, matching the "unified progression pipeline" convention.

## Wall-clock vs tick

Redevelopment construction is **tick-driven**: `startedTick`/`completionTick =
startedTick + constructionPeriods`. Completion is checked:
- in the world tick engine (`processRedevelopments()` in `tick.js` right after
  `processConstruction`), and
- lazily on the status route when a client opens a redeveloping property that
  is already past its completion tick (`finalizeRedevelopmentIfDue`).

`pending`/in-flight counts stay in the DB; there is no wall-clock timing.

## UI & frontend

- `frontend/src/components/RedevelopmentPanel.jsx` — renders the server
  `GET /properties/:id/redevelopment/status` response for owners (direct or
  company manager):
  - `none` → demolition quote (building value, demolition cost, salvage refund,
    net proceeds, demo confirm dialog)
  - `land` → cleared-land value/size + the full rebuild option catalog with
    server-computed `estimatedCost`/`constructionPeriods`/`minLandSize`
    eligibility and per-option confirm
  - `redeveloping` → project name, cost, remaining ticks, scheduled completion
    tick
- Wired into `PropertyPage.jsx` (left column) only when `hasManageAccess`;
  mutations refresh the property and the player balance via `onMutated`.
- Costs displayed are always the server's numbers from the status route — the
  panel never computes or sends amounts.
- i18n: full `redevelopment.*` + error-message keys in `en.json` and `he.json`
  (RTL handled by the existing layout).

## Data model & migration

- `Property.redevelopment` subdocument:
  `{ status: 'none'|'land'|'redeveloping', demolitionCost, demolitionSalvage,
  previousType, demolishedAtTick, startedByUserId, startedAt, startedTick,
  completionTick, completedAt, completedTick, projectType, projectName,
  constructionCost, constructionPeriods, completedCount }`
  plus an index on `redevelopment.status` for engine scans. Safe defaults keep
  pre-existing documents untouched — no data migration required.
- `User.lifetimeStats.totalDemolitions` / `totalRedevelopments` with `$inc`
  (`User` subdocument defaults; no migration).
- `Transaction.type` enum and
  `RealEstateCompany.treasury.transactions[].type` enum extended (Mongoose
  validation at create — no DB migration needed).
- **Season reset: no code change required.** `seasonReset.js` already runs
  `Property.deleteMany({})`, which wipes demolished/redeveloping state along
  with everything else on the world reset. `redeployment` state never
  outlives a season.
- Backup: covered by the dynamic `db.listCollections()` enumeration — no
  hardcoded lists, no `EXCLUDED_BACKUP_COLLECTIONS` entries needed. The
  `backupIntegration` model-coverage test stays green.

## Backward compatibility

- No existing API removed; new endpoints are additive:
  `GET  /properties/:id/redevelopment/status`
  `POST /properties/:id/demolish`
  `POST /properties/:id/redevelop`
- Existing buildings (no `redevelopment` field) read as `status: 'none'`.
- API responses keep prior shapes; new fields appended only.

## Validation performed

- **Backend unit/route tests**: `backend/src/routes/__tests__/redevelopment.test.js`
  — **26/26** covering: ownership/auth, eligibility, incorrect-state 400s
  (building/land/redeveloping), for-sale/auction/construction/improvement
  blockers, money settlement incl. net-positive refund and insufficient-funds
  rejection, concurrent demolish/redevelop claim-first (second caller rejected
  `[400, 409]`), activeImprovement `improvementId` guard (embedded-doc default
  `{ progress: 0 }` truthiness), `Transaction` ledger rows incl. company
  treasury deed, notifications one-per-event, and tick completion of the
  rebuilt building.
- **Backend full suite**: `npm run test` — **90 files / 1344 tests passing**,
  including the affected `auctions`, `managementRent`, `propertyGrade`,
  `propertyXpExploit`, `notificationIdempotency`, `backupIntegration` suites.
  Backend `npm run lint` clean (0 errors; only pre-existing warnings in
  unrelated files).
- **Frontend**: `npm run test` — **62 files / 479 tests passing**
  (new `RedevelopmentPanel.test.jsx` 6/6 and existing `PropertyPage.test.jsx`
  20/20), `npm run lint` clean, `prettier --check` clean, `npm run build`
  green.
- **Mobile e2e (full local stack — Docker Mongo/Redis + real backend + built
  frontend, Playwright headless Chrome)**: `redevelopment-e2e.mjs` —
  **51/51 checks passing** at **390×844** and **412×915**, EN + HE/RTL:
  - tower page renders demolition quote with exact server economics
    ($1.5M cost / $20M salvage / +$18.5M net / $50M value), Demolish button →
    ConfirmDialog opens & cancels
  - land page renders cleared-land value ($200K) → rebuild catalog with 6
    eligible options + "Plot too small" surfaced; Rebuild → ConfirmDialog
    opens & cancels
  - in-progress redevelopment renders project name, remaining ticks and
    scheduled completion tick (Month #56)
  - Hebrew: `direction: rtl`, panel heading + cost label translated
  - no horizontal overflow on every page/viewport; no unhandled JS errors
    (a transient first-login "NEW SYSTEM UNLOCKED" celebration modal was
    dismissed by the harness before interaction).
- Temp e2e artifacts (seed script, preview proxy config, debug scripts, seeded
  user/properties) were removed after the run; the tested backend/frontend code
  itself is unchanged by the harness.

## Files touched

- **New:** `backend/src/config/redevelopment.js`,
  `backend/src/engine/redevelopmentProcessing.js`,
  `backend/src/routes/__tests__/redevelopment.test.js`,
  `frontend/src/components/RedevelopmentPanel.jsx`,
  `frontend/src/components/__tests__/RedevelopmentPanel.test.jsx`
- **Modified:** `backend/src/models/{Property,User,Transaction,RealEstateCompany}.js`,
  `backend/src/engine/tick.js`, `backend/src/engine/careerProcessing.js`,
  `backend/src/config/{notificationConfig,achievements}.js`,
  `backend/src/routes/{properties,auctions,management}.js`,
  `frontend/src/pages/PropertyPage.jsx`,
  `frontend/src/pages/__tests__/PropertyPage.test.jsx`,
  `frontend/src/i18n/{en,he}.json`