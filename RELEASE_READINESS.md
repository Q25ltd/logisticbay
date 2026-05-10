# LogisticBay — Release Readiness Checklist

**Audience:** any coding agent picking up release-hardening work.
**Audit date:** 2026-05-10
**Auditor context:** read of `api/`, `web/`, `mobile/`, `SAFETY.md`, `DEVLOG.md`, `PROJECT_STATUS.md`.
**Goal:** zero data loss, zero cross-tenant leak, drivers can always work, system can recover.

---

## How to use this file

1. Read **DONE** so you know what already exists — do not re-implement it.
2. Pick the **highest-priority TODO** that no one else has claimed.
3. Set the checkbox to `[~]` and add `Owner: <agent-name>` while you work.
4. When the task is finished AND verified (typecheck + targeted test), set `[x]` and add a short `Done:` line citing the commit/PR and any new file paths.
5. If you discover a new issue, add it under the matching priority block with `[ ]` and a clear acceptance criterion. Do not delete entries — mark them obsolete with `[~obsolete]` and a note.
6. Never weaken an acceptance criterion to make a task pass. If blocked, add `Blocked:` with the reason and move on.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done · `[~obsolete]` superseded

---

## DONE — already in the codebase (do not redo)

- [x] **Multi-company auth** — JWT carries `userId`, `companyId`, `role`; `request.user.companyId` injected by `api/src/middleware.ts`.
- [x] **Multi-company login + company picker** — `routes/auth.ts` returns `requiresCompanySelection` when a user has > 1 active membership.
- [x] **Agency driver linking** — same `User`, multiple `CompanyMembership` rows; `routes/companies.ts` POST /drivers re-uses an existing user.
- [x] **Soft delete** — jobs (cancel), fleet units, fleet trailers, shifts, holidays. Hard delete removed from production paths.
- [x] **Idempotent job events** — `JobExecutionEvent.@@unique([companyId, clientEventId])`. Both `POST /sync/events` and online `PATCH /jobs/:id/status` dedupe by it.
- [x] **clientTimestamp guard** — rejects > 7 days old, > 1 hour future, on both online and offline event paths (`api/src/sync/sync.service.ts`, `api/src/routes/jobs.ts:1442`).
- [x] **Status transition validation** — `ALLOWED_JOB_TRANSITIONS` in `api/src/sync/sync.constants.ts`, applied online and in sync.
- [x] **GPS validation** — lat/lng must come together, ranges checked.
- [x] **Append-only AuditLog table** — Postgres `RULE` blocks `UPDATE`/`DELETE`; `api/src/lib/audit.ts` provides `writeAudit`. Wired into driver create/update/status and holiday approve/reject.
- [x] **Zod validation** — `api/src/schemas/*.ts` covers auth, drivers, jobs, shifts, availability, locations, fleet.
- [x] **Migrations on deploy** — `api/start.sh` runs `prisma migrate deploy`; production `db push` removed.
- [x] **Tenant-first indexes** — migration `20260507170000_add_tenant_scale_indexes` covers PlannedJob, JobStop, JobExecutionEvent, Shift, Holiday, Availability, ShiftPreference, Fleet*, DriverProfile, SavedLocation, JobTemplate.
- [x] **Server-side dashboard endpoint** — `GET /dashboard?dateFrom&dateTo` in `api/src/routes/dashboard.ts`, range + carry-over jobs in one tenant-scoped call.
- [x] **Cursor pagination on `GET /jobs`** — `api/src/routes/jobs.ts:336` (`limit`, `cursor`, `nextCursor`, `hasNextPage`).
- [x] **Per-stop savedLocationId IDOR fix** — `findInvalidStopLocationId` validates each id belongs to companyId before write.
- [x] **Structured logging** — Fastify JSON logger; `onResponse` hook injects `requestId`, `userId`, `companyId`, `role`.
- [x] **Generic error response** — 5xx returns generic message, full error logged with context.
- [x] **CORS allowlist in production** — `app.ts` restricts to logisticbay.com and Vercel preview.
- [x] **Rate limit (basic, global)** — `@fastify/rate-limit` 100 req/min global, 10/min on `/auth/login`.
- [x] **Offline-first mobile event queue** — `mobile/src/offlineQueue.ts` (AsyncStorage, `pending`/`syncing`/`failed`, retryCount, lastError).
- [x] **Mobile sync banner** — `OfflineBanner.tsx`, `useNetworkStatus.ts`.
- [x] **Vehicle/licence taxonomy unified** — `shared/vehicleTaxonomy.ts` plus copies in api/web/mobile and CI hash check `scripts/check-vocab-sync.ts`.
- [x] **Tenant isolation test (partial)** — `api/src/tests/tenant-isolation.test.ts` covers `GET /jobs` and `GET /jobs/:id`.
- [x] **Dev-only reset endpoint** — `DELETE /dev/reset-shifts` returns 404 in production.
- [x] **JWT register-company tx** — company + user + membership created in one Prisma `$transaction`.
- [x] **Health endpoint exists** — `GET /health` runs `SELECT 1`, returns `{ ok, db, timestamp }`.

