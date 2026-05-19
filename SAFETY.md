# LogisticBay — Safety & Agent Operating Rules

> Two things in one place: how agents must behave, and what the system must protect.
> Read this before touching any code. No exceptions.
> Last updated: 2026-05-19

---

## PART 1 — AGENT DISCIPLINE

### Rule hierarchy

When rules conflict, this order wins:

1. Production safety
2. Tenant isolation
3. Data integrity
4. Offline / event durability
5. Security / authentication
6. Existing approved architecture
7. Project truth files (CLAUDE.md, this file, STATUS.md, ARCHITECTURE.md)
8. Task-specific instructions
9. Cleanup / refactor quality
10. Code style / preferences

Never improve style by weakening safety.
Do not delete safety code to clean files.
Do not bypass validation to make a feature work.
Do not change architecture because another pattern looks cleaner.

---

### Workflow rule

Default workflow for every task:

1. Inspect existing code
2. Identify exact files involved
3. Explain intended change
4. Identify risk level
5. Make the smallest safe change
6. Run relevant checks
7. Report result — files changed, what changed, why, safety impact, checks run, risks left, next step

Do not jump straight to implementation on risky work.

---

### Stop-before-risk rule

Stop before implementation if the task touches:

- Deployment files or production startup scripts
- Database schema, migrations, or data deletion
- Auth / JWT / session logic
- Tenant isolation
- Offline sync or idempotency
- Audit logging or secrets / env vars
- Package manager or lock files
- CI/CD config or mobile app config
- Rollback / compatibility code

When stopping, explain: (1) the problem, (2) why it matters, (3) options including "do nothing." No implementation until the decision is made.

---

### No silent rule conflicts

If a rule conflict appears, stop. Identify the conflict, quote both rules, explain the risk, offer options including "do nothing," and wait for a decision. Never silently choose between conflicting rules.

---

### Small change rule

No large rewrites unless explicitly requested. One file, one purpose, one behaviour change per commit.

Do not mix: feature work + cleanup + refactor + database change + deployment change + dependency upgrades.

---

### Existing architecture wins

Existing approved architecture has priority over agent preference. Do not introduce a new architecture style casually, partially migrate, or invent generic frameworks inside the app. If architecture needs to change, stop and propose options.

---

### No premature abstraction

Do not create abstractions before at least two real use cases exist. Avoid generic managers, engines, builders, base classes, universal wrappers, "future-proof" systems. Abstract on proven repetition, not prediction.

---

### Dead code rules

Allowed without approval: unused imports, unused local variables, unreachable local branches, old commented-out code, duplicate comments, unused helpers inside the same edited file.

Approval required before deleting: whole files, API routes, database fields, migrations, deployment/config files, auth/security code, offline/sync code, audit/logging code, compatibility shims, deprecated files still referenced anywhere.

Before deleting non-trivial code, prove: (1) not imported anywhere, (2) not used by routing/config/tests/scripts, (3) not used by dynamic imports, (4) not kept for rollback/migration/compatibility, (5) not needed by older mobile/web clients.

---

### Protected files

Never delete, rename, or heavily rewrite these without explicit approval:

- `package.json`, lock files, `Dockerfile`
- `railway.json`, `vercel.json`, `eas.json`, `app.json`, `app.config.*`
- `vite.config.*`, `tsconfig.*`
- `prisma/schema.prisma`, `prisma/migrations/*`
- All start scripts, CI workflow files, environment example files
- `DEVLOG.md`, `SAFETY.md`, `STATUS.md`, `ARCHITECTURE.md`, `CLAUDE.md`

Project truth files may be appended. Historical logs must not be rewritten unless explicitly instructed.

---

### Behaviour preservation rule

During refactor, behaviour must remain unchanged unless explicitly requested. Do not change API response shape, rename fields, change UI flow, change validation behaviour, change defaults, change error handling, or change persistence behaviour. If behaviour changes are necessary, split them into a separate proposed change.

---

### The puzzle rule

Every task is one piece of a larger puzzle. Before implementing anything: understand what already exists, identify naming conventions and file structure in use, find how similar features are done elsewhere, make the new piece look like it always belonged there. Never bolt something on. Never introduce a new pattern when an existing one fits.

