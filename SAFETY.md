# LogisticBay — Safety Standards
# Production safety architecture
# Read this before making any architecture or data decisions

## CORE PRINCIPLE

The system must fail safely.

That means:
- No data loss
- No cross-company leaks
- Drivers can always work
- System can recover and reconcile

---

## 1. SYSTEM STATES

Define global system state:

NORMAL → DEGRADED → INCIDENT

**NORMAL**
- Full functionality

**DEGRADED**
- Reads OK, writes risky
- Warnings shown to users

**INCIDENT**
- Backend unreliable
- Switch to offline-first behavior
- Restrict risky operations

### MVP scope
- Manual feature flag to toggle states
- Show banner in driver app + planner dashboard
- Log incident start/end timestamps

### Later (post-launch)
- Automated detection (error rate spikes, DB unreachable)
- Auto-switch states based on metrics

---

## 2. DRIVER APP — OFFLINE-FIRST CORE

### Rule
All actions saved locally first. Always.

### Local storage (MVP)
- AsyncStorage for event queue (start here)
- Secure storage for auth tokens
- Migrate to SQLite when queue regularly exceeds 50 events

### Local data model
- LocalEvent (the queue)
- SyncMetadata (last sync time, queue size)
- PhotoQueue (later phase)

### Action flow

### Sync queue rules
- Retry with exponential backoff
- Idempotency key required (clientEventId)
- Never drop failed events
- Retry triggers:
  - App opens
  - Network returns
  - Manual refresh
  - Heartbeat every 30s while active

### Offline startup
**Allowed:**
- Open app using stored session
- View cached jobs
- Perform actions offline

**Not allowed:**
- First-time login without internet

### Token handling
Separate concerns:
- Local session → allows app access offline
- Server token → used only for syncing

Offline must never block driver from working.

### Logout rule
Problem: driver logs out with unsynced data → data loss risk

**MVP decision:** Block logout if unsynced events exist
- Show warning: "X actions waiting to sync. Please connect to internet first."
- Force sync attempt before allowing logout
- Override only if explicitly confirmed (track in audit log)

### UI sync state requirements
Driver must always see:
- ✅ Synced
- ⏳ Pending sync
- ⚠ Failed (retrying)
- 📶 Offline mode

Never hide sync state from driver.

---

## 3. BACKEND SAFETY

### Idempotency (mandatory)

Every event must include:
- `clientEventId` (UUID generated on phone)

Database constraint:
- `UNIQUE(companyId, clientEventId)` — extra tenant safety

