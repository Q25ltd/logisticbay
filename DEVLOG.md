# LogisticBay — Developer Log & Architecture Charter

> **Read this at the start of every chat session and before every PR review.**
> Last updated: 2026-05-12

LogisticBay is being built for extreme, unbounded tenant growth: thousands to millions of tenant companies and records that may grow from millions into billions or trillions over time. Every engineer must internalise the rules in this document before writing code. The rules are not aspirational — they are enforced in code review, in CI, and in production checks.

---

## North Star

**No unbounded data access, ever.** Every query, every list, every dashboard, every background job, every AI/smart feature is scoped to a single `companyId` and bounded in size. There are no exceptions for "internal admin tools" or "quick fixes."

The mental model:
1. `companyId` first
2. Bounded query second
3. Indexed path third

---

## Project Overview

LogisticBay is a modular logistics operating system for transport companies.

- Planner creates jobs → Driver executes → System records events
- Planner defines work. Driver confirms reality. System records events.

## Stack

- **API:** Fastify + Prisma + PostgreSQL (Node.js / TypeScript)
- **Mobile:** React Native + Expo SDK 54
- **Web:** React + Vite + Tailwind
- **Deploy:** Railway (API) + Vercel (Web)
- **Planned additions:** Redis (cache + queues), S3/R2 (file storage), Sentry (error tracking), TimescaleDB or equivalent (GPS telemetry, later)

## Live URLs

- **API:** https://api-production-cdc9.up.railway.app
- **Web:** https://logisticbay.com / https://logisticbay.vercel.app
- **Railway project:** https://railway.app/project/5b039bc6-fef3-4aa6-b423-1e1088aaa94b

## GitHub

- **API + Web:** https://github.com/Q25ltd/logisticbay
- **Mobile:** https://github.com/Q25ltd/logisticbay-mobile

## Local Paths

- **API:** `~/timesheet-app/api`
- **Mobile:** `~/timesheet-app/mobile`
- **Web:** `~/timesheet-app/web`

## Deploy Commands

- **API:** `cd ~/timesheet-app/api && railway up`
- **Web:** `cd ~/timesheet-app/web && vercel --prod`
- **Mobile:** `cd ~/timesheet-app/mobile && npx expo start`

---

## Architecture Rules — UNBREAKABLE

These rules apply to every file, every endpoint, every feature. A PR that breaks any of them is rejected.

1. **NEVER trust `companyId` from the frontend.** Always use `request.user.companyId` from the verified JWT.
2. **NEVER hard-delete jobs, shifts, drivers, customers, vehicles, or trailers.** Use status fields (soft delete) so audit trail and reporting survive.
3. **Every protected API route MUST enforce tenant isolation.** No exceptions for "admin" routes — admins also belong to a tenant.
4. **JWT_ACCESS_SECRET for access tokens, JWT_REFRESH_SECRET for refresh tokens.** They must be different values, rotated on a schedule.
5. **CORS is restricted to exact domains only.** No wildcards in production.
6. **Mobile saves draft locally first, then syncs to API.** Network is treated as unreliable by default.
7. **Planner defines work. Driver confirms reality. System records events.** This is the source-of-truth contract for every screen.
8. **Every operational record AND every query against high-volume tables must be tenant-scoped by `companyId`.**
9. **Never build list, dashboard, search, or report pages that load all company data into the browser.** Server-side filtering and pagination only.
10. **Every new list/search/report endpoint must define filters, pagination, max rows, and supporting indexes** before merge.
11. **Never use `COUNT(*)` on a tenant-scoped table over 100k rows.** Use precomputed counters or approximate counts (`10,000+`).
12. **Never call an LLM with cross-tenant data in the prompt context.** Vector index, retrieval, and prompt assembly are all `companyId`-scoped.
13. **Background jobs always carry `companyId` in their payload** and process one tenant at a time, with per-tenant fairness.
14. **Every public-facing endpoint has rate limits** per tenant, per user, and per IP.
15. **Every state change is auditable** — who, what, when, from where, with before/after diff for sensitive fields.
16. **Every write endpoint accepts an idempotency key.** Retries must never produce duplicate records.
17. **Mobile clients send `X-App-Version`.** API can refuse below `minSupportedVersion`.
18. **No secrets in git, no secrets in mobile bundles, no secrets in client-side env vars.** Server-side only.

---

## Tenant Isolation — The Inviolable Discipline

Tenant isolation is the single most important rule in this codebase. Get it wrong and one customer sees another customer's data — that is a company-ending event.

### Application layer (primary control)

- Every Prisma query starts with `where: { companyId: req.user.companyId, ... }`
- Every related ID (`driverId`, `jobId`, `customerId`, `siteId`, etc.) is validated to belong to the same `companyId` **before use**, not after
- Repository pattern is mandatory: route handlers never call `prisma.x.findMany(...)` directly. Use typed repositories that require `companyId` as the first argument
- Lint rule (planned, Phase 0): block direct `prisma.*` access from route handlers in CI

### Database layer (defense in depth)

- Postgres Row-Level Security (RLS) policies on every tenant-scoped table
- Connection-level `SET app.current_tenant` for the request lifetime
- Foreign keys composite with `companyId` wherever possible
- Audit any query plan that does not start with a `companyId` index seek

### AI / LLM layer

- Every retrieval step is `companyId`-scoped before it reaches the model
- Hard cap on retrieved rows (top-K) and a token budget enforced before prompt assembly
- Prompt context never mixes tenants — even by accident, even in shared examples
- Vector index is partitioned by `companyId` (separate namespaces, not a shared index with filters)

### Background jobs

- Every job has a `companyId` in its payload
- Per-tenant queues or weighted fair queueing — one large tenant cannot starve everyone else
- Tenant suspension / billing-blocked flag is checked before processing
- Job processing logs include `companyId` in every line

### Tenant deletion / suspension

- Soft-delete first, hard-delete after a documented retention period
- Hard-delete cascades to: operational tables, file storage, search indexes, vector embeddings, cache entries, audit logs (with regulator-compliant retention exception)
- Tested at least twice a year against a synthetic tenant

---
# Core Rule: Data Quality First

Strict information. Flexible operations.

LogisticBay is an operational system.
Its value depends on clean, structured, trustworthy information.

We do not compromise data quality for speed, convenience, or flexible free-text entry.

Target operational model:
- Main Job = commercial/customer container
- Job Part = executable transport movement
- Run = planner execution grouping
- Event = immutable operational truth record

Every field added to the system must have a clear operational purpose.

A field is allowed only if it supports one or more of:
- planning
- execution
- tracking
- status calculation
- risk detection
- recovery suggestions
- reporting/audit
- future automation

If a field does not improve operational truth, do not add it.

Core operational logic must never depend on parsing free text.

Free text is only for:
- notes
- comments
- explanations
- exception details
- human communication

Core logic must use:
- structured fields
- controlled enums
- relations
- timestamps
- IDs
- system-generated events

If information can be represented as a structured field, enum, relation, timestamp, or event, it must not exist only in notes.

