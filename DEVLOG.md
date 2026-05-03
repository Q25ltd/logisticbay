# LogisticBay — Developer Log
# Read this at the start of EVERY chat session

## Project Overview
LogisticBay is a modular logistics operating system for transport companies.
- Planner creates jobs → Driver executes → System records events

## Stack
- API: Fastify + Prisma + PostgreSQL (Node.js/TypeScript)
- Mobile: React Native + Expo SDK 54
- Web: React + Vite + Tailwind
- Deploy: Railway (API) + Vercel (Web)

## Live URLs
- API: https://api-production-cdc9.up.railway.app
- Web: https://logisticbay.com / https://logisticbay.vercel.app
- Railway: https://railway.app/project/5b039bc6-fef3-4aa6-b423-1e1088aaa94b

## GitHub
- API + Web: https://github.com/Q25ltd/logisticbay
- Mobile: https://github.com/Q25ltd/logisticbay-mobile

## Local Paths
- API:    ~/timesheet-app/api
- Mobile: ~/timesheet-app/mobile
- Web:    ~/timesheet-app/web

## Deploy Commands
- API:    cd ~/timesheet-app/api && railway up
- Web:    cd ~/timesheet-app/web && vercel --prod
- Mobile: cd ~/timesheet-app/mobile && npx expo start

---

## Architecture Rules (NEVER BREAK THESE)
1. NEVER trust companyId from frontend — always use request.user.companyId from JWT
2. NEVER hard delete jobs, shifts, drivers — use status fields (soft delete)
3. Every protected API route MUST enforce tenant/company isolation
4. JWT_ACCESS_SECRET for access tokens, JWT_REFRESH_SECRET for refresh tokens
5. CORS restricted to exact domains only
6. Mobile: save draft locally first, sync to API
7. Planner defines work. Driver confirms reality. System records events.

---

## Database
- PostgreSQL on Railway
- Prisma ORM
- Key models: Company, User, CompanyMembership, DriverProfile, PlannedJob, 
  Shift, ShiftSegment, JobExecutionEvent, DriverAvailability, HolidayRequest,
  DriverWorkingTimeSummary, SavedLocation, JobTemplate

## Working Time Rules (UK)
- 60h max per week (hard block)
- 48h average over 17 weeks (warning)
- 11h rest between shifts (warning only — not hard block)
- Spare drivers can end shift with no truck or jobs

---

## Current Status (as of 2026-05-03)

### MOBILE — Nearly Complete
✅ Login with Face ID + company picker
✅ Multi-company support (one person, multiple companies)
✅ Home screen: upcoming jobs preview (read-only), start shift, holidays, history
✅ Start Shift: week plan, truck selection, vehicle class, trailer, GPS
✅ Truck check: odometer at top, defect confirmation ("safe to proceed?")
✅ Trailer check: same flow as truck
✅ Jobs screen: truck banner + trailer banner (tappable), End Shift button
✅ Change Vehicle: mid-shift truck/trailer change, odometer end, fuel, AdBlue
✅ Job Detail: full delivery flow (pending→arrived_pickup→collected→arrived_dropoff→completed)
✅ Vehicle confirmation per job, trailer change detection
✅ After job complete: "Back to Jobs" + "No more jobs — End Shift"
✅ End Shift modal: last vehicle odometer/fuel/AdBlue (skip if spare driver)
✅ EndShift screen: shows calculated totals, no entry fields
✅ Spare driver: can end shift with no truck or jobs
✅ Holiday screen: allowance, request, status
✅ Resume shift → goes to Jobs (not StartShift)
✅ AppFooter "LogisticBay · Q25 Ltd" on main screens
✅ Discard button bigger and easier to tap
✅ Shift flow refactored and pushed — large `ShiftScreens.tsx` split into focused screens
✅ Offline sync UI added globally — banner shows offline/syncing/synced/failed states
✅ Offline sync retry UI added — failed sync shows Retry action
✅ Job events now attach GPS + clientTimestamp when available
✅ Offline event queue hardened with retry metadata, failure state, and crash recovery

### MOBILE — BROKEN (fix first)
✅ All TypeScript errors resolved (2026-04-30) — commit a8b5dc8