Behavior:
- Duplicate event → return success (don't error)
- Same retry 100 times = saved once

### Event validation

Backend must verify on every event:
1. Driver belongs to company (via JWT)
2. Driver assigned to job (or had access at clientTimestamp)
3. Status transition is allowed
4. Event not duplicate
5. Timestamp not >7 days old or >1 hour in future

### Status transitions

Strict allowed flow:

Final job state = derived from events, not stored directly.

### MVP minimum
- Each event has: clientEventId, eventType, clientTimestamp, serverReceivedAt, payload
- Job status field stays for performance, but recalculated from events on conflict

---

## 4. EVENT-BASED MODEL

Job status is derived from events, not stored directly. The `status` field on `PlannedJob` exists for query performance but must always be consistent with the event log.

**Implemented:**
- `JobExecutionEvent` table with `clientEventId`, `clientTimestamp`, `serverReceivedAt`, `needsReview`
- `@@unique([companyId, clientEventId])` — idempotency guaranteed
- POST /sync/events endpoint — processes all 5 event types, idempotent on retry
- `SyncEventLog` — audit log for every sync attempt including failures

**Not yet implemented:**
- Recalculation of job status from events on conflict
- Reconciliation dashboard for `needsReview` events

---

## 5. DATABASE SAFETY

### Rules
- Managed PostgreSQL only (Railway)
- Daily automatic backups (Railway provides)
- Separate staging + production databases
- No destructive migrations in production
- Use transactions for critical writes

### Migration rules

**⚠️ CURRENT REALITY vs INTENDED:**
The project currently uses `prisma db push` in production (set as Railway pre-deploy command). This is faster but bypasses migration history. For a paying-customer system, migrate to `prisma migrate deploy` which tracks every schema change.

**Intended (post-launch hardening):**
```bash
# development only
prisma migrate dev

# production — use this, not db push
prisma migrate deploy
```

**Local manual push** (only needed if Railway auto-deploy is broken):
Requires TCP Proxy URL from Railway dashboard → Postgres → Settings → TCP Proxy.
Internal Railway hostname does NOT work from outside Railway network.

### Safe migration flow
1. Add new field (nullable or with default)
2. Deploy code that handles both old and new
3. Migrate data
4. Deploy code that requires new field
5. Remove old field later (separate migration)

Never combine schema change + data migration in one step.

### Disaster recovery
- Test backup restore quarterly
- Document restoration procedure
- Have rollback plan for every migration

---

## 6. TENANT ISOLATION (CRITICAL — ZERO TOLERANCE)

### Rule
Every query must scope by:

Never trust frontend.

### Enforcement
- Middleware injects companyId from JWT
- All Prisma queries scoped by companyId
- Integration test on every deploy proves Company A cannot read Company B data

### Failure consequence
Catastrophic. End of business. Test relentlessly.

### MVP integration test
Write one test that:
1. Creates two companies with data
2. Logs in as Company A user
3. Tries to fetch Company B's jobs
4. Expects 404 or empty array
5. Run on every deploy

---

## 7. DATA CLEANUP

### Problem
- Deleting too early = data loss
- Keeping forever = storage/privacy issue

### Correct rule
Delete only after:
- Event synced AND confirmed by backend
- AND retention period elapsed

### Cleanup policy
- Synced events on phone: delete after 7-14 days
- Completed jobs in mobile cache: delete after 3-7 days
- Photos uploaded: delete local copy after URL confirmed
- Backend logs: rotate after 30-90 days

### Never delete
- Pending events
- Failed events
- Unsynced photos
- Active jobs
- Audit log entries

---

## 8. PLANNER EMERGENCY MODE

When backend is degraded, planner must support:
- Cached job list (last known state)
- Stale data view with timestamp
- Manual updates (flagged for reconciliation)
- Export jobs to CSV/PDF
- Direct driver communication info (phone numbers)

### Manual override

Must be reconciled later when system recovers.

### MVP
- Read-only cached view
- "Last updated: HH:MM" banner
- Manual override deferred to post-launch

---

## 9. RECONCILIATION ENGINE

### After recovery
System must:
1. Replay queued events in clientTimestamp order
2. Process all pending data
3. Detect conflicts (planner changed something while driver was offline)
4. Flag inconsistencies for human review

### Conflict handling
**Best approach:** Flag for manual resolution
- Don't silently overwrite
- Don't auto-merge
- Show both versions to admin/planner
- Admin decides which wins

### MVP
- Simple flag system: events that arrive late get `needsReview: true`
- Planner sees them in a queue
- Reconciliation dashboard deferred to post-launch

---

## 10. API / SERVER PROTECTION

### Required (MVP)
- Auto-restart on crash — ✅ Railway provides
- /health endpoint — ✅ EXISTS at GET /health — checks DB with SELECT 1, returns `{server, db}`. MISSING: queue depth, DB latency, memory
- Structured logging with requestId — ⚠️ Fastify logger enabled (JSON) but does NOT inject requestId/userId/companyId per request. Must add.
- Error monitoring (Sentry) — ❌ NOT set up
- Staging environment — ❌ NOT set up — all deploys go direct to production
- Rollback capability — ❌ NOT documented or tested

### Per-tenant rate limiting
Add post-MVP:
- Limit per company (not just global)
- Prevents one company's bug from affecting others

---

## 11. DEPLOYMENT SAFETY

### Flow

### Before production deploy
- TypeScript check passes
- Tests pass
- Manual flow testing on staging
- Database migration tested on staging
- Rollback tested

### Rollback
- Must be instant
- Tested before each major deploy
- Document rollback steps in runbook

---

## 12. FRONTEND SAFETY

Every screen must handle:
- Loading state
- Error state
- Empty state
- Success state

API calls must:
- Use try/catch
- Show user-friendly errors (not stack traces)
- Have timeout (30s default)

React error boundaries on all major sections.

---

## 13. PERMISSIONS SYSTEM

Roles:
- driver
- planner
- manager
- company_owner
- platform_admin

### Rule
- Every route checks role server-side
- Frontend role indicators are UX hints only
- Never trust frontend for authorization decisions

---

## 14. SOFT DELETE SYSTEM

Never hard delete operational data.

Use status fields:
- active
- inactive
- archived
- cancelled
- removed

Hard delete only for:
- GDPR right-to-erasure requests
- Test data cleanup in dev/staging

---

## 15. SECRETS SECURITY

### Rules
- .env never committed to git
- Use platform secrets (Railway, Vercel)
- Rotate any exposed secret within 24 hours
- Never log tokens, passwords, or PII
- Separate secrets for dev/staging/production

### MVP checklist
- JWT_ACCESS_SECRET in Railway
- JWT_REFRESH_SECRET in Railway
- DATABASE_URL in Railway only
- SENDGRID_API_KEY in Railway only

---

## 16. LOGGING (MANDATORY)

Every request must log:
- requestId (UUID per request)
- userId
- companyId
- jobId (if applicable)
- route
- statusCode
- error details (if any)
- duration

Without structured logs, debugging production is impossible.

### MVP
- Use Fastify built-in logger
- JSON format for parsing
- Ship to Railway logs
- Add Sentry for errors only

---

## 17. INCIDENT COMMUNICATION

When system state is INCIDENT or DEGRADED:

### Driver app banner
### Planner dashboard banner
Always show ETA when known. Drivers panic without context.

---

## 18. SAFE MODE RESTRICTIONS

During INCIDENT mode, disable:
- Destructive actions (bulk delete, hard delete)
- Bulk edits affecting many records
- Schema changes
- Data exports of large datasets

Allow only:
- Essential driver operations (start/end shift, job stages)
- Event recording
- Read-only views

---

## 19. RECOVERY PLAYBOOK

Step-by-step incident response:

1. Detect incident (alert or report)
2. Switch system to INCIDENT mode
3. Notify team via designated channel
4. Monitor sync queues for backlog
5. Identify root cause
6. Fix and deploy
7. Restore services
8. Replay queued events
9. Run reconciliation checks
10. Verify system integrity
11. Close incident
12. Write post-mortem within 48 hours

---

## MINIMUM SAFE VERSION (BEFORE FIRST PAYING CUSTOMER)

These must be in place:

- [x] Tenant isolation enforced via JWT — companyId injected from JWT, all queries scoped
- [x] Soft deletes for operational data — status fields used throughout
- [x] .env not in git — all .env files in .gitignore
- [x] HTTPS in production — Railway + Vercel both enforce HTTPS
- [x] Idempotency via clientEventId UNIQUE — @@unique([companyId, clientEventId]) on JobExecutionEvent
- [x] Event-based data model — JobExecutionEvent table, sync endpoint live
- [x] Per-stop location IDOR fixed — savedLocationId validated against companyId before write (fixed 2026-05-05)
- [ ] Database backups verified by restore test — Railway auto-backups exist but restore NOT tested
- [ ] Staging environment separate from production — NO staging, all deploys go direct to production
- [ ] Migration safety — using `prisma db push` NOT `prisma migrate deploy` (see note below)
- [ ] Structured logging with requestId/userId/companyId — Fastify logger enabled but NOT structured per request
- [ ] Error monitoring (Sentry) — NOT set up
- [ ] System state banner (manual toggle) — NOT built
- [ ] Manual override flag for planner — NOT built
- [ ] /health endpoint with metrics — EXISTS but minimal (only checks DB reachable, no queue depth or latency)
- [ ] Tenant isolation integration test on every deploy — NOT built
- [ ] Rollback procedure documented and tested — NOT documented

---

## BUILD ORDER (NEXT 90 DAYS)

### Phase 1 — Foundation (now)
- Idempotency (clientEventId)
- Event-based model for job status
- Tenant isolation test

### Phase 2 — Offline driver flow
- AsyncStorage queue
- Sync engine with backoff
- UI sync indicators
- Logout protection

### Phase 3 — Reliability
- Sentry error monitoring
- /health endpoint with metrics
- Database backup restore test
- Documented rollback procedure

### Phase 4 — Operational maturity
- System state banners
- Manual override for planner
- Reconciliation flagging
- Per-tenant rate limiting

### Phase 5 — Scale safety
- Automated incident detection
- Reconciliation dashboard
- Post-mortem template
- Disaster recovery quarterly tests

---

## 20. KNOWN VULNERABILITIES — FOUND AND FIXED

Track every security issue discovered, even after fixing, so patterns are not repeated.

| Date | Issue | Severity | Fix |
|------|-------|----------|-----|
| 2026-05-05 | Per-stop `savedLocationId` not validated against `companyId` — planner could reference another company's saved location | CRITICAL (IDOR) | Added company check before transaction in POST/PATCH /jobs |
| 2026-05-05 | `bookedTime`, `earliestArrivalMinutes`, `unloadingAllowanceMinutes` accepted by API but never written to DB — silent data loss | CRITICAL | Added to stop create/createMany mapping in jobs.ts |
| 2026-05-05 | Vehicle types, trailer types, load units from form rejected by server constants — `ready_to_plan` saves blocked for most vehicle types | HIGH | Expanded VEHICLE_CLASSES, TRAILER_TYPES, LOAD_UNITS in jobCreation.ts |
| 2026-05-05 | `earliestArrival` HH:MM conversion used raw `split(":").map(Number)` — NaN if input malformed | MEDIUM | Replaced with `toMins()` helper which returns null for NaN |
| 2026-05-05 | Datetime strings built without timezone (`T14:30:00` not `T14:30:00.000Z`) — ambiguous UTC vs local | MEDIUM | Appended `.000Z` to all constructed stop datetimes |
| 2026-05-05 | DATABASE_PUBLIC_URL password exposed in chat session | HIGH | ⚠️ ROTATE POSTGRES PASSWORD IN RAILWAY IMMEDIATELY |

### Pattern: IDOR on related records
Any time a client sends an ID referencing a related record (location, driver, customer, template), validate that record belongs to `companyId` before writing. The top-level job's companyId check is not enough — check every foreign key separately.

### Pattern: Silent field drops
When adding new fields to a form, always audit that they are: (1) in the API request type, (2) mapped in the route handler create block, AND (3) mapped in the route handler update block. Missing any one of the three causes silent data loss.

---

## ENFORCEMENT

### Every specialist chat must:
- Read this file before starting safety-critical work
- Reject any task that violates these rules without explicit override from Brain
- Add new safety rules learned from incidents back into this file

### Brain must:
- Check every architecture decision against:
  - Section 1 (system states)
  - Section 6 (tenant isolation)
  - Section 4 (event-based model)
  - Section 7 (data cleanup)
  - Section 3 (idempotency)
- Reject specialist proposals that violate safety rules
- Sequence safety improvements based on customer maturity

---

## FINAL TRUTH

Skip any of these and you will:
- Lose data
- Mix companies (catastrophic)
- Block drivers
- Corrupt history

In logistics, that kills trust fast. Trust takes years to rebuild.

Build the foundations right. Iterate on top.
