# Notification System Audit — August 2026

Status of the global notification overhaul: **implemented, tested, green** (backend 608/608, frontend 32/32).

## Audit findings (before the overhaul)

1. **No priorities.** Every notification was equal weight — a rent warning and a mission completion both demanded the same attention. No spam control existed.
2. **No categories / no opt-out.** Users could not filter or disable categories.
3. **No batching.** Engine fan-outs (company level-ups, jobs) fired one DB insert + one socket emit per member per event via a loop of individual `createNotification` calls.
4. **Fragile rent expiry lookup.** `sendRentExpiryWarnings()` deduped by `title === 'Rent Collection Warning'` — text-driven, breaks when wording changes.
5. **No "rent ready to collect" notification at all.** Rent silently accumulated in the pool until the expiry warning fired within the last hour.
6. **No retention.** Old read notifications accumulated forever; `cleanupOldRead()` only ran a hardcoded 24-hour sweep inside `GET /notifications`.
7. **No unread cap.** A user's unread list could grow unboundedly.
8. **Unbounded queue mirror.** The Redis `notifications:queue` list replayed via `processNotificationQueue()` after every tick but capped nothing and never emitted (vestigial).

## What was already correct (no duplicate path found)

- **Single funnel**: every notification flows through `enqueueNotification()` → `createNotification()` in `notificationQueue.js`. No direct `Notification.create()` outside tests.
- **DB-level idempotency**: unique partial index `(userId, eventKey)` — concurrent requests, tick retries and socket reconnects can never double-insert.
- **Socket only on creation**: `notification:new` fires only when `created === true`; the queue mirror is a no-op.
- **Daily login**: deduplicated per day through the `daily_login` mission's per-day `MissionProgress` id.

## Changes delivered

### Backend
- **`backend/src/config/notificationConfig.js`** (new): `PRIORITY` (critical/high/medium/low), `CATEGORY` (15 categories), `DEFAULT_PREFERENCES`, `CATEGORY_TO_PREFERENCE`, caps (`MAX_UNREAD_NOTIFICATIONS=300`), retention windows (7/30 days), `MIN_RENT_READY_AMOUNT=100`, `RENT_READY_EVENT_KEY(userId)`, and `getNotificationMeta(eventKey, type)` — priority/category derived from the **eventKey structure**, never from title/message.
- **`backend/src/models/Notification.js`**: `priority` + `category` enum fields, `readAt` timestamp, new indexes for list filtering (`userId,priority,read,createdAt`, `userId,category,createdAt`) and retention (`read,priority,updatedAt`).
- **`backend/src/models/User.js`**: `notificationPreferences` subdoc (8 boolean category keys, all default true).
- **`backend/src/utils/notificationQueue.js`** (reworked):
  - `createNotification()` / `enqueueNotification()` — resolves meta, gates by category preference (critical bypass), drops new LOW-priority items for users at/over the unread cap, supports `{ merge: true }` for recurring reminders.
  - `bulkCreateNotifications(items)` — one `bulkWrite({ ordered: false })` per batch, dedupe on the same unique index, per-user preference gating, unread-cap drop for LOW, socket emit only for inserted rows, capped Redis mirror push.
  - `computeEventKey()` — structural fallback key from `type:entityType:entityId` so callers without an explicit key still get stable dedup without text-based keys.
- **`backend/src/utils/notificationPreferences.js`** (new): `getUserNotificationPreferences` (cached `cf:notif:prefs:{userId}`, 30s), `updateUserNotificationPreferences` (whitelists `DEFAULT_PREFERENCES` keys + cache invalidation), `isNotificationAllowed`.
- **`backend/src/engine/notificationRetention.js`** (new): `runNotificationRetention()` — prunes READ notifications past the window (critical 30d, others 7d; legacy rows fall back to `updatedAt`). Unread never auto-deleted. Runs nightly (scheduler 03:00) + opportunistically from `GET /notifications`.
- **`backend/src/engine/rentProcessing.js`**:
  - `ensureRentReadyNotification()` — merged `rent:ready:{userId}` notice when the pool crosses `MIN_RENT_READY_AMOUNT`; called once per user after each tick's accrual (never per property).
  - `clearRentReadyNotification()` — deletes it on collect/forfeit and emits `notification:deleted`.
  - `sendRentExpiryWarnings()` now dedupes by the `rent:warning:` eventKey prefix instead of title text.