### MOBILE — OFFLINE QUEUE (rebuilt 2026-05-02)
✅ src/offlineQueue.ts — rebuilt using POST /sync/events + clientEventId
✅ src/offlineQueue.ts — production-hardened with status, retryCount, createdAt, lastAttemptAt, lastError
✅ src/offlineQueue.ts — backward compatible with old queued events that lack metadata
✅ src/offlineQueue.ts — treats stale `syncing` events as retryable after app crash/restart
✅ src/hooks/useNetworkStatus.ts — monitors connection, auto-flushes on reconnect, tracks failedCount
✅ src/components/OfflineBanner.tsx — active, wired into App.tsx, shows failed state + Retry
✅ App.tsx — OfflineBanner + useNetworkStatus wired at navigator level
✅ JobDetail/index.tsx — useIsOnline, optimistic UI when offline, queues to /sync/events
✅ JobDetail/index.tsx — attaches GPS + clientTimestamp to online and offline job events
⛔ src/apiWithQueue.ts — deprecated stub, do not use

Architecture:
- Job status updates generate a clientEventId (UUID) on device
- Offline: events saved to AsyncStorage, optimistic UI update shown immediately
- Online reconnect: auto-flush via POST /sync/events (idempotent)
- Server: SyncEventLog deduplicates by clientEventId, JobExecutionEvent stores clientEventId
- Migration file: api/prisma/migrations/20260502000000_add_client_event_id_and_sync_log

Build order status:
✅ API: Phase 1 — schema migration (clientEventId, SyncEventLog table)
✅ API: POST /sync/events endpoint (all job status transitions)
✅ API: GPS fields added to JobExecutionEvent via migration `20260503100000_add_gps_to_job_execution_event`
✅ API: sync event GPS validation added (`gpsLat`/`gpsLng` both-or-none, valid ranges)
✅ API: online `/jobs/:id/status` now accepts clientTimestamp + GPS metadata
✅ API: online job update + JobExecutionEvent create now run in one Prisma transaction
✅ API: holiday availability validation separated into its own commit
✅ Mobile: offline queue supports GPS metadata
✅ Mobile: JobDetail attaches GPS + clientTimestamp to online and offline job events
✅ Mobile: offline queue production hardened with retry/failure metadata
✅ Mobile: OfflineBanner shows failed sync + Retry action
⏳ Mobile: acceptance test on installed build / real device production-like network conditions
⏳ Expand offline support to other event types (notes, shift submit)

### MOBILE — TODO
- Detention/waiting timestamps (arrived, loading start, loading finish)
- Full end-to-end test
- Offline queue real-device acceptance test using installed build (not Expo Go Wi-Fi-off)
- Offline login/profile cache and job list cache for true offline app start
- Photo POD (later)

### WEB PLANNER — TODO (next big phase)
- Live shifts view: who is driving, current status, vehicle
- Availability board: see all drivers week plans
- Holiday approvals: approve/reject
- Driver profiles: min hours/day, holiday allowance
- Job list: truck/trailer columns
- One-time location check (GPS snapshot + Google Maps link)

### API — TODO
- Add JWT_ACCESS_SECRET + JWT_REFRESH_SECRET to Railway env vars
- Rotate JWT_SECRET after adding new secrets
- Add API timestamp sanity checks for online `/jobs/:id/status` clientTimestamp
- Add stricter sync payload validation tests and audit review screens later

---

## Code Quality Issues (from audit 2026-04-29)
See full audit in: /mnt/transcripts/journal.txt

Priority fixes needed:
1. ❌ HomeScreen.tsx JSX broken (fix immediately)
2. ❌ ShiftScreens.tsx is 824 lines with 3 screens — split into:
   - EndShiftScreen.tsx
   - ReviewScreen.tsx  
   - (StartShiftScreen.tsx already split out)
3. ❌ Extract mobile/src/utils/shiftTime.ts (time utils buried in ShiftScreens)
4. ❌ Extract mobile/src/constants/jobStatuses.ts (status labels duplicated)
5. ❌ API routes use "body as any" — needs typed interfaces in api/src/types/requests.ts
6. ❌ navigation: any in all screens — needs mobile/src/navigation/types.ts
7. ❌ components.tsx mixes COLOURS + UI — split into theme.ts + components/
8. ❌ useShift() as any — needs proper TypeScript types in ShiftContext.tsx
9. ❌ JobDetailScreen.tsx is 756 lines — split into JobDetail/ folder
10. ❌ planner/index.html is 897-line monolith — migrate to web/src/modules/planner/

---