---

### No mixed parts

Do not mix styles, patterns, or conventions within one area of the codebase. Examples of forbidden mixing: raw SQL in a route that uses Prisma everywhere else; a new validation style alongside existing Zod schemas; a new UI pattern in a page that uses established components; cleanup combined with feature work in the same change. If a pattern does not exist yet, propose it first.

---

### Verification rule

After code changes, run relevant checks:
- API: `tsc --noEmit`, tests if available, `prisma validate` if schema changed
- Web: build + `tsc --noEmit`
- Mobile: `tsc --noEmit`, Expo config check if app config changed

Never claim tested unless a command was actually run.

---

### No deployment / database / auth / sync guessing

Before changing deployment/build config — stop and answer: which environment is affected? How does production start today? Does rollback still work? Are env vars unchanged? If unknown, stop.

Before schema/migration/data changes — stop and answer: is this destructive? Is this backwards compatible? Does existing code still work during deploy? Is there a rollback path? Is data preserved? Does tenant isolation still hold? If unknown, stop.

Never guess around `companyId`, JWT, refresh tokens, roles, permissions, ownership checks, or related-record validation. If unsure, stop.

Never casually change queue structure, `clientEventId` behaviour, retry behaviour, failed event retention, sync response parsing, optimistic UI behaviour, or offline login/cache assumptions. Drivers must not lose work because an agent "cleaned up" sync code.

---

## PART 2 — PRODUCTION SAFETY STANDARDS

### Core principle

The system must fail safely. No data loss. No cross-company leaks. Drivers can always work. System can recover and reconcile.

---

### System states

NORMAL → DEGRADED → INCIDENT

**NORMAL** — full functionality.

**DEGRADED** — reads OK, writes risky. Warnings shown to users.

**INCIDENT** — backend unreliable. Switch to offline-first. Restrict risky operations.

MVP: manual feature flag to toggle states. Show banner in driver app + planner dashboard. Log incident start/end timestamps.

---

### Driver app — offline-first core

All actions saved locally first. Always.

- AsyncStorage for event queue (MVP). Migrate to SQLite when queue regularly exceeds 50 events.
- Idempotency key required on every event (`clientEventId`).
- Sync retry with exponential backoff. Never drop failed events. Retry on: app opens, network returns, manual refresh, heartbeat every 30s while active.
- Block logout if unsynced events exist. Show warning: "X actions waiting to sync." Override only if explicitly confirmed (track in audit log).
- UI sync state must always be visible: ✅ Synced · ⏳ Pending · ⚠ Failed (retrying) · 📶 Offline mode.
- Offline startup allowed (stored session, cached jobs, offline actions). First-time login without internet NOT allowed.

---

### Backend safety — idempotency (mandatory)

Every event must include `clientEventId` (UUID generated on phone).

Database constraint: `UNIQUE(companyId, clientEventId)`.

