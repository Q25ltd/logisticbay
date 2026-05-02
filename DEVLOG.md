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

## Current Status (as of 2026-04-29)

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

### MOBILE — BROKEN (fix first)
✅ All TypeScript errors resolved (2026-04-30) — commit a8b5dc8

### MOBILE — OFFLINE QUEUE (rebuilt 2026-05-02)
✅ src/offlineQueue.ts — rebuilt using POST /sync/events + clientEventId
✅ src/hooks/useNetworkStatus.ts — rebuilt, monitors connection, auto-flushes on reconnect
✅ src/components/OfflineBanner.tsx — active, wired into App.tsx
✅ App.tsx — OfflineBanner + useNetworkStatus wired at navigator level
✅ JobDetail/index.tsx — useIsOnline, optimistic UI when offline, queues to /sync/events
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
⏳ API: deploy to Railway (railway up) + verify migration applies
⏳ Mobile: acceptance test (airplane mode flow)
⏳ Expand offline support to other event types (notes, shift submit)
6. ⏳ Expand to other event types

### MOBILE — TODO
- Detention/waiting timestamps (arrived, loading start, loading finish)
- Full end-to-end test
- Offline queue (save actions locally, sync when online)
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
- ~/timesheet-app/mobile/src/components.tsx — Button, Card, COLOURS, AppFooter
- ~/timesheet-app/mobile/src/constants.ts — vehicle classes, check items
- ~/timesheet-app/mobile/src/screens/HomeScreen.tsx — ⚠️ BROKEN JSX
- ~/timesheet-app/mobile/src/screens/StartShiftScreen.tsx
- ~/timesheet-app/mobile/src/screens/ShiftScreens.tsx — ⚠️ NEEDS SPLIT
- ~/timesheet-app/mobile/src/screens/JobsScreen.tsx
- ~/timesheet-app/mobile/src/screens/JobDetailScreen.tsx — ⚠️ 756 lines
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