## Key Files
### API
- ~/timesheet-app/api/src/server.ts — registers all routes
- ~/timesheet-app/api/src/routes/auth.ts — login, register, refresh
- ~/timesheet-app/api/src/routes/companies.ts — drivers, company management
- ~/timesheet-app/api/src/routes/jobs.ts — job CRUD, status flow
- ~/timesheet-app/api/src/routes/shifts.ts — shift lifecycle
- ~/timesheet-app/api/src/routes/availability.ts — availability, holidays, working time
- ~/timesheet-app/api/src/middleware.ts — JWT auth middleware
- ~/timesheet-app/api/prisma/schema.prisma — database schema

### Mobile
- ~/timesheet-app/mobile/App.tsx — navigator, all screens registered
- ~/timesheet-app/mobile/src/AuthContext.tsx — auth state
- ~/timesheet-app/mobile/src/ShiftContext.tsx — shift draft state
- ~/timesheet-app/mobile/src/api.ts — Axios instance with auto-refresh
- ~/timesheet-app/mobile/src/components/OfflineBanner.tsx — global offline/sync/failure banner
- ~/timesheet-app/mobile/src/offlineQueue.ts — offline job event queue, retry/failure metadata, AsyncStorage persistence
- ~/timesheet-app/mobile/src/hooks/useNetworkStatus.ts — network monitor + queue auto-flush + retry trigger
- ~/timesheet-app/mobile/src/components.tsx — legacy/shared components
- ~/timesheet-app/mobile/src/constants.ts — vehicle classes, check items
- ~/timesheet-app/mobile/src/screens/HomeScreen.tsx — ⚠️ BROKEN JSX
- ~/timesheet-app/mobile/src/screens/StartShiftScreen.tsx
- ~/timesheet-app/mobile/src/screens/ShiftScreens.tsx — deleted; split into focused shift screens
- ~/timesheet-app/mobile/src/screens/JobsScreen.tsx
- ~/timesheet-app/mobile/src/screens/JobDetail/index.tsx — job execution flow, online/offline event creation, GPS metadata
- ~/timesheet-app/mobile/src/screens/ChecklistScreen.tsx
- ~/timesheet-app/mobile/src/screens/ChangeVehicleScreen.tsx
- ~/timesheet-app/mobile/src/screens/HolidayScreen.tsx

### Web
- ~/timesheet-app/web/src/main.tsx
- ~/timesheet-app/web/src/App.tsx
- ~/timesheet-app/web/src/api/ — client, auth, jobs, drivers
- ~/timesheet-app/web/src/modules/ — planner, drivers, auth, settings

---

## Job Status Flow
pending → in_progress → arrived_pickup → collected → arrived_dropoff → completed

## Vehicle Flow
1. Start Shift: enter truck reg → do truck check (odometer at top)
2. Trailer: enter reg → do trailer check (if not solo/van)
3. Mid-shift change: Change Vehicle → odometer end + fuel + AdBlue for old → new check
4. End Shift: last vehicle odometer end + fuel + AdBlue → calculated totals shown

## Shift Flow
Start Shift → Jobs screen → tap job → vehicle confirm → 
Start Pickup → Collected → Start Dropoff → Delivered → 
Back to Jobs or End Shift → last vehicle modal → EndShift screen → Review → Submit

---

## Dev Tools
- Reset all shifts: DELETE /dev/reset-shifts (company_owner only)
- Test token: login at logisticbay.com, copy from Network tab

## Notes for New Chat Sessions
- Always read this file first: cat ~/timesheet-app/DEVLOG.md
- Check recent git commits: git -C ~/timesheet-app/api log --oneline -5
- Check mobile commits: git -C ~/timesheet-app/mobile log --oneline -5
- After finishing work, update the STATUS section above
- Commit message format: "feat:", "fix:", "refactor:", "docs:"


---

## 2026-05-02 — Phase 1 Offline Sync (API)

### What was built
- `POST /sync/events` endpoint for receiving offline job events from mobile
- Idempotency enforced by `@@unique([companyId, clientEventId])` — tenant-scoped, not global
- `SyncEventLog` audit table — records every ingest attempt regardless of outcome
- `sync.constants.ts` — single source of truth for review rules (7 day age limit, 1 hour future drift)
- `sync.service.ts` — business logic separated from route handler
- Migration `20260502082357_add_sync_fields` — applied locally, ready for Railway deploy