The system must filter and validate information before it enters the database, not collect garbage and attempt cleanup later.

Forms should be strict in information collection while allowing flexible operational execution through:
- Job Parts
- Runs
- reassignment
- splitting
- merging
- event tracking

Operational truth should be preserved through append-only events where possible, not destructive state overwrites.

No duplicate meanings.
No vague statuses.
No ambiguous references.
No optional fields without operational purpose.
No “notes as logic.”

One operational concept = one canonical internal name.

### Canonical Naming Discipline

UI labels may differ by audience (customer, planner, driver),
but internal names must stay canonical across:
- database columns
- APIs
- shared schemas
- events
- planners
- mobile
- marketplace
- integrations

Example:
- UI label: "Address line 1"
- Canonical field: `street`

Example:
- UI label: "Company / site name"
- Canonical field: `siteName`

Never create aliases for the same operational meaning.

Bad:
- addressLine1
- streetAddress
- street1

Good:
- street

The same operational meaning must always use the same internal name.

UI labels may vary by audience, but database fields, APIs, shared schemas, and internal logic must use canonical names consistently across the system.

### The Two Canonical Entry Points

The entire system is data manipulation. All operational value comes from the quality of structured data that flows through it. Quantity of data does not matter — quality does. Garbage in means garbage out at every downstream step: planning, allocation, execution, reporting, automation.

The two primary entry points where data enters the system are:

1. **Public job request form** (`/request`) — customer or broker submits a transport request. This is the first moment operational data is captured. Every field collected here must be structured, canonical, and immediately usable without planner cleanup.

2. **Job creation / edit form** (planner web) — planner creates or refines a job from a request or from scratch. This is where the request becomes a dispatched job with stops, vehicle requirements, and assignments.

These two forms are the most important screens in the system. They are the gates. If data quality is poor at intake, every downstream feature — driver allocation, routing, reporting, AI suggestions — is degraded or impossible.

**Rule for every agent working on these forms:**
- Every field must be structured (enum, relation, number, date) unless it is explicitly a notes/comments field.
- Free text is never acceptable for anything that will drive logic, filtering, matching, or reporting.
- A field that cannot be used programmatically without parsing free text should not exist.
- Prefer fewer high-quality fields over many vague ones.
- If a field cannot be explained with: "this field is used to [specific operational decision]", it should not be added.

### Structured Intake Rule

Public forms, planner forms, APIs, imports, and integrations must collect structured operational data at intake time whenever possible.

The system should guide users toward:
- controlled options
- structured selections
- reusable locations
- reusable templates
- validated references
- canonical values

instead of relying on free-text explanations.

The goal is to reduce:
- planner clarification calls
- driver confusion
- operational mistakes
- manual cleanup
- impossible automation later

Before adding any new:
- form field
- database column
- enum
- status
- event type
- relationship

the developer must explain:
1. What operational decision this data supports
2. Whether it should be a structured field, enum, relation, timestamp, or note
3. How it affects Main Job, Job Part, Run, or Event logic
4. What happens if the data is missing, wrong, duplicated, or changed later


## Database & Scale Architecture

Target scale: **unbounded tenant and record growth.** The first rollout may have thousands of companies and millions of rows, but the architecture must not depend on totals staying below any fixed number.

### Required indexes (must exist before scale rollout)

- `PlannedJob`: `(companyId, plannedDate)`, `(companyId, status)`, `(companyId, assignedDriverId)`, `(companyId, customerId)`, `(companyId, updatedAt)`
- `JobExecutionEvent`: `(companyId, jobId, createdAt)`, `(companyId, clientEventId UNIQUE)`
- `Shift`: `(companyId, driverId, startedAt)`, `(companyId, status)`
- `ShiftSegment`: `(companyId, shiftId, startedAt)`
- `FleetUnit` / `FleetTrailer`: `(companyId, status)`, `(companyId, registration)` now; add `(companyId, registration UNIQUE)` only after duplicate cleanup/runbook
- `User` / `CompanyMembership`: `(companyId, userId UNIQUE)`
- Search indexes: Postgres `pg_trgm` + GIN for references, customers, sites, route text — migrate to dedicated search service when any indexed table exceeds 5M rows

### Pagination contract

Every list endpoint must:

- Use cursor-based pagination (NOT offset) for any table that may exceed 1M rows
- Enforce a hard max page size: 100 default, 500 absolute maximum
- Require filter parameters (date range, status, etc.) for tables over 1M rows
- Sort only on indexed columns
- Include a `hasMore` flag and a `nextCursor` value

### Counters and summaries

- `COUNT(*)` on tenant-scoped tables is forbidden over 100k rows
- Pre-aggregated daily and weekly summary tables for dashboards
- Approximate counts in UI (`10,000+`) are acceptable and preferred at scale
- Counters are maintained on write (triggers, CDC, or app-layer atomic increments) — never on read

### Dashboard architecture

- Dashboard data is served by a dedicated server endpoint such as `/dashboard?date=YYYY-MM-DD`
- The frontend never fetches all jobs/customers/drivers/trailers and filters locally
- Server-computed summaries, cached or pre-aggregated for high-traffic tenants
- Warning summaries (working time, holiday clashes, missing assets) are computed server-side, ideally pre-aggregated

---

## PRIORITY ROADMAP — What to build when

This is the most important section for engineering planning.

**Principle:** anything cheap to add now and expensive to retrofit later goes in Phase 0 or Phase 1. Anything we can add cleanly when the customer demands it can wait.

### Phase 0 — Foundations (MUST exist before any tenant-shared production traffic)

These look optional but are 10x harder to retrofit. Build them now.

| # | Item | Cost now | Cost later if skipped |
|---|------|----------|----------------------|
| 0.1 | Tenant isolation in the data layer (composite indexes, Prisma middleware, RLS policies) | 1–2 weeks | Full audit + rewrite of every endpoint |
| 0.2 | Structured logging with correlation IDs (Pino, redaction, `requestId` + `companyId` + `userId` in every line) | 2 days | Cannot debug a production incident |
| 0.3 | Audit log table (actor, action, before/after diff, IP, userAgent, append-only) | 3 days | Regulator asks for it and you don't have it |
| 0.4 | Backup strategy + tested restore (RPO 5 min, RTO 1 hour, point-in-time recovery, quarterly drills) | 1 day | Catastrophic data loss |
| 0.5 | Error tracking (Sentry on API, web, mobile, tagged with `companyId`, `userId`, `releaseVersion`) | 1 day | Blind to production failures |
| 0.6 | Schema migration discipline (reversible, online-only, runbook per migration, no blocking ALTER on big tables) | Ongoing discipline | Hours of downtime per migration |
| 0.7 | Idempotency on every write endpoint (extend the `/sync/events` pattern to all writes) | 2 days | Duplicate records from retries are forever |
| 0.8 | API versioning strategy (`/v1/jobs`, `/v2/jobs`, `X-App-Version` header, 6-month deprecation policy) | 1 day | Cannot ship breaking changes without bricking old mobile installs |
| 0.9 | Environment separation (dev → staging → prod, separate databases, no production data in staging) | 2 days | Developers test in production |
| 0.10 | Secrets management (`JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET`, rotation runbook, no secrets in git or client bundles) | Ongoing | Leaked secret + no rotation = full incident |
| 0.11 | Per-write request validation with zod or typebox schemas (replace `body as any` everywhere) | 3 days | Type drift, runtime errors, security holes |
| 0.12 | CI gates: typecheck, lint, unit tests, tenant-isolation integration test on every PR | 2 days | Regressions ship to production |