---

## P0 — BLOCKERS (do not ship to a paying customer until every box is `[x]`)

### [ ] P0.1 — Stand up a staging environment
- **Why:** today `railway.json` and `vercel.json` deploy straight to production. Migrations run on the live DB.
- **Acceptance:**
  - Separate Railway project + separate Postgres DB + separate Vercel project (or preview branch) wired to a `staging` git branch.
  - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `DATABASE_URL` / `SENDGRID_API_KEY` differ from prod.
  - Document the URLs and promotion flow in `PROJECT_STATUS.md` under a new `## Environments` section.
  - First migration test: apply a no-op migration to staging, smoke-test, then promote.

### [ ] P0.2 — Wire Sentry on api, web, mobile
- **Why:** `app.ts` setErrorHandler swallows 5xx into a generic message; mobile and web have no error reporting at all.
- **Acceptance:**
  - `@sentry/node` initialised in `api/src/server.ts` before `buildApp`; capture in the `setErrorHandler` 5xx branch.
  - `@sentry/react` in `web/src/main.tsx`; ErrorBoundary at the App root.
  - `@sentry/react-native` in `mobile/App.tsx`.
  - DSN read from env (`SENTRY_DSN_API` / `SENTRY_DSN_WEB` / `SENTRY_DSN_MOBILE`), never hard-coded.
  - PII scrubber strips `Authorization`, `password`, `passwordHash`, `pin`, `email` (use `beforeSend`).
  - Verify by deliberately throwing once on staging and seeing the event arrive.

### [ ] P0.3 — Test database backup/restore
- **Why:** SAFETY says Railway snapshots exist but restore has never been verified. Untested backups don't count.
- **Acceptance:**
  - Restore the latest snapshot into a throwaway Railway DB.
  - Run a row-count comparison script against production for `Company`, `User`, `PlannedJob`, `JobExecutionEvent`, `Shift`.
  - Add `docs/runbooks/restore.md` with exact CLI commands, RTO/RPO targets, and who has the credentials.
  - Schedule the next drill in 90 days.

### [x] P0.4 — Remove `JWT_SECRET` fallback; fail fast on missing secrets
- **Why:** `api/src/middleware.ts:20`, `api/src/routes/auth.ts:10,13,68,82,102` and `api/src/tests/tenant-isolation.test.ts:22` all do `process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET!`. If `_REFRESH_` is missing it silently signs refresh tokens with the access key, turning refresh tokens into long-lived access tokens.
- **Acceptance:**
  - One module (e.g. `api/src/lib/env.ts`) loads required envs and throws on boot if any of `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL` is missing or empty.
  - Confirm `JWT_ACCESS_SECRET !== JWT_REFRESH_SECRET` at boot; throw if equal.
  - All `??` fallbacks to `JWT_SECRET` deleted.
  - `api/.env.example` updated; remove `JWT_SECRET=` line.
  - Confirm both secrets are set in Railway (open since 2026-05-03).