### New fields on JobExecutionEvent
- `clientEventId` — device-generated UUID, unique per company
- `clientTimestamp` — when event happened on device
- `serverReceivedAt` — when server received it
- `appVersion` — for debugging old client behaviour
- `needsReview` / `reviewReason` — flagged if event is >7 days old or >1 hour in future

### Acceptance test result
- First call with `clientEventId: test-idempotency-001` → `accepted`
- Second call with same `clientEventId` → `duplicate` (not error)
- HTTP 200 on both calls
- One DB row created — idempotency confirmed

### Phase 1 supports only `collected` event type
All other event types rejected with clear error message. More types added in Phase 2.

### Known pre-existing issue (out of scope)
- `shifts.ts` lines 94-95 — CheckItem[] / Json type mismatch — pre-dates this session

### Production deploy instructions
1. Push is done — Railway will auto-deploy the code
2. You must manually run migration on Railway:
   `prisma migrate deploy` with Railway DATABASE_URL
3. Do not run `migrate reset` on production — ever

### TODO Phase 2
- Migrate `JobExecutionEvent.driverId` from User reference to DriverProfile reference
- Add remaining event types: `started`, `arrived_pickup`, `arrived_dropoff`, `completed`
- Mobile integration test with real device offline/online toggle

---

## 2026-05-02 — Phase 2 Sync (API)

### What was built
- Added all remaining job event types to POST /sync/events
- `sync.constants.ts` — SUPPORTED_EVENT_TYPES now includes all 5 event types
- `sync.service.ts` — added `podNumber` and `deliveryNote` to IncomingEvent interface
- `sync.service.ts` — added `buildJobUpdate()` function — single place that maps event type to job status and captured fields

### Event type mapping
| Event type     | Job status set  | Fields captured                                      |
|----------------|-----------------|------------------------------------------------------|
| started        | in_progress     | none                                                 |
| arrived_pickup | arrived_pickup  | none                                                 |
| collected      | collected       | actualQuantity, actualUnit, collectionNote           |
| arrived_dropoff| arrived_dropoff | podNumber, deliveryNote                              |
| completed      | completed       | podNumber, deliveryNote, actualQuantity, actualUnit  |

### No migration needed
All changes are service/constants layer only — no schema changes.

### API sync system is now complete for all job status transitions
Mobile can queue any job event offline and sync it when signal returns.

### Next steps (mobile session)
- AuthContext.tsx — cache token + user profile to SecureStore on login
- On app open — read cached profile, attempt background token refresh
- If offline — use cached profile (access token is 7d TTL, covers full shift)
- Job list — cache to AsyncStorage on fetch, read from cache when offline
- Shift submit — queue to sync when offline

---

## 2026-05-02 — Mobile offline queue bug fixes

### Bugs fixed (mobile commit fa9b830)
Three bugs in the offline queue path that would have prevented sync from working:

1. `QueuedJobEvent.status` renamed to `eventType` — field name now matches `IncomingEvent` on server
2. `STATUS_TO_EVENT_TYPE` map added in `JobDetail/index.tsx` — `in_progress` correctly maps to `started` (the only non-obvious mapping)
3. `flushQueue` filter fixed: `"applied"` → `"accepted"` — matches actual API response
4. `useNetworkStatus.ts` fixed: reads `{ synced, failed }` not `{ results }` — matches actual API response shape

### Online path unaffected
Direct `api.patch` calls in `JobDetail` work as before. Only the offline queue path was broken.

### Current offline sync state
- API: fully complete — all 5 event types, idempotency, audit log ✓
- Mobile queue: fixed — correct field names, correct response parsing ✓
- Mobile offline login: not yet built (AuthContext still calls API on every app open)
- Mobile job list cache: not yet built
- Acceptance test on real device: not yet done

---

## 2026-05-02 — API TypeScript clean

- Fixed pre-existing `shifts.ts` CheckItem[] / Json type mismatch (lines 94-95)
- API TypeScript build now has zero errors across all files
- Commit: a42f035


---

## 2026-05-03 — API offline sync GPS + event metadata hardening

### Commits pushed
- `feat(api): add GPS support to offline sync events`
- `feat(api): validate GPS fields for sync events`
- `feat(api): improve holiday availability validation`
- `feat(api): add GPS metadata to online job events`