### Phase 1 — Pre-launch (must exist before first paying customer)

| # | Item | Notes |
|---|------|-------|
| 1.1 | Rate limiting (per IP, per user, per tenant, per endpoint class) | Redis-backed counters |
| 1.2 | Per-tenant cost attribution (DB query time, storage, queue time, bandwidth tagged by `companyId`) | Cannot reconstruct from logs later |
| 1.3 | Background job system (BullMQ on Redis, per-tenant fairness, retry with exponential backoff, DLQ with alerting) | Required for any non-trivial async work |
| 1.4 | Real-time / push notifications (APNs + FCM for mobile, WebSocket or SSE for planner live updates) | Logistics is inherently real-time |
| 1.5 | File storage strategy (S3/R2 with signed upload URLs, never proxy through API, tenant-scoped prefixes, lifecycle policies) | Photo POD is coming |
| 1.6 | Caching layer (Redis for sessions, rate limits, idempotency keys, hot dashboards) | Cache invalidation strategy per tenant |
| 1.7 | Force-update mechanism for mobile (API returns `minSupportedVersion`, app refuses to start if below) | Required for breaking sync protocol changes |
| 1.8 | Crash reporting on mobile (Sentry/Bugsnag, source map upload on EAS build) | Already needed |
| 1.9 | Load test harness (k6 or Locust, simulates a realistic customer, run before each major release) | Cheapest insurance available |
| 1.10 | Search infrastructure baseline (Postgres `pg_trgm` + GIN, plan migration to Meilisearch/Typesense at 5M rows) | Don't build full-text search by hand |
| 1.11 | GDPR-ready data export and deletion flow (subject access request export, tenant deletion with retention period) | Build before you have a tenant who asks |
| 1.12 | Driver consent flow for GPS tracking with revocation | Legal requirement in many jurisdictions |
| 1.13 | Webhook delivery system (HMAC signing, retries, delivery log) | Customers want integrations from day one |

### Phase 2 — Early scale (first 100 customers)

| # | Item |
|---|------|
| 2.1 | Read replicas for reporting / analytics queries |
| 2.2 | Connection pooling (PgBouncer in transaction mode) |
| 2.3 | Per-tenant feature flags (LaunchDarkly or self-hosted alternative) |
| 2.4 | Customer onboarding tooling (data import wizard, CSV/Excel) |
| 2.5 | Public API with API keys (separate from JWT user tokens, scoped permissions) |
| 2.6 | Customer-facing audit log / data export (GDPR SAR ready) |
| 2.7 | Internationalisation: language, currency, timezone, units (km/miles, litres/gallons) |
| 2.8 | Multi-country working time rules (UK + EU minimum: regulation 561/2006) |
| 2.9 | Tenant suspension / billing-blocked flag enforced across API, queues, mobile |
| 2.10 | Customer support impersonation tool (audited, time-limited, requires reason code) |

### Phase 3 — Mid scale (100 to 1,000 customers)

| # | Item |
|---|------|
| 3.1 | Time-series database for GPS telemetry (TimescaleDB or equivalent), with retention tiers (raw 7d, 1-min 90d, 5-min 1y) |
| 3.2 | Pre-aggregated dashboard tables (materialised views or trigger-maintained tables) |
| 3.3 | Database partitioning by tenant or by date for high-volume tables |
| 3.4 | Async report generation (CSV/Excel exports run as background jobs, signed download URLs) |
| 3.5 | SOC2 / ISO27001 readiness work |
| 3.6 | Tenant tier infrastructure (shared / dedicated-pool / dedicated-instance) |
| 3.7 | Multi-region deployment (or DR region at minimum) |
| 3.8 | Tachograph integration (UK/EU regulated HGVs) |

### Phase 4 — Large scale (1,000+ customers)

| # | Item |
|---|------|
| 4.1 | Sharding strategy (per-tenant or hash-based) |
| 4.2 | Dedicated DB clusters for enterprise tier |
| 4.3 | CDN/edge for read-heavy global content |
| 4.4 | Analytics warehouse (BigQuery / Snowflake / ClickHouse) — never run analytics on prod DB |
| 4.5 | Tenant hierarchy (parent company / subsidiary / sub-subsidiary) |
| 4.6 | Customer-controlled encryption keys (BYOK) |
| 4.7 | Regional data residency (EU, US, UK separate databases) |

---

## Compliance & Legal (Logistics-specific)

### GDPR / UK DPA

- Documented retention policy per data category (driver personal data, GPS, job history, audit log)
- Right to erasure flow (tested annually, with documented exceptions for regulatory retention)
- Subject access request export tool (drivers can demand all data held on them)
- Data Protection Impact Assessment (DPIA) for GPS tracking
- Lawful basis recorded per field
- Driver consent for GPS tracking with revocation
- Data Processing Agreement (DPA) template ready for B2B customers

### Tachograph / driver hours regulation

- HGVs over 3.5t in UK and EU require digital tachograph
- We integrate with tachograph data — we do not duplicate or replace it
- Know EU regulation 561/2006 before selling to EU customers
- UK Working Time Directive rules already implemented; expand per country at Phase 2

### Audit logging requirements

- Every read of sensitive driver data is logged
- Every cross-tenant admin action is logged
- Logs are tamper-evident (append-only with checksums)
- Logs retained for the longest applicable regulatory period

### Insurance and subpoena handling

- GPS data may be subpoenaed in accident cases
- Documented data handover policy
- Engineers never directly query prod for legal requests — dedicated, audited tool
- Legal hold flag on tenant data prevents deletion during active litigation

---

## Working Time Rules (UK)

- 60h max per week (hard block)
- 48h average over 17 weeks (warning)
- 11h rest between shifts (warning only — not hard block)
- Spare drivers can end shift with no truck or jobs
- POA (period of availability) excluded from working time, included in paid time

When expanding to other countries, this rule set must be parameterised per country and stored as data, not hard-coded.

---

## Database Models (current)

Key models in `api/prisma/schema.prisma`:

`Company`, `User`, `CompanyMembership`, `DriverProfile`, `PlannedJob`, `Shift`, `ShiftSegment`, `JobExecutionEvent`, `DriverAvailability`, `HolidayRequest`, `DriverWorkingTimeSummary`, `SavedLocation`, `JobTemplate`, `SyncEventLog`, `FleetUnit`, `FleetTrailer`.

Every model that holds operational data carries `companyId`. New models must follow this rule.

---

## Job Status Flow

