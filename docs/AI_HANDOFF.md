# CityFlow AI Handoff

## Current architecture

### Backend
- Express + Mongoose + MongoDB, with a large simulation engine under `backend/src/engine/`
- Tick-driven simulation, auctions, property lifecycle, company operations, notifications, missions, and economy logic
- Redis-backed cache and rate-limit utilities, plus socket emitters for realtime updates
- Test suite runs with Vitest and mongodb-memory-server

### Frontend
- React + Vite SPA with Zustand stores and route-level pages
- i18n for English/Hebrew with RTL support
- Mobile-capable frontend via Capacitor

### Shared project rules
- Preserve production data and existing APIs
- Prefer server-side authority for gameplay transitions
- Keep backward compatibility for old data and legacy payloads
- Support both English and Hebrew strings in UI changes

---

## What OpenCode completed

The repository state shows recent work focused on auction integrity and company ownership logic, including:

- Auction settlement dedupe and idempotency protections
- Winner selection derived from valid persisted bids instead of synthetic or stale identities
- Company-bid attribution fixes so winning company ownership is assigned to the company, not the approving voter
- Recovery logic for orphaned or stuck auction properties
- Regression tests for auction settlement and company IPO requirements
- Frontend changes around the auction dashboard and company detail pages

The current codebase validates that this recent work is functioning as intended.

---

## What remains

After the audit, no critical unfinished feature work was found that required a new implementation patch in this session. The main remaining work is operational and maintenance-oriented:

- Keep the repo synchronized with the real production environment
- Continue watching for edge-case regressions in high-activity gameplay systems
- Review large frontend bundle warnings and optimize chunking if performance becomes an issue
- Keep the handoff doc updated as the project evolves

---

## Known bugs / warnings

- Frontend Vite build emits a bundle-size warning for large chunks, but the build still succeeds.
- The backend test output includes a noisy Mongo connection-close warning at test teardown; it does not fail the suite and appears to be a test cleanup artifact, not a production issue.
- There are no TODO/FIXME markers in the current codebase that indicate a blocked OpenCode implementation.

---

## Important technical decisions

- Auction settlement must be atomic and idempotent: the active-to-ending transition is the authoritative guard against duplicate settlement.
- Winner identity is resolved from persisted bid history, never from synthetic or stale system actors.
- Company IPO checks are enforced on the backend, with level, treasury, member count, property count, and net-worth thresholds treated as authoritative.
- Existing data is intentionally preserved; no destructive migration or reset logic was identified in the current branch state.

---

## Current test status

### Backend
- `npm test` in `backend`: PASS
- 66 test files passed
- 917 tests passed

### Frontend
- `npm run lint`: PASS
- `npm test`: PASS
- `npm run build`: PASS
- Build warning only: large bundle sizes, no failure

---

## Current deployment status

- Repository is on `main`
- `origin/main` is behind by 3 commits in the local view, so the working tree should be treated as a local workspace state, not necessarily as the remote production tip
- No deployment actions were performed during this audit
- The project appears ready to keep developing from the current branch without resetting or rebuilding completed systems

---

## Recommended next tasks

1. Continue with the next product feature or bugfix only after confirming it is not already implemented in the active branch.
2. Keep the auction and company systems under regression coverage whenever changes touch ownership, settlement, or public listing logic.
3. If performance becomes a priority, address the frontend bundle-size warning with lazy loading or code splitting.
4. Use this handoff file as the source of truth for future AI or human continuation work.