### What changed
- Added `gpsLat` and `gpsLng` to `JobExecutionEvent`
- Added migration `20260503100000_add_gps_to_job_execution_event`
- `sync.service.ts` now persists GPS coordinates from `/sync/events`
- `src/routes/sync.ts` validates GPS safely:
  - `gpsLat` and `gpsLng` must be provided together
  - latitude must be between `-90` and `90`
  - longitude must be between `-180` and `180`
- `src/routes/jobs.ts` online status updates now accept:
  - `clientTimestamp`
  - `gpsLat`
  - `gpsLng`
- Online job update and `JobExecutionEvent` creation now run in a Prisma transaction
- `src/types/requests.ts` updated so `UpdateJobStatusBody` includes GPS/timestamp metadata
- Holiday availability and validation changes were split into a separate commit instead of being mixed with sync

### Verification
- `npx tsc --noEmit` passed in API
- Commits pushed to `Q25ltd/logisticbay`

### Important remaining risk
- Offline sync is implemented and type-checked, but not fully real-device field-tested yet
- `clientTimestamp` sanity checking should still be tightened for online `/jobs/:id/status`

---

## 2026-05-03 — Mobile GPS event metadata + production offline queue hardening

### Commits pushed
- `feat(mobile): add GPS fields to offline queue events`
- `feat(mobile): attach GPS and clientTimestamp to job events`
- `feat(mobile): harden offline event queue retries`
- `feat(mobile): production-ready offline sync with failure handling and retry UI`
- `refactor(mobile): shift flow restructuring and UI updates (pre-offline polish)`

### What changed
- `src/offlineQueue.ts`
  - `QueuedJobEvent` now supports `gpsLat` and `gpsLng`
  - queue events now track `status`, `retryCount`, `createdAt`, `lastAttemptAt`, and `lastError`
  - old queued events without metadata are normalized and still sync
  - stale `syncing` events are retryable after app crash/restart
  - failed events are retained instead of silently disappearing
- `src/screens/JobDetail/index.tsx`
  - captures GPS with `expo-location` when available
  - attaches `clientTimestamp`, `gpsLat`, and `gpsLng` to online `/jobs/:id/status`
  - attaches GPS to offline queued job events
  - continues without GPS if permission is denied or location fetch fails
- `src/hooks/useNetworkStatus.ts`
  - tracks `queueSize` and `failedCount`
  - auto-flushes queue on reconnect
  - exposes `triggerSync` for manual retry
  - added explicit `failed` sync state instead of misusing `offline`
- `src/components/OfflineBanner.tsx`
  - shows offline, syncing, synced, and failed states
  - shows failed count
  - exposes Retry action for failed sync
- `App.tsx`
  - passes `failedCount` and `triggerSync` into `OfflineBanner`
- Large shift-flow restructuring was committed separately after the offline commits were isolated

### Verification
- `npx tsc --noEmit` passed in mobile after each sync/offline change
- Commits pushed to `Q25ltd/logisticbay-mobile`

### Current truth
- Offline sync is architecturally production-grade and type-checked
- Offline sync is **not yet field-proven** because real installed-build testing has not been completed
- Do not mark offline as fully accepted until tested on a production-like mobile build, not just Expo Go

### Required acceptance test later
1. Install app build on real device
2. Log in online
3. Load assigned jobs
4. Start shift
5. Disable network / use airplane mode
6. Perform job status actions offline
7. Kill app and reopen
8. Confirm queued actions still exist
9. Re-enable network
10. Confirm banner shows syncing then synced, or failed with Retry
11. Confirm API has correct `JobExecutionEvent` rows with `clientEventId`, `clientTimestamp`, `gpsLat`, `gpsLng`
12. Confirm duplicate retry does not create duplicate events

### Next recommended product phase
- Build Web Planner MVP:
  - job list
  - create job
  - assign driver
  - manual status view/override
- Then return to offline acceptance testing after installable build is available

---

## 2026-05-03 — API cleanup and production sync

### Migrations applied to production
- 20260502082357_add_sync_fields — sync fields on JobExecutionEvent, SyncEventLog table
- 20260502120000_add_poa_mins — POA field on Shift, working time calculation fix
- 20260503100000_add_gps_to_job_execution_event — GPS coords on JobExecutionEvent

### Production database status
All 4 migrations applied and confirmed. Database schema is up to date.

### Railway JWT variables
- Still need confirming in Railway dashboard (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET)

### Next session priorities
1. Check Railway JWT variables
2. Mobile screen review (mobile session only)
3. Standalone build (npx expo run:ios)
4. Real device offline acceptance test