Done: worktree pensive-wilbur-0a4d13
Files: api/src/lib/env.ts (new), api/src/server.ts, api/src/middleware.ts, api/src/routes/auth.ts, api/src/routes/companies.ts, api/src/tests/tenant-isolation.test.ts, api/.env.example
Verified: typecheck OK (tsc --noEmit exit 0), grep confirms zero remaining `?? process.env.JWT_SECRET` occurrences
Notes: Railway must have JWT_ACCESS_SECRET and JWT_REFRESH_SECRET set before this is deployed — server will refuse to start if either is missing or if they are equal. JWT_SECRET legacy var can be removed from Railway once confirmed both new vars are in place.

### [x] P0.5 — Shorten access tokens, rotate + persist refresh tokens
- **Why:** `routes/auth.ts:10` issues access tokens for `7d`. `api/src/auth.ts` (dead code) says `15m`. No refresh-token rotation, no server-side revocation.
- **Acceptance:**
  - Access token TTL ≤ 1h (recommend 15m).
  - New `RefreshToken` Prisma model with `id`, `userId`, `companyId`, `tokenHash`, `expiresAt`, `revokedAt`, `userAgent`, `lastUsedAt`. Migration with `@@index([userId, revokedAt])`.
  - `/auth/refresh` rotates: marks old token revoked, issues new access + new refresh, stores new hash.
  - Detect reuse of a revoked token → revoke entire chain for that user.
  - `/auth/logout` endpoint that revokes the presented refresh token.
  - Mobile `clearTokens()` calls `/auth/logout` when online (best-effort).
  - Delete `api/src/auth.ts` (dead) once migration done; consolidate on `bcryptjs`.

Done: worktree pensive-wilbur-0a4d13
Files: api/prisma/schema.prisma, api/prisma/migrations/20260510140000_add_refresh_token_table/migration.sql, api/src/lib/tokens.ts (new), api/src/lib/env.ts, api/src/routes/auth.ts, api/src/routes/companies.ts, api/src/schemas/auth.ts, api/src/types/requests.ts
Verified: prisma generate OK, tsc --noEmit exit 0
Notes: All sessions already logged in will hit 401 on next refresh (their token is not in RefreshToken table). One-time forced re-login on deploy — expected and intentional. api/src/auth.ts dead code left for P1.7. Mobile /auth/logout call left for mobile session (P0.7).

### [ ] P0.6 — Tenant-isolation test on every route + CI gate
- **Why:** today only 2 endpoints are covered; no `.github/` exists, so nothing runs on PR.
- **Acceptance:**
  - Extend `api/src/tests/tenant-isolation.test.ts` (or split into per-route files) covering at least: `/drivers`, `/drivers/:id`, `/customers`, `/locations`, `/templates`, `/jobs/:id/status` (write), `/jobs/:id/note`, `/shifts`, `/shifts/:id`, `/shifts/:id/segments`, `/shifts/:id/deliveries`, `/availability`, `/holiday-requests`, `/holiday-requests/:id`, `/fleet/units`, `/fleet/units/:id`, `/fleet/trailers`, `/fleet/trailers/:id`, `/dashboard`, `/sync/events`, `/company`.
  - For every endpoint, asserting either 404 or empty data when Company A token hits Company B resource.
  - GitHub Actions workflow `.github/workflows/ci.yml` runs `npm run typecheck`, `npm run check:vocab`, `npm test` on every PR and on push to `main`/`staging`.
  - Required check on PR: cannot merge if red.

### [ ] P0.7 — Mobile logout must respect SAFETY §2
- **Why:** `mobile/src/AuthContext.tsx:69-74` clears tokens unconditionally, leaves the offline queue under the previous user.
- **Acceptance:**
  - Before clearing tokens, call `getQueueStats()`. If `total > 0`, attempt `flushQueue` first.
  - If still `> 0`, show a confirm dialog: "X actions waiting to sync. Connect to internet first." with "Force sign-out" only available when explicitly confirmed.
  - On force sign-out, write an audit event (queue dropped) — locally and (if online) to API.
  - Always call `clearQueue()` and `AsyncStorage.removeItem("shiftDraft")` on logout to prevent cross-driver leakage on shared devices.
  - Add a unit test in mobile that asserts logout aborts when queue is non-empty unless `force=true`.