- **`backend/src/routes/notifications.js`**: `GET /notifications?priority=&category=&unread=` filters, `readAt` stamping on read/read-all, `GET/PUT /notifications/preferences`.
- **`backend/src/routes/rent.js`**: POST /collect clears the rent-ready notification.
- **`backend/src/utils/cacheInvalidation.js`**: `notification:new` payload carries `priority`/`category`; new `onNotificationDeleted()` helper for engine-side deletions.
- **`backend/src/engine/scheduler.js`**: 03:00 daily retention job.

### Frontend
- **`NotificationsPage.jsx`**: priority color-coded left border + badge (🔴 Critical / 🟠 High / 🔵 Medium / ⚪ Low), filter tabs (All / Unread / Critical / High).
- **`Navbar.jsx`**: toasts only for `critical`/`high` priority — medium/low just bump the bell badge.
- **`useGameStore.js`**: `fetchNotifications(page, limit, filters)` with `{ priority, category, unread }`; `fetchNotificationPreferences` / `updateNotificationPreferences`.
- **i18n**: EN + HE strings for filters and priority labels.

## Tests added (`backend/src/engine/__tests__/notificationSystem.test.js`, 17 cases)

- Priority/category mapping incl. auction won/outbid → critical, extended → medium, rent expired → critical, mission → high.
- Merge mode: recurring reminder stays ONE row with the latest message; non-merge never overwrites.
- Bulk: same-key dedup within one call, preference suppression, critical bypass, unread-cap drop (LOW dropped, critical passes).
- Preferences: defaults, whitelist-only persistence, `isNotificationAllowed` gating.
- Retention: old read pruned, old unread kept, recent kept, 20-day critical kept, 40-day critical pruned, legacy no-`readAt` rows pruned via `updatedAt`.
- Rent-ready: one merged critical/rent row above minimum, cleared on collect; suppressed below minimum.

## Verification

| Suite | Result |
|---|---|
| Backend ESLint (changed files) | clean |
| Backend tests | **608/608** (baseline 591 + 17 new) |
| Frontend ESLint | clean |
| Frontend tests | 32/32 |
| Frontend build | success |

## Rules for future work

- Always create notifications via `createNotification()` / `bulkCreateNotifications()`; never `Notification.create()` in routes/engine.
- Always pass a stable, content-free `eventKey`; never derive keys from title/message.
- Use `{ merge: true }` for recurring reminders that must stay a single row.
- Use `bulkCreateNotifications()` for engine/tick fan-outs, not loops of single creates.
- New categories need: a `CATEGORY` entry in `notificationConfig.js`, a `CATEGORY_TO_PREFERENCE` mapping, an eventKey rule in `getNotificationMeta()`, and (if surfaced in settings) a `DEFAULT_PREFERENCES` key + EN/HE strings.
- Critical/security notifications must stay gate-proof (bypass preferences and the unread cap).

## Follow-up fix — deleted-notification resurrection (August 2026)

The queue mirror was **NOT** a no-op: `createNotification()` pushed a copy of every
notification onto the Redis `notifications:queue` list, and the scheduler's
`processNotificationQueue()` re-invoked `createNotification()` per item. Because that
call upserts on `(userId, eventKey)`, a notification the user had deleted was
**re-inserted and re-emitted as `notification:new` every minute**.

Fixed in `backend/src/utils/notificationQueue.js`:
- `createNotification()` / `bulkCreateNotifications()` no longer push to Redis — MongoDB
  writes and socket delivery happen synchronously there, so the queue is not a write path.
- `processNotificationQueue()` now only **drains** stale entries left by older versions and
  must never call `createNotification()` for a popped item.
- Regression coverage: `backend/src/engine/__tests__/notificationResurrection.test.js`
  (7 cases) — stale copies of deleted notifications are discarded, never re-inserted;
  queue pushes removed; drain is capped at `BATCH_SIZE`.