Behavior: duplicate event → return success (don't error). Same retry 100 times = saved once.

Backend must verify on every event:
1. Driver belongs to company (via JWT)
2. Driver assigned to job (or had access at clientTimestamp)
3. Status transition is allowed
4. Event not duplicate
5. Timestamp not >7 days old or >1 hour in future

---

### Tenant isolation — CRITICAL, ZERO TOLERANCE

Every query must scope by `companyId` from `request.user.companyId`. Never trust frontend.

- Middleware injects companyId from JWT.
- All reads, writes, updates, deletes, counts, summaries, search queries, and background jobs are scoped by companyId.
- Every related ID must be validated inside companyId before use: customerId, driverProfileId, savedLocationId, templateId, fleet unit/trailer IDs, jobId, jobPartId, runId, assignmentId.
- Create routes write companyId from JWT only. Update/delete routes find row by `{ id, companyId }` first, then mutate.
- Raw SQL must include companyId predicates and must be reviewed as high risk.
- Integration test on every deploy proves Company A cannot read Company B data.

Failure consequence: catastrophic. End of business. Test relentlessly.

---

### Scale and search safety

Do not build pages that load all tenant data into the browser.

- Dashboard must use dedicated server-side endpoints.
- Jobs list must support server-side filters and pagination.
- Search must be server-side and tenant-scoped.
- Summary counts computed server-side.

Every new list/dashboard/search/export must answer: Where is companyId enforced? Max rows returned? Which index supports it? Does it paginate? Can it leak another tenant through related records? If not answered, do not ship.

AI must not scan all tenant data live on a request. Only background per-company analysis, cached recommendations, rule-based warnings, and tenant-scoped search results passed into AI.

---

### Database safety

- Managed PostgreSQL only (Railway). Daily automatic backups. Separate staging + production databases.
- No destructive migrations in production. Use transactions for critical writes.
- Production startup uses `prisma migrate deploy`. `prisma db push` only for local development.
- Safe migration flow: (1) add nullable field, (2) deploy code that handles both, (3) migrate data, (4) deploy code requiring new field, (5) remove old field in separate migration. Never combine schema change + data migration.
- Failed migration recovery: if Prisma `P3009`, use `prisma migrate resolve --rolled-back <migration_name>` then `prisma migrate deploy`.
- Idempotent migration rule: when creating a named constraint, guard both `pg_constraint.conname` and `pg_class.relname`.

---

### Soft delete

Never hard delete operational data. Use status fields: active / inactive / archived / cancelled / removed.

Hard delete only for: GDPR right-to-erasure requests, test data cleanup in dev/staging.

---

### Secrets

- `.env` never committed to git. Use platform secrets (Railway, Vercel).
- Rotate any exposed secret within 24 hours.
- Never log tokens, passwords, or PII.
- Separate secrets for dev/staging/production.
- `JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET`. Server must refuse to start if either is missing or equal.
- `NODE_ENV=production` must be set in production.

---

### Logging (mandatory)

Every request must log: requestId (UUID), userId, companyId, jobId (if applicable), route, statusCode, error details, duration.

MVP: Fastify built-in logger, JSON format, ship to Railway logs, add Sentry for errors.

---

### Hack protection — key rules

**Phishing/stolen passwords:** MFA for planner/owner/admin. Login audit records. Session/device view. Ability to revoke sessions.

**Auth logic:** JWT secrets separate, stored only in platform secrets. Access tokens short-lived. Refresh tokens stored hashed only. Refresh token reuse revokes token family.

**SQL injection:** Use Prisma APIs. Raw SQL is high risk, must use parameter binding, never string interpolation with user input.

**API abuse:** Global + per-IP + per-account + per-company rate limits. Public request form throttling. Sync endpoint max batch size. Server-side pagination.

**File uploads (before adding any):** Enforce size limits, validate MIME type, sniff file content, virus scan, store in object storage outside app runtime, private bucket defaults, signed URLs, per-tenant ownership check.

**Browser/frontend:** Do not use `dangerouslySetInnerHTML` without review. Add security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. Avoid long-lived secrets in `localStorage`.

---

### API / server protection

Required (MVP):
- Auto-restart on crash — ✅ Railway provides
- `/health` endpoint — ✅ EXISTS (minimal — only checks DB reachable)
- Structured logging — ✅ implemented (requestId/userId/companyId per request)
- Error monitoring (Sentry) — ❌ NOT set up
- Staging environment — ❌ NOT set up
- Rollback capability — ❌ NOT documented or tested

---

### Recovery playbook

1. Detect incident (alert or report)
2. Switch system to INCIDENT mode
3. Notify team
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

### Data cleanup policy

Synced events on phone: delete after 7–14 days.
Completed jobs in mobile cache: delete after 3–7 days.
Photos uploaded: delete local copy after URL confirmed.
Backend logs: rotate after 30–90 days.

Never delete: pending events, failed events, unsynced photos, active jobs, audit log entries.

---

## PART 3 — KNOWN VULNERABILITIES (FOUND AND FIXED)

| Date | Issue | Severity | Fix |
|------|-------|----------|-----|
| 2026-05-05 | Per-stop `savedLocationId` not validated against `companyId` — IDOR | CRITICAL | Added company check before transaction in POST/PATCH /jobs |
| 2026-05-05 | `bookedTime`, `earliestArrivalMinutes`, `unloadingAllowanceMinutes` accepted but never written to DB — silent data loss | CRITICAL | Added to stop create/createMany mapping in jobs.ts |
| 2026-05-05 | Vehicle types / trailer types / load units rejected by server constants — saves blocked for most vehicle types | HIGH | Expanded VEHICLE_CLASSES, TRAILER_TYPES, LOAD_UNITS in jobCreation.ts |
| 2026-05-05 | `earliestArrival` HH:MM conversion used raw `split(":").map(Number)` — NaN if malformed | MEDIUM | Replaced with `toMins()` helper returning null for NaN |
| 2026-05-05 | Datetime strings built without timezone — ambiguous UTC vs local | MEDIUM | Appended `.000Z` to all constructed stop datetimes |
| 2026-05-05 | DATABASE_PUBLIC_URL password exposed in chat session | HIGH | ⚠️ Rotate Postgres password in Railway |

**Pattern — IDOR on related records:** Any time a client sends an ID referencing a related record, validate that record belongs to `companyId` before writing. The top-level job's companyId check is not enough — check every foreign key separately.

**Pattern — Silent field drops:** When adding new fields to a form, always audit that they are: (1) in the API request type, (2) mapped in the route handler create block, AND (3) mapped in the route handler update block. Missing any one causes silent data loss.

---

## PART 4 — SECURITY REVIEW TODO

### Critical before production/customer rollout

- [ ] Restrict `GET /dashboard` to planner/owner roles only
- [ ] Lock down `PATCH /jobs/:id/status` so only assigned drivers can submit driver workflow updates
- [ ] Lock down `POST /jobs/:id/note` so drivers can only add notes to assigned jobs
- [ ] Validate `customerId` on `POST /request-links` against `request.user.companyId`
- [ ] Run `npm audit --prefix api --omit=dev` — last review found 1 critical, 10 high, 5 moderate
- [ ] Ensure Railway sets `NODE_ENV=production`
- [ ] Add automated CI checks for typecheck, tests, tenant isolation, and dependency audit before deploy

### High priority hardening

- [ ] Move refresh tokens out of `localStorage` or use httpOnly secure refresh cookies + CSRF
- [ ] MFA/2FA for planner and company owner accounts
- [ ] Login/session audit records
- [ ] Account lockout / progressive delay for repeated failed logins per email/IP/company
- [ ] Public intake abuse protection: per-token rate limits, CAPTCHA or email verification
- [ ] Request size/body limits on all JSON endpoints
- [ ] Security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [ ] Sentry or equivalent error monitoring

### Verified strengths

- [x] Tenant isolation pattern mostly correct: API routes use `request.user.companyId`
- [x] Existing tenant isolation integration test: 27/27 tests passing
- [x] Prisma used for normal DB access — SQL injection risk low
- [x] Access tokens short-lived, refresh tokens stored hashed with rotation/reuse detection
- [x] No real file upload attack surface yet
- [x] Web production dependency audit: 0 vulnerabilities at review time

---

## MINIMUM SAFE VERSION (BEFORE FIRST PAYING CUSTOMER)

- [x] Tenant isolation enforced via JWT
- [x] Soft deletes for operational data
- [x] `.env` not in git
- [x] HTTPS in production (Railway + Vercel)
- [x] Idempotency via `clientEventId` UNIQUE
- [x] Event-based data model (JobExecutionEvent table, sync endpoint live)
- [x] Per-stop location IDOR fixed
- [x] Migration safety (`prisma migrate deploy` on production startup)
- [x] Structured logging with requestId/userId/companyId
- [ ] Database backups verified by restore test
- [ ] Staging environment separate from production
- [ ] Error monitoring (Sentry)
- [ ] System state banner (manual toggle)
- [ ] /health endpoint with real metrics
- [ ] Tenant isolation integration test on every deploy
- [ ] Server-side dashboard endpoint (not client-filtered)
- [ ] Pagination on high-volume list endpoints
- [ ] Database indexes reviewed against production queries
- [ ] Rollback procedure documented and tested