```
pending → in_progress → arrived_pickup → collected → arrived_dropoff → completed
```

> **IMPORTANT — do not confuse job status values with stop type values:**
> - `arrived_pickup` / `arrived_dropoff` are `PlannedJob.status` enum values (the job's lifecycle state).
> - `JobStop.type` is a separate field with canonical values `collection` | `delivery`. Never use `pickup` or `dropoff` for `JobStop.type` — those were the old incorrect values that a backfill script corrected.

## Vehicle Flow

1. **Start Shift:** enter truck reg → do truck check (odometer at top)
2. **Trailer:** enter reg → do trailer check (if not solo / van)
3. **Mid-shift change:** Change Vehicle → odometer end + fuel + AdBlue for old → new check
4. **End Shift:** last vehicle odometer end + fuel + AdBlue → calculated totals shown

## Shift Flow

```
Start Shift → Jobs screen → tap job → vehicle confirm →
Start Pickup → Collected → Start Dropoff → Delivered →
Back to Jobs or End Shift → last vehicle modal → EndShift screen → Review → Submit
```

---

## Current Status (as of 2026-05-07)

### Mobile — nearly complete

- Login with Face ID + company picker
- Multi-company support (one person, multiple companies)
- Home screen: upcoming jobs preview (read-only), start shift, holidays, history
- Start Shift: week plan, truck selection, vehicle class, trailer, GPS
- Truck check: odometer at top, defect confirmation ("safe to proceed?")
- Trailer check: same flow as truck
- Jobs screen: truck banner + trailer banner (tappable), End Shift button
- Change Vehicle: mid-shift truck/trailer change, odometer end, fuel, AdBlue
- Job Detail: full delivery flow (pending → arrived_pickup → collected → arrived_dropoff → completed)
- Vehicle confirmation per job, trailer change detection
- After job complete: "Back to Jobs" + "No more jobs — End Shift"
- End Shift modal: last vehicle odometer/fuel/AdBlue (skip if spare driver)
- EndShift screen: shows calculated totals, no entry fields
- Spare driver: can end shift with no truck or jobs
- Holiday screen: allowance, request, status
- Resume shift → goes to Jobs (not StartShift)
- AppFooter "LogisticBay · Q25 Ltd" on main screens
- Discard button bigger and easier to tap
- Shift flow refactored — large `ShiftScreens.tsx` split into focused screens
- Offline sync UI added globally — banner shows offline / syncing / synced / failed states
- Offline sync retry UI added — failed sync shows Retry action
- Job events attach GPS + clientTimestamp when available
- Offline event queue hardened with retry metadata, failure state, and crash recovery

### Mobile — offline queue (rebuilt 2026-05-02)

- `src/offlineQueue.ts` rebuilt using `POST /sync/events` + `clientEventId`
- Production-hardened with status, retryCount, createdAt, lastAttemptAt, lastError
- Backward compatible with old queued events that lack metadata
- Treats stale `syncing` events as retryable after app crash/restart
- `src/hooks/useNetworkStatus.ts` monitors connection, auto-flushes on reconnect, tracks failedCount
- `src/components/OfflineBanner.tsx` active, wired into `App.tsx`, shows failed state + Retry
- `JobDetail/index.tsx` uses `useIsOnline`, optimistic UI when offline, queues to `/sync/events`
- `JobDetail/index.tsx` attaches GPS + clientTimestamp to online and offline job events
- `src/apiWithQueue.ts` is a deprecated stub — do not use

**Architecture:**
- Job status updates generate a `clientEventId` (UUID) on device
- Offline: events saved to AsyncStorage, optimistic UI update shown immediately
- Online reconnect: auto-flush via `POST /sync/events` (idempotent)
- Server: `SyncEventLog` deduplicates by `clientEventId`, `JobExecutionEvent` stores `clientEventId`
- Migration: `api/prisma/migrations/20260502000000_add_client_event_id_and_sync_log`

### Mobile — TODO

- Detention / waiting timestamps (arrived, loading start, loading finish)
- Full end-to-end test
- Offline queue real-device acceptance test using installed build (not Expo Go Wi-Fi-off)
- Offline login / profile cache and job list cache for true offline app start
- Photo POD (later, depends on file-storage Phase 1 work)

### Web Planner — TODO (next big phase)

- Live shifts view: who is driving, current status, vehicle
- Availability board: see all driver week plans
- Holiday approvals: approve / reject
- Driver profiles: min hours/day, holiday allowance
- Job list: truck/trailer columns, server-side filter + pagination from day one
- One-time location check (GPS snapshot + Google Maps link)
- Dashboard endpoint `/dashboard?date=YYYY-MM-DD` (server-computed, NOT client-aggregated)

### API — TODO (immediate)

- Confirm `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` set in Railway env vars
- Rotate old `JWT_SECRET` after split is confirmed
- Tighten timestamp sanity checks for online `/jobs/:id/status` `clientTimestamp`
- Add stricter sync payload validation tests
- Build audit-review screens for events flagged `needsReview`

---

## Code Quality Issues (audit 2026-04-29, still open unless noted)

Priority fixes:

1. ~~HomeScreen.tsx JSX broken~~ — verify resolved post 2026-04-30 typecheck pass
2. `ShiftScreens.tsx` 824 lines with 3 screens — split into `EndShiftScreen.tsx`, `ReviewScreen.tsx` (StartShiftScreen already split)
3. Extract `mobile/src/utils/shiftTime.ts` (time utils buried in ShiftScreens)
4. Extract `mobile/src/constants/jobStatuses.ts` (status labels duplicated)
5. API routes use `body as any` — replace with typed interfaces in `api/src/types/requests.ts` (also Phase 0.11)
6. `navigation: any` in all screens — needs `mobile/src/navigation/types.ts`
7. `components.tsx` mixes COLOURS + UI — split into `theme.ts` + `components/`
8. `useShift() as any` — needs proper TypeScript types in `ShiftContext.tsx`
9. `JobDetailScreen.tsx` 756 lines — split into `JobDetail/` folder (started)
10. `planner/index.html` 897-line monolith — migrate to `web/src/modules/planner/`

---

## Key Files

### API

- `~/timesheet-app/api/src/server.ts` — registers all routes
- `~/timesheet-app/api/src/routes/auth.ts` — login, register, refresh
- `~/timesheet-app/api/src/routes/companies.ts` — drivers, company management
- `~/timesheet-app/api/src/routes/jobs.ts` — job CRUD, status flow
- `~/timesheet-app/api/src/routes/shifts.ts` — shift lifecycle
- `~/timesheet-app/api/src/routes/availability.ts` — availability, holidays, working time
- `~/timesheet-app/api/src/routes/sync.ts` — offline event ingestion
- `~/timesheet-app/api/src/services/sync.service.ts` — sync business logic
- `~/timesheet-app/api/src/middleware.ts` — JWT auth middleware
- `~/timesheet-app/api/prisma/schema.prisma` — database schema

### Mobile

- `~/timesheet-app/mobile/App.tsx` — navigator, all screens registered
- `~/timesheet-app/mobile/src/AuthContext.tsx` — auth state
- `~/timesheet-app/mobile/src/ShiftContext.tsx` — shift draft state
- `~/timesheet-app/mobile/src/api.ts` — Axios instance with auto-refresh
- `~/timesheet-app/mobile/src/components/OfflineBanner.tsx` — global offline / sync / failure banner
- `~/timesheet-app/mobile/src/offlineQueue.ts` — offline job event queue, retry/failure metadata, AsyncStorage persistence
- `~/timesheet-app/mobile/src/hooks/useNetworkStatus.ts` — network monitor + queue auto-flush + retry trigger
- `~/timesheet-app/mobile/src/components.tsx` — legacy / shared components
- `~/timesheet-app/mobile/src/constants.ts` — vehicle classes, check items
- `~/timesheet-app/mobile/src/screens/HomeScreen.tsx`
- `~/timesheet-app/mobile/src/screens/StartShiftScreen.tsx`
- `~/timesheet-app/mobile/src/screens/JobsScreen.tsx`
- `~/timesheet-app/mobile/src/screens/JobDetail/index.tsx` — job execution flow, online/offline event creation, GPS metadata
- `~/timesheet-app/mobile/src/screens/ChecklistScreen.tsx`
- `~/timesheet-app/mobile/src/screens/ChangeVehicleScreen.tsx`
- `~/timesheet-app/mobile/src/screens/HolidayScreen.tsx`

### Web

- `~/timesheet-app/web/src/main.tsx`
- `~/timesheet-app/web/src/App.tsx`
- `~/timesheet-app/web/src/api/` — client, auth, jobs, drivers
- `~/timesheet-app/web/src/modules/` — planner, drivers, auth, settings

---

## Dev Tools

- Reset all shifts: `DELETE /dev/reset-shifts` (`company_owner` only, dev environments only — must be disabled in production)
- Test token: log in at logisticbay.com, copy from Network tab

## Notes for new chat sessions

1. Always read this file first: `cat ~/timesheet-app/DEVLOG.md`
2. Check recent commits:
   - `git -C ~/timesheet-app/api log --oneline -5`
   - `git -C ~/timesheet-app/mobile log --oneline -5`
3. After finishing work, update the relevant Status section above.
4. Add a session entry at the bottom of this file.
5. Commit message format: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.

---

## Session History

The following section preserves the chronological record of major changes. New entries go at the end. Do not edit historical entries; correct them in the Status sections above.

---

### 2026-05-02 — Phase 1 Offline Sync (API)

**Built:**
- `POST /sync/events` endpoint for receiving offline job events from mobile
- Idempotency enforced by `@@unique([companyId, clientEventId])` — tenant-scoped, not global
- `SyncEventLog` audit table — records every ingest attempt regardless of outcome
- `sync.constants.ts` — single source of truth for review rules (7-day age limit, 1-hour future drift)
- `sync.service.ts` — business logic separated from route handler
- Migration `20260502082357_add_sync_fields` — applied locally, ready for Railway deploy

**New fields on `JobExecutionEvent`:**
- `clientEventId` — device-generated UUID, unique per company
- `clientTimestamp` — when event happened on device
- `serverReceivedAt` — when server received it
- `appVersion` — for debugging old client behaviour
- `needsReview` / `reviewReason` — flagged if event is over 7 days old or over 1 hour in future

**Acceptance test:**
- First call with `clientEventId: test-idempotency-001` → `accepted`
- Second call with same `clientEventId` → `duplicate` (not error)
- HTTP 200 on both calls
- One DB row created — idempotency confirmed

**Phase 1 supports only `collected` event type.** All other event types rejected with clear error message. More types added in Phase 2.

**Pre-existing issue (out of scope):** `shifts.ts` lines 94–95 — `CheckItem[]` / `Json` type mismatch — pre-dates this session.

**Production deploy instructions:**
1. Push is done — Railway auto-deploys the code
2. Manually run migration on Railway: `prisma migrate deploy` with Railway `DATABASE_URL`
3. Never run `migrate reset` on production

**TODO Phase 2:**
- Migrate `JobExecutionEvent.driverId` from `User` reference to `DriverProfile` reference
- Add remaining event types: `started`, `arrived_pickup`, `arrived_dropoff`, `completed`
- Mobile integration test with real device offline/online toggle

---

### 2026-05-02 — Phase 2 Sync (API)

**Built:**
- All remaining job event types added to `POST /sync/events`
- `sync.constants.ts` `SUPPORTED_EVENT_TYPES` now includes all 5 event types
- `sync.service.ts` adds `podNumber` and `deliveryNote` to `IncomingEvent` interface
- `sync.service.ts` adds `buildJobUpdate()` — single place that maps event type to job status and captured fields

**Event type mapping:**

| Event type | Job status set | Fields captured |
|------------|---------------|-----------------|
| `started` | `in_progress` | none |
| `arrived_pickup` | `arrived_pickup` | none |
| `collected` | `collected` | actualQuantity, actualUnit, collectionNote |
| `arrived_dropoff` | `arrived_dropoff` | podNumber, deliveryNote |
| `completed` | `completed` | podNumber, deliveryNote, actualQuantity, actualUnit |

No migration needed — service / constants layer only.

API sync system is now complete for all job status transitions. Mobile can queue any job event offline and sync when signal returns.

**Next steps (mobile session):**
- `AuthContext.tsx` — cache token + user profile to SecureStore on login
- On app open — read cached profile, attempt background token refresh
- If offline — use cached profile (access token is 7d TTL, covers full shift)
- Job list — cache to AsyncStorage on fetch, read from cache when offline
- Shift submit — queue to sync when offline

---

### 2026-05-02 — Mobile offline queue bug fixes

**Bugs fixed (mobile commit `fa9b830`):** three bugs in the offline queue path that would have prevented sync from working:

1. `QueuedJobEvent.status` renamed to `eventType` — field name now matches `IncomingEvent` on server
2. `STATUS_TO_EVENT_TYPE` map added in `JobDetail/index.tsx` — `in_progress` correctly maps to `started` (the only non-obvious mapping)
3. `flushQueue` filter fixed: `"applied"` → `"accepted"` — matches actual API response
4. `useNetworkStatus.ts` fixed: reads `{ synced, failed }` not `{ results }` — matches actual API response shape

Online path unaffected. Direct `api.patch` calls in `JobDetail` work as before. Only the offline queue path was broken.

**Current offline sync state:**
- API: fully complete — all 5 event types, idempotency, audit log
- Mobile queue: fixed — correct field names, correct response parsing
- Mobile offline login: not yet built (`AuthContext` still calls API on every app open)
- Mobile job list cache: not yet built
- Acceptance test on real device: not yet done

---

### 2026-05-02 — API TypeScript clean

- Fixed pre-existing `shifts.ts` `CheckItem[]` / `Json` type mismatch (lines 94–95)
- API TypeScript build now has zero errors across all files
- Commit: `a42f035`

---

### 2026-05-03 — API offline sync GPS + event metadata hardening

**Commits pushed:**
- `feat(api): add GPS support to offline sync events`
- `feat(api): validate GPS fields for sync events`
- `feat(api): improve holiday availability validation`
- `feat(api): add GPS metadata to online job events`

**What changed:**
- Added `gpsLat` and `gpsLng` to `JobExecutionEvent`
- Added migration `20260503100000_add_gps_to_job_execution_event`
- `sync.service.ts` now persists GPS coordinates from `/sync/events`
- `src/routes/sync.ts` validates GPS safely:
  - `gpsLat` and `gpsLng` must be provided together
  - latitude must be between `-90` and `90`
  - longitude must be between `-180` and `180`
- `src/routes/jobs.ts` online status updates now accept `clientTimestamp`, `gpsLat`, `gpsLng`
- Online job update and `JobExecutionEvent` creation now run in a single Prisma transaction
- `src/types/requests.ts` updated so `UpdateJobStatusBody` includes GPS / timestamp metadata
- Holiday availability and validation changes split into a separate commit instead of being mixed with sync

**Verification:**
- `npx tsc --noEmit` passed in API
- Commits pushed to `Q25ltd/logisticbay`

**Important remaining risk:**
- Offline sync is implemented and type-checked, but not fully real-device field-tested yet
- `clientTimestamp` sanity checking should still be tightened for online `/jobs/:id/status`

---

### 2026-05-03 — Mobile GPS event metadata + production offline queue hardening

**Commits pushed:**
- `feat(mobile): add GPS fields to offline queue events`
- `feat(mobile): attach GPS and clientTimestamp to job events`
- `feat(mobile): harden offline event queue retries`
- `feat(mobile): production-ready offline sync with failure handling and retry UI`
- `refactor(mobile): shift flow restructuring and UI updates (pre-offline polish)`

**What changed:**

`src/offlineQueue.ts`
- `QueuedJobEvent` now supports `gpsLat` and `gpsLng`
- Queue events track `status`, `retryCount`, `createdAt`, `lastAttemptAt`, `lastError`
- Old queued events without metadata are normalised and still sync
- Stale `syncing` events are retryable after app crash/restart
- Failed events are retained instead of silently disappearing

`src/screens/JobDetail/index.tsx`
- Captures GPS with `expo-location` when available
- Attaches `clientTimestamp`, `gpsLat`, `gpsLng` to online `/jobs/:id/status`
- Attaches GPS to offline queued job events
- Continues without GPS if permission denied or fetch fails

`src/hooks/useNetworkStatus.ts`
- Tracks `queueSize` and `failedCount`
- Auto-flushes queue on reconnect
- Exposes `triggerSync` for manual retry
- Adds explicit `failed` sync state instead of misusing `offline`

`src/components/OfflineBanner.tsx`
- Shows offline, syncing, synced, and failed states
- Shows failed count
- Exposes Retry action for failed sync

`App.tsx`
- Passes `failedCount` and `triggerSync` into `OfflineBanner`

Large shift-flow restructuring committed separately after offline commits were isolated.

**Verification:**
- `npx tsc --noEmit` passed in mobile after each sync/offline change
- Commits pushed to `Q25ltd/logisticbay-mobile`

**Current truth:**
- Offline sync is architecturally production-grade and type-checked
- Offline sync is **not yet field-proven** — real installed-build testing is pending
- Do not mark offline as fully accepted until tested on a production-like mobile build, not Expo Go

**Required acceptance test (mandatory before sign-off):**
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

---

### 2026-05-03 — API cleanup and production sync

**Migrations applied to production:**
- `20260502082357_add_sync_fields` — sync fields on `JobExecutionEvent`, `SyncEventLog` table
- `20260502120000_add_poa_mins` — POA field on `Shift`, working time calculation fix
- `20260503100000_add_gps_to_job_execution_event` — GPS coords on `JobExecutionEvent`

All 4 migrations applied and confirmed. Database schema is up to date.

**Outstanding:** Railway JWT variables (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) need confirming in Railway dashboard.

---

### 2026-05-03 — Mobile fixes (mobile session)

**Bugs fixed (commits `5f20b54`, `891c284`, `0d15d17`):**
- POA correctly excluded from working time, included in paid time
- Fuel and AdBlue values no longer lost when driver changes vehicle
- Odometer label on `ChecklistScreen` now reads dynamically from `draft.odometerUnit` (not hardcoded `miles`)
- History screen now shows both working hours and paid hours separately

**EAS update published:**
- Branch: production
- Platforms: iOS + Android
- Update group: `94b06ecd-e1cd-4703-adb8-638d3fec1f0b`

**Still open:**
- Railway JWT variables — `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` need confirming in Railway dashboard
- Real device offline acceptance test (needs standalone build)
- Web Planner MVP (next major phase)

---

### 2026-05-07 — Scale and tenant isolation architecture update

**Decision:** LogisticBay must be built for many tenants and large data volume from this point forward. Tenant isolation is not optional and must be implemented in every file and every data path. The Architecture Rules and Tenant Isolation sections of this document are the canonical reference.

**Important current gaps:**
- Planner Dashboard v1 derives dashboard data client-side. This is acceptable only as MVP validation. Before real scale, replace with a tenant-scoped dashboard API and indexed queries.
- Basic structured request/error logging now includes requestId/userId/companyId when authenticated. Remaining gaps: no Sentry/error tracking, no full append-only audit log, no Redis cache, no background job system, and rate limiting is still basic in-process/API-level rather than per tenant.
- No staging environment. CI runs no tenant-isolation integration test. Must be added.

**Required before scale rollout:**
1. Tenant isolation integration test on every deploy
2. Dashboard API with `companyId`, date, filters, summaries, warnings
3. Jobs API pagination and server-side filters
4. Database indexes reviewed for planner / dashboard / search queries (see required indexes list above)
5. Tenant-scoped search design
6. Background smart-warning / recommendation jobs that run per `companyId`
7. Phase 0 foundations completed in full (see Priority Roadmap)

---

### 2026-05-07 — Urgent safety fixes from DEVLOG pass

**Fixed in code:**
- Production API startup now runs `prisma migrate deploy`; removed production `prisma db push` from `api/start.sh` and `migrate:prod`.
- Planner job delete is now a soft cancel: job evidence, stops, load details, execution events, and audit rows are preserved. Jobs with loaded linked trailers are blocked from deletion until replanned/unloaded.
- Fleet unit/trailer delete is now soft archive (`status = deleted`) and hidden from default fleet lists. Loaded linked trailers cannot be deleted.
- Driver holiday edits no longer hard-delete existing holiday request rows; old rows are marked `deleted` and hidden from active lists.
- Online job status updates now accept `clientEventId`, deduplicate by `(companyId, clientEventId)`, and reject invalid / older-than-7-days / more-than-1-hour-future `clientTimestamp`.
- Mobile online job status updates now send a device-generated UUID `clientEventId`.
- Dev-only `DELETE /dev/reset-shifts` now returns 404 in production.
- API request/error logs include requestId, userId, companyId, role, method, URL, and status where available.
- Added baseline tenant-first indexes for planner, dashboard, fleet, shifts, holidays, and operational event queries via migration `20260507170000_add_tenant_scale_indexes`.

**Still urgent / not done:**
- Dedicated server-side Dashboard API and Jobs cursor pagination.
- Tenant-isolation integration test in CI.
- True append-only audit log coverage for every sensitive read/write.
- Staging environment and tested restore/rollback runbook.
- Search/trigram indexes and duplicate cleanup before fleet registration uniqueness constraints.

---

### 2026-05-07 — Devlog rewrite and architecture charter

This document was rewritten to combine the historical session log with the architecture rules, tenant isolation discipline, scale planning, and prioritised roadmap. Engineers must read the top half (rules + roadmap) at the start of every chat session and before every PR review. Session history below the roadmap is appended; do not edit historical entries.

---

### 2026-05-07 — Phase 0 foundations batch (database empty, safe to restructure)

**companyId on ShiftSegment and DeliveryTask (migration 20260507200000)**
- Both models now carry `companyId` with FK to Company and tenant-scoped indexes.
- Two-step SQL: add nullable → backfill from parent Shift → make NOT NULL.
- Shifts route now passes `companyId` when creating segments and deliveries.

**Append-only AuditLog table (migration 20260507210000)**
- General audit table covering all entity types (Driver, FleetUnit, FleetTrailer, HolidayRequest, Shift, Job, etc.).
- DB-level `RULE` blocks UPDATE and DELETE — rows are immutable once written.
- `src/lib/audit.ts`: `writeAudit()` and `writeAuditBatch()` helpers. Failures are caught and logged — audit never breaks the main request.
- Wired into: driver create, driver update, driver status change, holiday request create, holiday request approve/reject.
- `JobAudit` table kept for backward compat; `AuditLog` is the new general table.

**Zod validation schemas — Phase 0.11**
- `src/schemas/auth.ts`, `drivers.ts`, `jobs.ts`, `shifts.ts`, `availability.ts`, `locations.ts`, `fleet.ts`
- `src/lib/validate.ts`: `parseBody()` and `parseQuery()` helpers returning typed result objects.
- Wired into: auth login/refresh/change-password, register-company, driver create/patch/status, shift create/segment/delivery/submit, holiday request create/approve, availability POST, shift-preference POST.
- All covered route handlers now validate before use; no bare `body as any` on these paths.

**Also committed this session (carried from previous session):**
- Web Dashboard and Jobs: date range quick pills (Today | ±7d | ±14d | ±30d) + manual from/to inputs.
- API: `dateFrom`/`dateTo` range filter on `GET /jobs`.
- API: soft-cancel on job delete; fleet unit/trailer soft-archive.
- API: `clientEventId` deduplication on online job status updates.
- API: `DELETE /dev/reset-shifts` returns 404 in production.
- API: structured logging with `requestId`, `companyId`, `userId`.
- API: `prisma migrate deploy` on startup (removed unsafe `db push` from production).
- API: tenant-scale indexes migration (20260507170000).
- DEVLOG/SAFETY: architecture charter and safety rules documents.

**Remaining Phase 0 items (not yet done):**
- 0.1 RLS policies — Postgres Row-Level Security on every tenant-scoped table.
- 0.2 Structured logging — Pino with redaction, `requestId` + `companyId` + `userId` in every line (partial: exists on request level, not in all background jobs).
- 0.4 Backup strategy + tested restore (Railway point-in-time, quarterly drill).
- 0.5 Sentry error tracking on API, web, mobile.
- 0.6 Schema migration discipline — runbook per migration (ongoing practice).
- 0.7 Idempotency on ALL write endpoints — extend clientEventId to all writes (only job events today).
- 0.8 API versioning strategy — `/v1/jobs`, `X-App-Version`, deprecation policy.
- 0.9 Staging environment — separate DB, no prod data.
- 0.10 Secrets management — confirm `JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET` in Railway.
- 0.12 CI gates — typecheck, lint, unit tests, tenant-isolation integration test on every PR.
- Server-side Dashboard API and Jobs cursor pagination.
- Repository pattern — typed repositories requiring `companyId` as first argument.

---

### 2026-05-10 — Job Form Vocabulary Unification (Phase 0 of JOB_FORM_IMPLEMENTATION_BRIEF.md)

**Goal:** Establish a single canonical vocabulary for vehicles, trailers, driver licences, and equipment across API, web, and mobile. Fixes three separate incompatible vocabularies that blocked allocation matching.

**Created:**
- `shared/vehicleTaxonomy.ts` — single source of truth: BODY_CATEGORIES, GVW_CLASSES, BODY_TYPES, ONBOARD_EQUIPMENT, DRIVER_LICENCE_CLASSES, DRIVER_ENDORSEMENTS, TRAILER_LENGTHS, revised SERVICE_TYPES, revised JOB_TYPES, helper functions.
- `api/src/constants/vehicleTaxonomy.ts` — identical copy (JS/TS import boundary).
- `web/src/constants/vehicleTaxonomy.ts` — identical copy.
- `mobile/src/constants/vehicleTaxonomy.ts` — identical copy.
- `web/src/lib/textCase.ts` — `applyCase(value, rule)` helper for proper_name / address_line / sentence / upper / lower / none transforms.
- `mobile/src/lib/textCase.ts` — identical copy.
- `scripts/check-vocab-sync.ts` — CI guard: hashes all three taxonomy copies, fails build if they diverge.
- `api/scripts/backfill_vocab_v1.ts` — one-shot migration script to populate new fields from legacy values.

**DB migration `20260510120000_vocab_unification` (additive — no columns dropped):**
- `DriverProfile`: added `endorsements Json?`, `canDriveCategories Json?`
- `PlannedJob`: added `reqBodyCategory`, `reqGvwMin`, `reqBodyType`, `reqEquipment`, `reqLicenceClass`
- `FleetUnit`: added `vehicleClassLegacy`, `bodyCategory`, `gvwClass`, `bodyType`, `onboardEquipment`. Legacy `vehicleClass` stays.
- `FleetTrailer`: added `bodyType`, `trailerLength`, `decks`, `compartments`, `onboardEquipment`. Legacy `trailerType` stays.

**API changes:**
- `api/src/constants/jobCreation.ts` — replaced VEHICLE_CLASSES / TRAILER_TYPES with re-exports from taxonomy. Kept LOAD_UNITS, JOB_STOP_TYPES.
- `api/src/schemas/jobs.ts` — added reqBodyCategory, reqGvwMin, reqBodyType, reqEquipment, reqLicenceClass. Removed trailerTypesForbidden.
- `api/src/schemas/fleet.ts` — replaced vehicleClass with bodyCategory + gvwClass + bodyType + onboardEquipment. Trailer schema: bodyType + trailerLength + decks + compartments.
- `api/src/schemas/drivers.ts` — narrowed licenceClass to B/C1/C1E/C/CE enum; added endorsements, canDriveCategories.
- `api/src/services/jobValidation.ts` — validation now uses isBodyCategory, isBodyType, isOnboardEquipment. reqBodyCategory required for ready_to_plan. Tractor without trailer types → warning.
- `api/src/routes/jobs.ts` — maps new req* fields through; stops writing trailerTypesForbidden.
- `api/src/routes/fleet.ts` — unit routes write bodyCategory/gvwClass/bodyType/onboardEquipment; trailer routes write bodyType/trailerLength/decks.

**Web changes:**
- `web/src/modules/jobs/createJobConstants.ts` — imports from taxonomy, removes local VEHICLE_TYPES/MIN_SIZES/TRAILER_TYPES/EQUIPMENT_OPTS/DRIVER_QUALS.
- `web/src/modules/jobs/CreateJobPage.tsx` — Section 05 rewritten with cascading picker (body category → GVW → body type → trailer type → equipment → licence → endorsements). Auto-suggests licence from body category. Legacy vehicleClass values mapped to new fields in edit/template mode.
- `web/src/modules/jobs/createJobPayload.ts` — maps reqBodyCategory, reqGvwMin, reqBodyType, reqEquipment, reqLicenceClass, reqEndorsements to API body. Removed trailerTypesForbidden.
- `web/src/modules/fleet/fleetConstants.ts` — removed VEHICLE_CLASSES / TRAILER_TYPES display strings; kept UNIT_STATUSES / TRAILER_STATUSES.
- `web/src/modules/fleet/UnitForm.tsx` — cascading body category → GVW → body type → equipment picker.
- `web/src/modules/fleet/TrailerForm.tsx` — body type → trailer length → decks → compartments (tanker only) → equipment.
- `web/src/modules/drivers/DriverForm.tsx` — licenceClass is now a `<select>` with 5 canonical options. Endorsements are a MultiCheck.
- `web/src/modules/planner/JobDetailDrawer.tsx` — removed "Trailer forbidden" row. Shows trailer allowed, equipment from reqEquipment or equipmentRequired.

**trailerTypesForbidden removed:**
User decision: selecting trailer types ALLOWED implicitly forbids all others. A separate "forbidden" list conflicts with the "allowed" list and adds confusion with no practical benefit. Column left in DB (null on new records) — can be dropped in Phase 0.8 soak.

**Typechecks:** `npx tsc --noEmit` → exit 0 in both `api/` and `web/`.

**Migration status:** `20260510120000_vocab_unification` is deployed to production (confirmed via `prisma migrate deploy` 2026-05-12).

**Backfill status:** `api/scripts/backfill_vocab_v1.ts` — run status **unconfirmed**. If `FleetUnit`, `FleetTrailer`, or `DriverProfile` rows exist in production that pre-date this migration, the backfill must be run once: `DATABASE_URL=$DATABASE_URL_PROD npm run backfill:vocab`.

---

### 2026-05-12 — Public request form, data dictionary, misc fixes

**Commits:** `5f5bc22`, `0e1fe7c`, `eb029f0`, `7eea363`, `a693c68`

**Public request form (`web/src/modules/requests/PublicRequestForm.tsx`):**
- Added all missing fields matching the `JobRequest` schema: `craneRequired`, `trailerTypesAllowed`, `vehicleAccessNotes`, `requirePOD`, `weighbridgeRequired`
- All required fields now validated before submit
- Rejection policy clarified: requests go to `pending` review, not auto-approved
- `driverNotes` renamed to `driverVisibleNotes` in the payload (maps to the DB column)

**Misc fixes:**
- API: only sends `Content-Type: application/json` header when the request has a body
- Removed mobile submodule ghost reference; fixed migration drift; corrected blob typing
- Replaced non-logistics emojis with appropriate alternatives across all web UI

**Data dictionary (`DATA_DICTIONARY.md`):**
- Full data dictionary written covering all DB models, JSON blobs, and form fields
- This is the authoritative field reference — code agents must consult it before naming any new field

---

### 2026-05-12 — Canonical field naming — system-wide Phase 2

**Commit:** `2249e95`

**Goal:** Eliminate all field name aliases so every concept has exactly one name across DB columns, JSON blobs, API types, form state, and UI components.

**StopState interface** (`web/src/modules/jobs/createJobTypes.ts`):
- `stopType` → `type`
- `unitBuilding` → `unitName`
- `refNumber` → `referenceNumber`
- `driverNotes` → `instructions`

**CreateJobPayload / buildBody** (`web/src/modules/jobs/createJobPayload.ts`):
- ~20 state variable renames to match canonical names
- Removed duplicate aliases: `minSize`, `equipmentReq`, `driverQuals` (canonical `reqGvwMin`, `reqEquipment`, `reqEndorsements` are used instead)
- **Critical bug fixed:** `buildBody()` was converting `stop.type === "collection"` to `"pickup"` before sending to the API — writing wrong values into `JobStop.type`. Fixed: now sends `stop.type` directly (`"collection"` or `"delivery"`).

**SavedLocation DB column renames** (`api/prisma/schema.prisma` + migration `20260512000000_saved_location_canonical_fields`):
- `addressText` → `locationTextSnapshot`
- `latitude` → `lat`
- `longitude` → `lng`
- Migration applied to production 2026-05-12.

**All dependent code updated:**
- `web/src/modules/jobs/StopCard.tsx` — `applyLocation()`, `LocationSearch` filter
- `web/src/modules/locations/LocationsPage.tsx` — form state, submit, filter, display
- `web/src/modules/jobs/CreateJobPage.tsx` — all state vars, template load/save, alt address
- `web/src/modules/jobs/createJobUtils.ts` — `makeStop()`, `jobStopToStopState()`
- `web/src/modules/templates/TemplatesPage.tsx` — `stopSummary()` backward compat
- `web/src/types/index.ts` — `SavedLocation` interface, `TemplateJobData` interface (canonical + legacy optional fields for reading old stored templates)
- `api/src/routes/jobs.ts` — SavedLocation create/update/read
- `api/src/routes/jobRequests.ts` — request field reads
- `api/src/types/requests.ts` — `CreateLocationBody`, `PatchLocationBody`
- `web/src/api/jobRequests.ts` — frontend API client types

**New backfill scripts:**
- `api/scripts/backfill_job_stop_type.ts` — fixes existing `JobStop` rows: `type = 'pickup'` → `'collection'`, `type = 'dropoff'` → `'delivery'`. Run: `DATABASE_URL=$DATABASE_URL_PROD npm run backfill:job-stop-type`. Safe to re-run.
- `api/scripts/backfill_stops_v2.ts` — fixes `JobRequest.stops[]` blob field names to canonical names (e.g. `companySiteName→siteName`, `addressLine1→street`, `entranceLatitude→lat`, `customerReference→customerRef`). Run: `DATABASE_URL=$DATABASE_URL_PROD npm run backfill:stops-v2`. Safe to re-run.

**Verification:** `tsc --noEmit` → 0 errors in both `web/` and `api/`. Deployed to production via `main` branch push.