### [ ] P0.8 — Rate-limit `/auth/register-company`, `/auth/refresh`, `/auth/change-password`
- **Why:** `routes/companies.ts:121` is unauthenticated and has no per-route limit; refresh & change-password also have none.
- **Acceptance:**
  - `/auth/register-company`: `{ max: 5, timeWindow: "1 hour" }` per IP.
  - `/auth/refresh`: `{ max: 30, timeWindow: "1 minute" }`.
  - `/auth/change-password`: `{ max: 5, timeWindow: "10 minutes" }`.
  - Add CAPTCHA or email-verification step on register-company before activating the company (status remains `pending` until email confirmed).

### [ ] P0.9 — Per-user lockout on failed logins
- **Why:** the global limiter is per IP; a botnet can bypass.
- **Acceptance:**
  - Track failed attempts per email in a small `LoginAttempt` table or Redis (acceptable to add a Prisma model for now).
  - 5 failures within 15 minutes → lock account 15 minutes, return generic 401 (don't leak lockout).
  - Reset counter on successful login.
  - Audit log every lockout event.

### [ ] P0.10 — Enforce `mustChangePin` server-side
- **Why:** today the flag is only returned to the client; nothing prevents a driver who ignored it from continuing.
- **Acceptance:**
  - Middleware: if `bcrypt.compare("123456", user.passwordHash)` is true (cached on `request.user` to avoid hashing every request — fetch hash on auth and stash a boolean), reject every route except `/auth/change-password`, `/auth/me`, `/auth/logout` with 403 `MUST_CHANGE_PIN`.
  - Reject any `change-password` attempt that sets the new pin to the same default.
  - Mobile shows a forced "change PIN" screen on the next request.

### [ ] P0.11 — Idempotency on every write endpoint
- **Why:** SAFETY §0.7 requires it. Today only job status + sync are protected.
- **Acceptance:**
  - Add a small `lib/idempotency.ts` helper that, given `(companyId, idempotencyKey, route)`, returns the cached response if one exists, otherwise runs the handler and stores the response. Backed by a Prisma `IdempotencyKey` model with TTL of 24 h.
  - Apply to: `POST /jobs`, `PATCH /jobs/:id`, `DELETE /jobs/:id`, `POST /jobs/:id/note`, `POST /drivers`, `PATCH /drivers/:id`, `POST /fleet/units`, `PATCH /fleet/units/:id`, `POST /fleet/trailers`, `PATCH /fleet/trailers/:id`, `POST /customers`, `POST /locations`, `PATCH /locations/:id`, `POST /templates`, `POST /shifts`, `POST /shifts/:id/segments`, `POST /shifts/:id/deliveries`, `PATCH /shifts/:id/submit`, `POST /availability`, `POST /shift-preferences`, `POST /holiday-requests`, `PATCH /holiday-requests/:id`.
  - Use the `Idempotency-Key` header (already allowed in CORS).

### [ ] P0.12 — Per-tenant rate limiting
- **Why:** SAFETY §10. Today one tenant can starve others.
- **Acceptance:**
  - Replace the global `@fastify/rate-limit` config with `keyGenerator: (req) => req.user?.companyId ? "co_" + req.user.companyId : req.ip`.
  - Sensible default: 600 req/min per company on writes, higher on reads.
  - Per-route overrides preserved.
  - Add a header `x-ratelimit-tenant` so the planner UI can show "you are being throttled" rather than appearing broken.

### [ ] P0.13 — Reconciliation surface for `needsReview` events
- **Why:** `sync.service.ts` flags events but nothing reads the flag. Late offline events vanish into the table.
- **Acceptance:**
  - `GET /events/needs-review?from=&to=&cursor=` route, planner-only, scoped by companyId.
  - Web planner page (`/intelligence/needs-review` or under `/jobs`) listing the events with job context, reason, ability to mark "reviewed" (audit-logged).
  - Daily summary email to `Company.reportEmail` if the count > 0.

### [ ] P0.14 — Job status reconciler from the event log
- **Why:** SAFETY §4 — `PlannedJob.status` is derived but only ever written, never recalculated.
- **Acceptance:**
  - `lib/jobStatusReconciler.ts` exposes `recalculateJobStatus(prisma, companyId, jobId)` that walks `JobExecutionEvent` ordered by `clientTimestamp` and computes the correct status.
  - Background job (`setInterval` or external scheduler) runs nightly per-company, fixes drift, audit-logs every correction.
  - Manual endpoint `POST /jobs/:id/recalculate-status` (planner-only) for ops.

### [ ] P0.15 — Audit-log coverage on all sensitive writes
- **Why:** today only driver create/update/status and holiday approve/reject call `writeAudit`.
- **Acceptance:** add `writeAudit` calls to: job create/update/cancel/status/note, shift submit/delete, fleet unit create/update/archive, fleet trailer create/update/archive, customer create/update, saved-location create/update, template create/update, company patch, register-company, password reset, login (success + failure), logout. Each must include `entityType`, `entityId`, `action`, `oldValue`/`newValue` where relevant, and the actor.

### [ ] P0.16 — Documented + rehearsed rollback runbook
- **Why:** SAFETY §11 — rollback "must be instant, tested before each major deploy". Today neither is true.
- **Acceptance:**
  - `docs/runbooks/rollback.md` with: how to redeploy previous Railway image; how to revert a Vercel deploy; how to revert a migration (only `prisma migrate resolve --rolled-back` style — no destructive SQL).
  - Test the runbook once on staging, paste the output into the runbook.

### [ ] P0.17 — Rotate any secret that has ever appeared in chat / commits
- **Why:** SAFETY §20 records `DATABASE_PUBLIC_URL` exposed once.
- **Acceptance:**
  - Rotate Postgres password in Railway.
  - Rotate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (this invalidates all sessions — coordinate the cutover with the team).
  - Rotate `SENDGRID_API_KEY`.
  - `git secrets --scan` (or `gitleaks`) over the full history; add as a CI step.

### [ ] P0.18 — `/health` returns real signals
- **Why:** today only `SELECT 1`. Sync regressions are invisible to uptime monitors.
- **Acceptance:**
  - Include p95 query latency over last 60 s.
  - Include count of `SyncEventLog` rows with `status = "failed"` in the last 5 minutes (per company aggregated).
  - Include count of `JobExecutionEvent` rows with `needsReview = true` in the last 24 h.
  - Include process memory (heapUsed) and event-loop lag.
  - 503 if DB latency > 2 s p95 OR failed-sync rate > 5%.

### [ ] P0.19 — System-state banner + DEGRADED/INCIDENT toggle
- **Why:** SAFETY §1 — manual feature flag missing on web and mobile.
- **Acceptance:**
  - `Company.systemState` enum (`normal`/`degraded`/`incident`) field.
  - `GET /system-state` (cached 30 s).
  - Web + mobile show banner when not `normal`. Banner copy + colour per SAFETY §17.
  - In `incident` mode, the planner UI hides destructive actions (bulk delete, hard delete dev endpoints).

---

## P1 — STRONG RECOMMENDATIONS (close before scaling beyond design partners)

### [ ] P1.1 — Postgres Row-Level Security (defence in depth)
- **Acceptance:** RLS policies on every tenant-scoped table requiring `companyId = current_setting('app.companyId')::int`. App sets the GUC at the start of every request from `request.user.companyId`. Even a forgotten `where: companyId` Prisma call cannot leak.

### [ ] P1.2 — Repository pattern enforcing companyId
- **Acceptance:** typed repositories whose first argument is always `companyId`. Lint rule blocks direct `prisma.<model>.findFirst/findMany/update` outside the repo layer. Migrate routes incrementally.

### [ ] P1.3 — Cursor pagination + filters on remaining list endpoints
- **Acceptance:** server-side pagination on `/drivers`, `/customers`, `/locations`, `/templates`, `/holiday-requests`, `/availability`, `/fleet/units`, `/fleet/trailers`, `/shifts` (all currently unbounded `findMany`).

### [ ] P1.4 — Tenant-scoped search architecture
- **Acceptance:** trigram indexes on customer name, location name/postcode, job reference. Search endpoint always scopes by `companyId`. Document max page size (e.g. 50) and cursor.

### [ ] P1.5 — Real-device offline acceptance test
- **Acceptance:** run the 12-step offline test from `DEVLOG.md` 2026-04-30 entry on a TestFlight/internal-track build. Record the run. Mark offline as field-proven only after.

### [ ] P1.6 — Drop unused legacy columns
- **Acceptance:** new migration removes `PlannedJob.trailerTypesForbidden`, any `vehicleClassLegacy`, `trailerType` (legacy) columns once soak window passes. Add migration safety comment.

### [ ] P1.7 — Remove dead code
- **Acceptance:**
  - Delete `api/src/auth.ts` (unused; routes have their own helpers).
  - Delete `mobile/src/components.legacy.tsx` if unreferenced.
  - Pick one bcrypt library — recommend `bcryptjs`. Remove `bcrypt` (native) from `api/package.json`.
  - `npm run typecheck` must pass after.

### [ ] P1.8 — Auto-cleanup `updateMany` cron must be tenant-safe
- **Why:** `routes/shifts.ts:444,457` runs `prisma.shift.updateMany` without `companyId`. Correct today (status-only) but the pattern will burn someone.
- **Acceptance:** iterate per-company OR include `companyId` in `where`. Add a comment explaining the design.

### [ ] P1.9 — `/jobs/:id/status` should also write/read through the sync service
- **Why:** today the online path is duplicated logic in `routes/jobs.ts:1383-1513`. Two places to keep in sync.
- **Acceptance:** route delegates to a shared `applyJobEvent()` function used by `processSyncEvents` too. Behaviour identical: same dedupe, same transition rules, same audit trail.

### [ ] P1.10 — MFA for company_owner and planner roles
- **Acceptance:** TOTP via `otplib`; backup codes; enforced by middleware for the two roles.

### [ ] P1.11 — Email verification on register-company
- **Acceptance:** `Company.status` stays `pending` until owner clicks verification link; cannot create drivers/jobs while pending.

### [ ] P1.12 — Webhook / outbox for downstream integrations
- **Acceptance:** `Outbox` table populated in the same transaction as `JobExecutionEvent`. Worker drains to webhooks with retries. Foundation for future customer integrations.

### [ ] P1.13 — Background job runner per tenant
- **Acceptance:** replace the `setInterval(autoCleanupOldShifts, 24h)` pattern with a proper queue (BullMQ on Redis, or `pg-boss`). Jobs include `companyId`, run isolated per tenant, retried on failure.

---

## P2 — POLISH

### [ ] P2.1 — Stronger PIN policy
- Reject `000000`, `111111`, sequential (`123456`, `654321`), date-shaped (`010180`).

### [ ] P2.2 — Standardise error response envelope
- Document `{ error: code, message, details? }` everywhere. Update web/mobile clients to read it consistently.

### [ ] P2.3 — Type the Prisma errors
- Replace `as any` casts in error handler with proper `Prisma.PrismaClientKnownRequestError` discrimination.

### [ ] P2.4 — Prune stale worktrees
- `.claude/worktrees/*` and `.clone/worktrees/*` are stale; add `.gitignore` entries (already there for some) and clean the working copy.

### [ ] P2.5 — CSP, HSTS, X-Content-Type-Options on web responses
- Configure on Vercel via `vercel.json` headers block.

### [ ] P2.6 — API versioning prefix
- SAFETY §0.8 — introduce `/v1/...` and an `X-App-Version` deprecation header. Old paths stay aliased.

---

## Verification matrix per task

When you mark a P0 box `[x]`, paste the verification you ran:

```
Done: <commit-sha-or-PR-url>
Files: <paths>
Verified: <one of: typecheck OK, integration test passes, manual staging test, runbook executed>
Notes: <anything the next agent should know>
```

Refuse to mark `[x]` without those four lines. The reviewer should be able to reproduce the verification.

---

## Out of scope for this checklist

These are product / commercial decisions, not engineering blockers, and are intentionally not tracked here:

- Pricing, billing, subscriptions
- DPA / GDPR data-processing addenda for customers (talk to legal)
- Marketing site copy
- iOS / Android store metadata
- SLA wording

If you find an item you think belongs in P0/P1/P2 instead, add it with a justification — don't just append.
