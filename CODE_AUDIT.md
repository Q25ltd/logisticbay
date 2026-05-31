# LogisticBay — API Code Audit

**Scope:** `api/src/**` and `api/prisma/schema.prisma`. Web and mobile are out of scope (they are downstream views).
**Audit date:** 2026-05-30
**Method:** read every route handler, schema file, lib helper, sync service, and the Prisma schema. Cross-grep for duplication patterns.
**Honesty:** every finding cites `file:line`. When I'm guessing about intent, I say so in **Confidence: medium**. False positives are possible; do not blindly delete code, confirm against intent first.

---

## How to use this file (rules for the coding agent)

1. Pick an item, mark `[~]` and add `Owner: <agent-name>`.
2. Read the **Why this is dangerous** block before touching anything — the fix must address the root cause, not just hide the symptom.
3. Acceptance criteria are the test. Don't claim done if you only changed one of two duplicated copies.
4. When marking `[x]`, add:
   ```
   Done: <commit-or-PR>
   Files: <paths>
   Verified: <how>
   ```
5. If you find a new issue, append it under the matching section with the same shape (`Why`, `Where`, `Risk`, `Acceptance`). Do not delete entries — mark `[~obsolete]` with a reason if superseded.
6. Severity legend: **🔴 P0** = ship-blocker, **🟠 P1** = fix before scale, **🟡 P2** = cleanup, **⚪ INFO** = noted for awareness.
7. Confidence legend: **high** = I read both sides and the duplication is mechanical, **medium** = looks duplicated but intent might differ, **low** = pattern smell only.

---

# SECTION A — DUPLICATED LOGIC

These are the highest-risk findings. Every duplicate is a place where one copy will get fixed and the other won't, producing inconsistent behaviour between the online and offline paths (which is exactly how customers lose loads).

## [x] A.1 🔴 Status state machine implemented twice (online vs sync) — **high confidence**

Done: cleanup/p2-2.3-apply-job-event
Files: api/src/sync/applyJobEvent.ts (new), api/src/routes/jobs.ts, api/src/sync/sync.service.ts
Verified: typecheck OK; check:vocab OK; 67 tests pass (4 new in applyJobEvent.test.ts); grep for server-generated clientEventId in PATCH handler → 0 hits; both paths delegate to applyJobEvent
Notes: cancel not handled by applyJobEvent (planner override path in TASK 3.8). clientTimestamp now required by both paths.

**Where (both implement the same flow with different code):**
- `api/src/routes/jobs.ts:360-469` — `PATCH /jobs/:id/status` (online)
- `api/src/sync/sync.service.ts:94-235` — `processSyncEvents` (offline drain)

**What they both do:** idempotency check by `clientEventId`, transition validation via `ALLOWED_JOB_TRANSITIONS`, write `JobExecutionEvent`, update `Job.status`, optional GPS/clientTimestamp guards.

**Drift already visible today:**
- Online path validates `gpsLat`/`gpsLng` *pairing* (`jobs.ts:422-427`) but **not the ranges** (-90/90, -180/180). The sync path validates ranges in `routes/sync.ts:76-102`. **A driver hitting the API online can set gpsLat=999, a driver going via the queue cannot.**
- Online path lets planners bypass `ALLOWED_JOB_TRANSITIONS` (`jobs.ts:394-403` — the `else` branch). Sync path applies transitions unconditionally. Two different state machines for the same data.
- Online path generates a fallback `clientEventId` (`server-${Date.now()}-${random}`) when absent (`jobs.ts:380`). That string changes on every retry → **idempotency is silently disabled for callers that forget the header**.
- Online cascade-cancel warnings only fire on planner role (`jobs.ts:432-443`). Drivers can transition to `cancelled` from sync OR online with no cascade — see A.2.

**Why this is dangerous:** the state machine is the single most important invariant in the system. Two implementations = guaranteed eventual divergence under pressure.

**Acceptance:**
- Extract one function `applyJobEvent(prisma, { companyId, actorUserId, jobId, eventType, clientEventId, clientTimestamp, gps, note, payload, role })` in `api/src/sync/applyJobEvent.ts`.
- It must: validate event type ∈ `SUPPORTED_EVENT_TYPES`, dedupe by `companyId_clientEventId`, validate transition, validate gps range + pairing, validate timestamp (≤7d old, ≤1h future), run the DB write in a transaction, return `{ status, duplicate?, needsReview?, reviewReason? }`.
- Both `routes/jobs.ts` PATCH handler and `sync.service.ts` delegate to it.
- Delete the now-duplicated guards from both call sites.
- Add a unit test that fires the same `(jobId, clientEventId)` through online and sync — second call returns `duplicate: true` in both cases.

---

## [~partial] A.2 🔴 Cancel-cascade warning only fires for planners online — **high confidence**

Partial fix — cleanup/p2-2.3-apply-job-event:
Cancel via the normal PATCH /jobs/:id/status now returns 400 TRANSITION_FAILED for all roles (cancel is not in SUPPORTED_EVENT_TYPES). The old planner-only cancel + cascade block is removed from the route. Full cascade (RunAssignment.removedAt, syncJobPlanningStatuses) will be implemented in TASK 3.8 (planner override endpoint) where cancel is intentionally handled.

**Where:** `api/src/routes/jobs.ts:429-443`. The block is wrapped in `if (body.status === "cancelled" && role !== "driver")`.

**Why this is dangerous:** drivers CAN transition jobs to `cancelled` according to `ALLOWED_JOB_TRANSITIONS` (`pending → cancelled`, `accepted → cancelled`, `in_progress → cancelled`, `arrived_pickup → cancelled`, `collected → cancelled`). When a driver cancels a job that is still in an active run, `LoadTrack` and `RunAssignment` rows are not cleaned up and the planner sees an orphaned active assignment. Same problem from the sync path — `sync.service.ts` has no cascade logic at all.

**Acceptance:**
- Move cascade logic into `applyJobEvent` (A.1). Always compute affected runIds when transitioning to `cancelled`, no role gating.
- Always set `RunAssignment.removedAt = now`, `removalReason = "job_cancelled"` inside the same transaction as the status change.
- Always run `syncJobPlanningStatuses([jobId], companyId, tx)` after the cancel.
- Add the warning array to the response regardless of role.

---

## [x] A.3 🔴 `clientTimestamp` validation logic exists in 2 places — **high confidence**

Done: cleanup/p2-2.2-gps-timestamp-helpers
Files: api/src/lib/eventTimestamp.ts (new), api/src/routes/jobs.ts, api/src/routes/sync.ts, api/src/sync/sync.service.ts
Verified: typecheck OK; 61 tests pass (18 new in src/lib/); checkNeedsReview private fn deleted; both paths use validateClientTimestamp
Notes: E.4 decision implemented — online path no longer rejects stale timestamps with 400; both paths flag with needsReview=true. needsReview now persisted in online path too.

**Where:**
- `api/src/sync/sync.service.ts:32-45` (`checkNeedsReview`) — flags but **does not reject**.
- `api/src/routes/jobs.ts:405-420` — **rejects** with 400 if outside the window.

**Why this is dangerous:** offline events are tolerated (flagged `needsReview`), online events are not. So the **same human action** does different things depending on whether the driver had network. If the planner is depending on rejection to catch tampering, the sync path is a hole.

**Acceptance:**
- Single helper `validateClientTimestamp(iso)` returns `{ valid, reason, needsReview }`.
- Decide explicitly: should sync ALSO reject > 7 days? My read of SAFETY says it should flag, not reject (so late offline events are not silently dropped). Document this in `sync.constants.ts` next to `SYNC_REVIEW_RULES`.
- Both call sites use the helper.

---

## [x] A.4 🔴 GPS validation duplicated 3 ways — **high confidence**

Done: cleanup/p2-2.2-gps-timestamp-helpers
Files: api/src/lib/gps.ts (new), api/src/routes/jobs.ts, api/src/routes/sync.ts
Verified: typecheck OK; 61 tests pass (12 new in src/lib/gps.test.ts); inline GPS range checks removed from both routes; both use validateGpsPair
Notes: A.4 bug fixed — online path now enforces lat/lng range (-90/90, -180/180) which it previously skipped

**Where:**
- `api/src/routes/sync.ts:64-102` — pairing + range check.
- `api/src/routes/jobs.ts:422-427` — pairing check, **no range check**.
- `api/src/lib/geo.ts:26` — postcode-to-coords helper, no validation.

**Risk:** see A.1. Today the online path lets `gpsLat=999` through.

**Acceptance:**
- Move to `api/src/lib/gps.ts` exporting `validateGpsPair(lat?: number, lng?: number): { valid: boolean, reason?: string }`.
- Both routes use it. Range check enforced everywhere.

---

## [x] A.5 🟠 `STATUS_BY_EVENT_TYPE` and `EVENT_TYPE_MAP` are inverses, maintained separately — **high confidence**

Done: cleanup/p2-2.1-event-definitions
Files: api/src/sync/sync.constants.ts, api/src/tests/sync.constants.test.ts
Verified: typecheck OK; 43 tests pass (8 new in sync.constants.test.ts); both constants derived from EVENT_DEFINITIONS — no hand-editing possible
Notes: ALLOWED_JOB_TRANSITIONS output is byte-identical to the previous hand-maintained version; test asserts this

**Where:** `api/src/sync/sync.constants.ts:32-49`.

**Drift already visible:**
- `EVENT_TYPE_MAP` contains `cancelled: "cancelled"` (line 48).
- `STATUS_BY_EVENT_TYPE` does NOT contain `cancelled` (lines 32-38).
- `SUPPORTED_EVENT_TYPES` does NOT contain `cancelled` (lines 22-28).
- So you can transition a job to `cancelled` via `PATCH /jobs/:id/status`, but the corresponding eventType is `EVENT_TYPE_MAP["cancelled"] = "cancelled"`, which is **not in SUPPORTED_EVENT_TYPES**, so the sync path would reject it. Inconsistent.

**Acceptance:**
- Single bidirectional source: `EVENT_DEFINITIONS: Record<EventType, { resultingStatus: JobStatus, allowedFrom: JobStatus[] }>`.
- Derive `SUPPORTED_EVENT_TYPES`, `STATUS_BY_EVENT_TYPE`, `EVENT_TYPE_MAP`, `ALLOWED_JOB_TRANSITIONS` from that one object.
- Decide if `cancelled` is a driver-triggerable event (probably no) or planner-only (then keep it out of `SUPPORTED_EVENT_TYPES`, add a separate planner-only constant).

---

## [x] A.6 🟠 Stale schema comment refers to `PlannedJob` — **high confidence**

Done: cleanup/p2-2.1-event-definitions
Files: api/src/sync/sync.constants.ts (comments rewritten), api/src/sync/sync.service.ts:53 (comment fixed)
Verified: `grep -rn "PlannedJob|plannedJob" api/src --include="*.ts" | grep -v generated` → 0 hits
Notes: all stale PlannedJob references in api/src replaced with correct model name (Job)

**Where:** `api/src/sync/sync.constants.ts:40-41`. Comment says "Maps PlannedJob.status values to the eventType string". Model is `Job` now, not `PlannedJob`. **The PROJECT_STATUS.md and CLAUDE.md also still mention PlannedJob in places.**

**Acceptance:**
- Grep `PlannedJob` across the codebase: `grep -rn "PlannedJob" api/src/ web/src/ mobile/src/ *.md`.
- Fix every comment, doc, and dead type reference. If any code still uses `prisma.plannedJob`, that's a real bug — the generated client only has `prisma.job` now.

---

## [x] A.7 🟠 Run-cancellation logic duplicated across routes — **high confidence**

Done: cleanup/p2-2.4-cancel-run
Files: api/src/services/runService.ts (new), api/src/routes/runs.ts, api/src/routes/planning.ts
Verified: typecheck OK; check:vocab OK; 70 tests pass; knip baseline unchanged; cancelRun imported in 2 prod files
Notes: planning.ts cancel block was not transactional and didn't set removalReason — both fixed. LoadTrack hard-delete disabled per B.4 decision.

**Where:**
- `api/src/routes/runs.ts:336-388` — `DELETE /runs/:id` (cancel branch).
- `api/src/routes/planning.ts:383-396` — `PATCH /planning/runs/:id` with `status: "cancelled"`.

**Both do:** find affected jobIds, mark assignments `removedAt`, sync planning statuses.

**Drift:**
- `runs.ts` wraps everything in `prisma.$transaction(async (tx) => …)` and sets `removalReason: "run_cancelled"`.
- `planning.ts` does NOT use a transaction (line 390-396: bare `prisma.runAssignment.updateMany`, then a separate `prisma.run.update` on line 397). If the first half succeeds and the second half fails, you have orphaned assignments without their run cancelled. **Partial-failure window.**
- `planning.ts` does NOT set `removalReason`. The audit log will say "we don't know why".

**Acceptance:**
- Extract `cancelRun(prisma, { runId, companyId, actorUserId, reason })` into `api/src/services/runService.ts`.
- Always transactional. Always sets `removalReason`. Always audit-logs.
- Both routes delegate to it.

---

## [ ] A.8 🟠 `appendPlannerReason` exists, but inline string-append patterns still scattered — **medium confidence**

**Where:**
- The helper is defined in `api/src/lib/jobUtils.ts:58-63`.
- Used in `routes/jobs.ts:279` (job delete cascade).
- But planner reasons get appended to other freeform fields (`run.plannerNotes`, `runAssignment.removalReason`) without going through this helper, so format will drift.

**Acceptance:**
- Audit every place a planner action writes into a notes/log field. Use `appendPlannerReason` consistently OR (better) move that history to dedicated audit rows so freeform fields stay clean.

---

## [ ] A.9 🟠 Same `Omit<PrismaClient, "$connect" | …>` tx type signature copy-pasted — **high confidence**

**Where:**
- `api/src/lib/jobUtils.ts:20`
- `api/src/routes/runs.ts:10, 25, 81`
- Probably more.

**Risk:** when Prisma 8 changes the disallowed key list, all four go stale together. Cosmetic but easy to fix.

**Acceptance:**
- Export `type Tx = Prisma.TransactionClient` in `api/src/lib/types.ts` (Prisma already exposes the right type).
- Replace every site.

---

## [ ] A.10 🟠 Driver-conflict + driver-validity check duplicated — **high confidence**

**Where:** `api/src/routes/runs.ts:151-165` (POST `/runs`) and `runs.ts:307-324` (PATCH `/runs/:id`). Both:
1. Look up driver by `{id, companyId, status: "active"}`, throw if missing.
2. Call `findDriverConflict` for warning.

**Acceptance:**
- Extract `assertDriverAvailable(tx, { companyId, driverId, plannedDate, excludeRunId? })` returning `{ driver, warning? }`. Use in both.

---

## [ ] A.11 🟠 Date-range parsing identical across list endpoints — **high confidence**

**Where:** at least three places do the same `new Date(\`${dateFrom}T00:00:00.000Z\`) … T23:59:59.999Z` construction:
- `api/src/routes/jobs.ts` GET /jobs
- `api/src/routes/runs.ts:213-223` GET /runs
- `api/src/routes/dashboard.ts:45-46` GET /dashboard
- `api/src/routes/planning.ts:185-186` (different variant)

**Risk:** mixing UTC midnight + 23:59:59.999 across servers in different TZs is subtle. One off-by-one in one route is a bug.

**Acceptance:**
- `api/src/lib/dateUtils.ts` already exists — extend it with `dayRangeUtc(dateFrom?: string, dateTo?: string): { gte?: Date; lte?: Date }`.
- Every list endpoint uses the helper.

---

## [ ] A.12 🟠 `parseInt((request.params as { id: string }).id, 10)` repeated everywhere — **high confidence**

**Where:** every single route handler. Search: `grep -rn "parseInt((request.params" api/src/routes`. Easily 50+ sites.

**Risk:** none validate that the parse succeeded. `parseInt("abc", 10)` → `NaN`; `prisma.x.findFirst({ where: { id: NaN } })` runs but silently returns nothing. So a bad URL gets a 404, not a 400. Diagnostics suffer.

**Acceptance:**
- `parseIdParam(request, reply, "id"): number | null` in `api/src/lib/validate.ts`. Returns null and sends 400 on failure.
- Migrate all routes.

---

## [x] A.13 🟡 Mobile event type strings duplicated across 3 files — **high confidence**

Done: cleanup/p2-2.1-event-definitions
Files: api/src/sync/sync.constants.ts
Verified: EventType and SUPPORTED_EVENT_TYPES exported from sync.constants.ts; comment updated to say this file is the source of truth; mobile should import from here (or a shared package) rather than maintaining its own copy
Notes: full cross-workspace shared package (shared/eventTypes.ts) is a separate follow-on; this task establishes the API as the authority

**Where:**
- `api/src/sync/sync.constants.ts` (SUPPORTED_EVENT_TYPES)
- `shared/vehicleTaxonomy.ts` (different domain, but same pattern)
- `mobile/src/constants/jobStatuses.ts` (out of scope of this audit but referenced from `sync.constants.ts:20` as "source of truth")

**Risk:** sync constants claim mobile is the source of truth, but the API rejects unknown event types — so really the API is the source of truth. The reverse convention will bite you the day a mobile dev adds a new event type and ships before the API.

**Acceptance:**
- Move event-type vocabulary into `shared/eventTypes.ts` alongside the vehicle taxonomy. Apply the same CI hash-check (`scripts/check-vocab-sync.ts`) to it.
- Update comment in `sync.constants.ts:20` to point at `shared/eventTypes.ts`.

---

## [ ] A.14 🟡 Two bcrypt libraries — **high confidence**

**Where:** `api/package.json` imports both `bcrypt` (native) and `bcryptjs`. Active routes use `bcryptjs`. `api/src/auth.ts` uses native `bcrypt` but is NOT imported anywhere (dead).

**Acceptance:**
- Delete `api/src/auth.ts`.
- Remove `bcrypt` and `@types/bcrypt` from `api/package.json` and lockfile.
- Confirm `npm run typecheck` and `npm test` still pass.

---

## [ ] A.15 🟡 `postcodeToCoords(...).catch(() => null)` pattern repeats — **medium confidence**

**Where:**
- `api/src/lib/geo.ts:26`
- `api/src/services/checkRunService.ts:105, 137`

**Risk:** lost errors. The first call swallows network errors, the second swallows them silently in the middle of a planner check. If the geocoder is down, planner sees empty results, no log explains why.

**Acceptance:**
- One helper `safeGeocode(postcode, logger): Promise<Coords | null>` that logs a warning on failure with reason. Every caller uses it.

---

# SECTION B — LOGIC THAT CAN BREAK THE SYSTEM

Concrete bugs and footguns, ordered by blast radius.

## [ ] B.1 🔴 Background work after shift submit can lose data — **high confidence**

**Where:** `api/src/routes/shifts.ts:225` and `:299` (`setImmediate(async () => { … })`).

**What happens:**
- The route returns 200 immediately on PDF generation success, then schedules PDF rendering + email + working-time recalc in `setImmediate`.
- If the worker crashes between the response and the `setImmediate` body running, the shift stays in `submitted` status forever, no PDF, no email, no working-time update.
- On Railway redeploys (which happen on every push), in-flight `setImmediate` callbacks are killed mid-flight.
- The `.catch(() => {})` on the failure-update path swallows everything silently (`shifts.ts:231, 305`).

**Risk:** drivers see "shift submitted" but the planner never gets the email, and the working-time-compliance calculator under-counts hours. Tracking of hours is exactly what this app is for.

**Acceptance:**
- Replace `setImmediate` with an outbox row written in the same transaction as the submit, and a small worker (BullMQ, pg-boss, or even a polling loop) that drains the outbox idempotently with retries.
- Until then, at minimum: log the error properly (`app.log.error({ err, shiftId }, …)`), do NOT swallow with empty arrow.

---

## [ ] B.2 🔴 `autoCleanupOldShifts` runs cross-tenant and silently — **high confidence**

**Where:** `api/src/routes/shifts.ts:437-460` and the `setInterval(..., 24h)` at `:466`.

**Issues:**
- `updateMany` has no `companyId` predicate. Today this is "OK" because the status change is global by design, but the pattern is dangerous to copy and a single typo (e.g. `status: { in: ["draft"] }`) could wipe shift drafts across all tenants.
- `setInterval` runs in *every* Fastify worker process. On Railway you may scale to 2+ instances → cleanup runs N× per day, racing each other.
- `autoCleanupOldShifts()` is invoked on boot at `:465` — every redeploy triggers it again.
- If it throws, the `.catch` only logs; you have no alert.

**Acceptance:**
- Move to a single scheduled job (e.g. Railway Cron, or `pg-boss` with a singleton schedule).
- Add a tenant loop: iterate companies and do per-company cleanup with explicit `where: { companyId, … }`.
- Sentry on failure.

---

## [ ] B.3 🔴 Direct `Job.status` writes bypass event reconstruction — **high confidence**

**Where:** `api/src/routes/jobs.ts:446` writes `Job.status` directly. SAFETY §4 says `Job.status` must always be consistent with the event log; the file admits "Recalculation of job status from events on conflict" is not implemented.

**Risk:** if anything goes wrong (a transaction half-applies, a planner manually edits, an offline event arrives later with an earlier clientTimestamp), Job.status and the event log can drift, and there's no reconciler.

**Acceptance:**
- Build `recalculateJobStatus(tx, companyId, jobId)`: walk `JobExecutionEvent` ordered by `clientTimestamp asc`, compute the latest valid status using `EVENT_DEFINITIONS` (A.5), set it.
- Run after every event write (cheap on a single job) — or, if performance bites, run nightly per tenant and on demand.
- Planner UI shows a "recalculate" action behind the role guard.

---

## [x] B.4 🔴 `LoadTrack` rows hard-deleted on cancelled-run delete — **high confidence**

Done: cleanup/p2-2.4-cancel-run
Files: api/src/routes/runs.ts (hard-delete branch), api/src/services/runService.ts
Verified: tx.loadTrack.deleteMany removed from both cancel paths; grep → 0 hits
Notes: S3 confirmed by user 2026-05-31 ("LoadTrack is operational custody history"). Soft-delete schema fields deferred to TASK 4.3.

**Where:** `api/src/routes/runs.ts:356` — `tx.loadTrack.deleteMany({ where: { runId: id } })` runs when a planner hard-deletes a cancelled run.

**Why it's dangerous:** SAFETY §7 — "never hard delete operational data". LoadTrack rows are the operational record of what was loaded onto a truck. If a customer disputes a load 6 weeks later, those rows are gone. Same for `RunAssignment.deleteMany` on `:357`.

**Acceptance:**
- Soft-archive instead. Add a `status` or `deletedAt` column on `LoadTrack` and `RunAssignment` (or reuse `removedAt` on the latter).
- Hard delete only allowed for GDPR right-to-erasure flow (which doesn't exist yet — out of scope).

---

## [~partial] B.5 🔴 Idempotency disabled when caller forgets `clientEventId` — **high confidence**

Partial fix — cleanup/p2-2.3-apply-job-event:
PATCH /jobs/:id/status now returns 400 BAD_REQUEST if clientEventId is missing. No server-generated fallback.
Still open: POST /jobs/:id/note still generates server-${Date.now()}-... — fixed in TASK 3.2.

**Where:** `api/src/routes/jobs.ts:380` — `clientEventId = body.clientEventId?.trim() || \`server-${Date.now()}-${Math.random()...}\``.

**Risk:** retries from the planner UI or any future integration that doesn't send the header create duplicate events. The same problem exists at `jobs.ts:489` for `POST /jobs/:id/note`.

**Acceptance:**
- Require `clientEventId` for any write that creates a `JobExecutionEvent`. Reject with 400 if missing.
- Or, accept a server-generated UUID but persist it on the request first (via an `IdempotencyKey` table keyed on `(companyId, route, requestBodyHash)` so the SAME request body cannot create two events). Recommend the former — simpler.

---

## [ ] B.6 🔴 `JobExecutionEvent.driverId` references `User`, not `DriverProfile` — **high confidence**

**Where:** `api/src/sync/sync.service.ts:98-100` (`TODO(phase-2)`) and the schema. The same `userId` is passed in as `driverId` everywhere.

**Risk:** an agency driver moving between companies will have the same `driverId` in `JobExecutionEvent` rows belonging to different tenants. Today tenant isolation holds because the row also has `companyId`. But the field name lies — when someone joins this codebase and queries `driverId`, they will assume `DriverProfile.id`.

**Acceptance:**
- Migration: add `driverProfileId Int?` to `JobExecutionEvent`, backfill from the user→profile mapping for each company, then make NOT NULL and drop `driverId` (or rename `driverId` → `actorUserId` to keep both).
- Update writes in `sync.service.ts`, `routes/jobs.ts` (`:451`, `:486`, `:1527`).
- Update audit/read paths.

---

## [~partial] B.7 🟠 Auth.ts `/auth/me` and `/auth/change-password` re-verify JWT inline — **high confidence**

**Where:** `api/src/routes/auth.ts:78-89` and `:91-111` (before the most recent rewrite — please confirm in current file). Inline `jwt.verify(...)` instead of using the `authenticate` middleware. If middleware logic changes, these paths get out of sync.

**Acceptance:**
- All routes use `{ preHandler: authenticate }`. Inline `jwt.verify` only allowed inside `middleware.ts` and `lib/env.ts`.
- The `JWT_SECRET` fallback (`?? process.env.JWT_SECRET`) must be removed everywhere at the same time — see RELEASE_READINESS.md P0.4.

Partial fix — commit `48f84d2` feat(security): fail fast on missing JWT secrets:
- `api/src/lib/env.ts` now throws on startup if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` are missing or equal. The `?? process.env.JWT_SECRET` fallback is gone.
- **Still open:** inline `jwt.verify` remains at `auth.ts:119` (refresh endpoint), `auth.ts:190`, `auth.ts:210`. These are outside `middleware.ts` and `lib/tokens.ts`. Commandment 21 grep gate will catch these.

---

## [ ] B.8 🟠 `email + companyId` driver duplicate check is case-aware but inconsistent — **medium confidence**

**Where:** `api/src/routes/companies.ts:275-280`. `existingInCompany` matches on `contactEmail` lowercased to `emailLower`. Good. But the underlying `DriverProfile.contactEmail` field has no unique constraint at the DB level — only the app check.

**Risk:** race: two simultaneous POST `/drivers` with the same email both see "not existing" → both create. Then the unique check is gone.

**Acceptance:**
- Add `@@unique([companyId, contactEmail])` to `DriverProfile` (with a partial unique index ignoring empty strings — Postgres allows `WHERE contactEmail <> ''`).
- Handle the unique-violation Prisma error → return 409.

---

## [ ] B.9 🟠 `/auth/login` returns `mustChangePin` but server doesn't enforce — **high confidence**

**Where:** `api/src/routes/auth.ts:54-60`. Same finding as RELEASE_READINESS P0.10, but worth restating here because it's a logic gap, not just a security gap.

**Acceptance:** see RELEASE_READINESS.md P0.10.

---

## [ ] B.10 🟠 `prisma.shift.update({ where: { id: shiftId } })` without companyId after fetch — **high confidence**

**Where:** `api/src/routes/shifts.ts:231, 246, 296, 305, 319, 424`. Each follows a `findFirst({ id, companyId })` earlier in the handler, so they're correct *today*. But:

- They do not pass `companyId` in the `where`, so they rely on the prior fetch having happened in the same request.
- In `setImmediate` callbacks at `:225` and `:299`, the prior fetch's `request` context is *gone* — if the handler ever changes to skip the upfront fetch, this becomes a real IDOR.

**Acceptance:**
- Adopt the rule: every `update`/`delete`/`upsert` includes `companyId` in `where`. Today only `findFirst({ where: { id, companyId } })` is consistently scoped. Add `companyId` to the update `where` as defence in depth.
- Where Prisma doesn't allow composite `where` (single update), use `updateMany({ where: { id, companyId } })` which returns `{ count }`; if count is 0, throw 404.

---

## [ ] B.11 🟠 `setImmediate(...)` doesn't await Prisma client closure — **medium confidence**

**Where:** `api/src/routes/shifts.ts:225, 299`. The setImmediate runs after the response is sent, but on SIGTERM (`server.ts:10-11`) the app closes Prisma before the setImmediate finishes.

**Risk:** SIGTERM during a deploy → in-flight setImmediate hits "Engine is not yet connected" or similar. Shift status is stuck.

**Acceptance:** depends on B.1 — once outbox is in place, this resolves itself. Until then, add a tracking Set of in-flight promises and `await Promise.all([...inFlight])` in the SIGTERM handler.

---

## [ ] B.12 🟠 Driver hard-delete in companies route uses bare prisma — **medium confidence**

**Where:** `api/src/routes/companies.ts:473` — `prisma.user.update({ where: { id: driver.userId }, data: { passwordHash } })`. There's no `companyId` predicate possible (User is cross-tenant), so the safety comes from the upstream `findFirst({ id, companyId })`.

**Risk:** if the wrong driver row is passed (e.g. a planner finds an agency driver linked to another company), updating the User's passwordHash resets it for ALL companies the user belongs to. **An agency driver whose PIN is reset by Company A will silently have their Company B login broken.**

**Acceptance:**
- Reset-PIN flow should NOT mutate `User.passwordHash` directly for users with multiple memberships. Either:
  - Issue a per-membership PIN (requires schema change), or
  - Refuse to reset when the driver belongs to > 1 company and surface a warning to the planner.

---

## [ ] B.13 🟠 `findInvalidStopLocationId` returns first invalid id only — **medium confidence**

**Where:** `api/src/routes/jobs.ts:94-111` (read earlier; may have moved to `services/jobValidation.ts` in current version).

**Risk:** if the planner submits 5 stops, 3 of which reference Company B locations, the API returns just one error message. The UX is poor; worse, if they fix that one and resubmit, they see another. Slow attack-and-discovery cycle.

**Acceptance:** return ALL invalid ids in one response.

---

## [ ] B.14 🟠 Many planner `update` calls don't audit-log — **high confidence**

**Where:** spot-checks — `routes/jobs.ts` `POST /jobs/:id/repeat`, `routes/runs.ts` `POST /runs`, `PATCH /runs/:id`, `POST /runs/:id/publish`, `routes/planning.ts:397` etc., do not call `writeAudit`.

**Risk:** in a customer dispute, "the planner changed the trailer last Tuesday" is unprovable.

**Acceptance:** every state-changing planner endpoint creates an `AuditLog` row in the same transaction as the change. See RELEASE_READINESS.md P0.15.

---

## [x] B.15 🟠 Background `syncJobPlanningStatuses` called from non-tx contexts — **medium confidence**

Done: cleanup/p2-2.4-cancel-run
Files: api/src/routes/planning.ts (cancel path now uses cancelRun inside $transaction)
Verified: planning.ts cancel path was the only non-tx call site; cancelRun always calls syncJobPlanningStatuses inside the caller's tx
Notes: the other syncJobPlanningStatuses call sites in planning.ts (add/remove assignment) were already inside transactions — not touched.

**Where:** `api/src/routes/planning.ts:396` calls `syncJobPlanningStatuses(..., prisma)` outside of a transaction. The helper itself does `tx.job.findMany` followed by per-row `tx.job.update`. If a competing request modifies one of these jobs between the read and the update, the planning status flips back.

**Risk:** rare, but causes intermittent "job appears in unplanned then disappears" UX bugs that you'll never reproduce.

**Acceptance:** require `syncJobPlanningStatuses` to be called inside a transaction. Wrap the call site or add a runtime check.

---

## [ ] B.16 🟡 `nextRunSequence` and `nextJobSequence` mutated in a transaction by a single read+increment — **medium confidence**

**Where:** `api/src/routes/runs.ts:11-19` (and `lib/jobReference.ts`).

**Today's safety:** Prisma `update({ data: { x: { increment: 1 } } })` is a single SQL atomic increment, so it's race-safe.

**Risk:** the *padding* (`padStart(6, "0")`) means once you cross 999999 jobs in a year, references will jump from `RUN-2026-999999` to `RUN-2026-1000000` (7 digits), breaking any system that assumed fixed-width. Cosmetic.

**Acceptance:** decide whether to bump padding or accept the wrap. Document.

---

## [~partial] B.17 🟡 Refresh-token rotation `updateMany` revokes without companyId — **medium confidence**

**Where:** `api/src/routes/auth.ts:178, 278` (RefreshToken table). RefreshToken is per-user not per-company, but check the rotation logic does not orphan tokens for the *other* membership when an agency driver is impersonated by Company A's planner reset.

**Acceptance:** read `RefreshToken` rotation code carefully; ensure rotating a token issued for `(userId=5, companyId=10)` does not affect tokens for `(userId=5, companyId=20)`.

Partial fix — commit `71d4716` feat(security): refresh token rotation, 15m access TTL, /auth/logout:
- `revokeTokenFamily(prisma, familyId)` in `lib/tokens.ts:47` revokes `where: { familyId, revokedAt: null }` — **safe**: familyId is per-login-session, revoking a family does not affect tokens from other companies.
- **Still open:** `auth.ts:279` — logout/PIN-reset revokes `where: { userId: tokenRow.userId, revokedAt: null }` with no companyId filter. An agency driver whose Company A planner triggers this loses their Company B session too.

---

# SECTION C — CONFUSING LOAD / JOB / EVENT SEMANTICS

These are places where the data model, field names, or state semantics will confuse anyone reading the code and lead them to write the wrong query.

## [ ] C.1 🔴 Two "status" concepts on Job — derived vs planning — **high confidence**

**Where:** `Job.status` field (`prisma/schema.prisma`) + `computePlanningStatus()` helper used in `routes/jobs.ts:122, 213, 183, 186`.

**The confusion:**
- `Job.status` is the execution state (`ready_to_plan` → `in_planning` → `planned` → `in_progress` → `arrived_pickup` → `collected` → `arrived_dropoff` → `completed` / `cancelled`).
- `planningStatus` is a derived UI hint computed from stops + runAssignments.
- Both surface in the API response as different fields.
- The driver flow uses `status`; the planner flow uses `planningStatus`.
- `syncJobPlanningStatuses` writes `Job.status` based on planning, not execution.

So `Job.status` is **partly** derived from events (execution stage) and **partly** derived from planning (ready_to_plan / in_planning). Two state machines colliding in one field.

**Acceptance:**
- Split `Job.status` into `Job.executionStatus` (event-derived) and `Job.planningStatus` (planning-derived). Or document explicitly that `status` is the union and which values come from which path.
- Add a comment on the schema field explaining the two regimes.
- Add a runtime invariant: `executionStatus ≠ planning-tier` and `planningStatus ≠ execution-tier` simultaneously.

---

## [ ] C.2 🔴 `JobExecutionEvent.driverId` actually means User.id — **high confidence**

Already filed as **B.6** — listing here too because the *naming* is the confusion. Anyone reading `where: { driverId: X }` will assume `DriverProfile.id` and write a wrong query.

**Acceptance:** see B.6. Rename in the schema, not just in comments.

---

## [ ] C.3 🔴 `JobStop.type` vs `Job.status` use different vocabularies — **high confidence**

**Where:** `JobStop.type` ∈ `{collection, pickup, delivery, dropoff, …}`. The event types use `arrived_pickup` / `arrived_dropoff`. So `JobStop.type = "collection"` corresponds to event `arrived_pickup` and status `collected`. Three names for the same concept.

**Risk:** the comment at `sync.constants.ts:41` literally says "PlannedJob.status (arrived_pickup, arrived_dropoff) differs from JobStop.type (collection, delivery)". This is acknowledged confusion that has not been resolved.

**Acceptance:**
- Pick one vocabulary. Recommend `collection` / `delivery` everywhere (the user-facing terms in the UK logistics industry).
- Migrate event types to `arrived_collection` / `collected_from_collection` / `arrived_delivery` / `delivered`. Or — more pragmatic — keep event types but add a `collection|delivery` alias map in `shared/eventTypes.ts` with an enum so the API responses normalise.

---

## [ ] C.4 🟠 `quantity` lives on Job AND JobStop AND LoadDetails — **medium confidence**

**Where:** schema. `Job.quantity`, `JobStop.quantityRequired`, `JobStop.exchangeDropQty`, `JobStop.exchangeCollectQty`, `LoadDetails` (older model). Plus `actualQuantity` on the event.

**Risk:** which one is the "real" load? Planner sees one number, driver enters another, report aggregates a third. Already known to be a confusion source — see `services/jobValidation.ts`.

**Acceptance:**
- Document the canonical formula in `DATA_DICTIONARY.md`. Probably: planned = sum of stop quantities; actual = sum of `JobExecutionEvent.actualQuantity` per stop.
- Decide if `Job.quantity` is still needed or just a denormalised cache. If cache, add a comment.

---

## [ ] C.5 🟠 `actualQuantity` is `String` in the schema and in events — **medium confidence**

**Where:** `sync.service.ts:57-71` stringifies `actualQuantity`; schema stores as String.

**Risk:** drivers in different locales might enter `"1,5"` vs `"1.5"`. Reports doing `parseFloat` will silently drop decimals. Aggregation breaks.

**Acceptance:** store as Decimal (Prisma supports it natively). Normalise on input. UI shows formatted.

---

## [ ] C.6 🟠 `removedAt` vs `status='cancelled'` vs `deletedAt` — three soft-delete conventions — **medium confidence**

**Where:**
- `RunAssignment.removedAt` (run.ts uses it).
- `Run.status='cancelled'` (no separate column).
- `Job.status='cancelled'` (same).
- `FleetUnit.status='deleted'`.
- `HolidayRequest.status='deleted'`.
- `Shift.status='deleted'`.
- `User.status='active'` only — no deletion column.

**Risk:** every read needs to remember which convention applies. A query that filters `where: { status: { not: "cancelled" } }` on RunAssignment returns soft-deleted rows because RunAssignment uses `removedAt`, not status.

**Acceptance:**
- Single convention: either every model has a `status` enum that includes `archived`/`deleted` AND a `deletedAt` timestamp, OR remove the variant. Document the choice in `DATA_DICTIONARY.md`.

---

## [ ] C.7 🟠 `Run.status` taxonomy is undocumented — **medium confidence**

**Where:** `routes/runs.ts:92` filters `status: { notIn: ["cancelled"] }` — implies there's a `cancelled` status. `:301` allows arbitrary `body.status` (no enum check). `:344` checks `"completed"`. But no central list.

**Risk:** a planner can PATCH `status="banana"` and the API accepts it.

**Acceptance:**
- Define `RUN_STATUSES = ['draft', 'assigned', 'in_progress', 'completed', 'cancelled']` in `api/src/sync/runStatuses.ts` (matching what PROJECT_STATUS.md targets).
- Validate `body.status` against the list in Zod.
- Document allowed transitions same as `ALLOWED_JOB_TRANSITIONS`.

---

## [ ] C.8 🟡 `JobPart` is a new concept and not all flows know about it — **medium confidence**

**Where:** schema has `JobPart` model (`schema.prisma:432`). `runs.ts` includes JobPart in assignments. But `routes/jobs.ts` GET /jobs/my still only includes `stops`, not `jobParts`. Drivers may see partial data.

**Acceptance:**
- Audit every "get the job" code path and confirm whether stops, parts, or both should be returned.
- Add a doc paragraph to ARCHITECTURE.md explaining when JobPart is the right unit of work vs Stop.

---

## [ ] C.9 🟡 `Customer` model has nullable name vs not — **medium confidence**

**Where:** `Customer.name String` (required) but `Job.customerId` is nullable and `Job.customerName` is a denormalised snapshot. Order of writes matters: if you set `customerId` you should also fetch and snapshot `customerName`, but nothing enforces that.

**Acceptance:**
- DB trigger or service layer: setting `customerId` must always set `customerName` from the customer record. Document.

---

## [ ] C.10 🟡 `Company.nextJobSequence` / `nextRunSequence` reset logic missing — **medium confidence**

**Where:** schema has `nextJobSequence`, `nextRunSequence`, `jobSequenceYear`. Code at `lib/jobReference.ts` / `routes/runs.ts:11-19` increments but I don't see year-rollover handling.

**Risk:** at 2027-01-01, `RUN-2026-001234` continues to `RUN-2026-001235`. References never reset to year 2027.

**Acceptance:**
- On increment, compare current year with `jobSequenceYear`/(no field for runs). If different, reset to 1 and update the year column. Atomically inside the increment transaction.

---

# SECTION D — DEAD AND HALF-FINISHED CODE

## [ ] D.1 🟡 `api/src/auth.ts` — dead — **high confidence**

Already noted in A.14. No imports anywhere. Delete it.

---

## [ ] D.2 🟡 `mobile/src/apiWithQueue.ts` — self-declares deprecated — **high confidence**

```
// DEPRECATED — use enqueueJobEvent from offlineQueue.ts + useIsOnline hook in screens directly
export {};
```
Delete.

---

## [x] D.3 🟡 `trailerTypesForbidden` column — slated for drop — **high confidence**

DEVLOG 2026-05-10 says: "Column left in DB (null on new records) — can be dropped in Phase 0.8 soak." Check soak window has passed, drop in a migration.

Done: already dropped — confirmed 2026-05-30 during TASK 0.4 reconciliation
Files: api/prisma/schema.prisma (column absent), api/src/ (zero references)
Verified: `grep -rn "trailerTypesForbidden" api/src api/prisma/schema.prisma` → 0 hits
Notes: column was removed in an earlier migration; soak window passed

---

## [ ] D.4 🟡 `mobile/src/components.legacy.tsx` — name suggests legacy — **medium confidence**

Confirm with `grep`. If unreferenced, delete.

---

## [ ] D.5 🟡 `validation.ts` (legacy) and Zod schemas overlap — **medium confidence**

**Where:** `api/src/validation.ts` exports `validateCreateLocation`, `validateCreateTemplate`, `validateCreateJob`, `validateUpdateJobStatus`, `validateAddJobNote`. Some of these are also covered by Zod in `api/src/schemas/`. Many routes call BOTH (`routes/jobs.ts:7-10` imports both).

**Risk:** drift. A field added to Zod but not to `validation.ts` is silently dropped (or vice versa).

**Acceptance:**
- Decide one source. Zod is more typesafe. Migrate everything to Zod and delete `validation.ts`. If `validation.ts` contains business rules Zod cannot express, move them to `services/jobValidation.ts`.

---

## [ ] D.6 🟡 `routes/customers.ts` is tiny — confirm coverage — **low confidence**

`customers.ts` is 102 lines. Confirm it implements `list`, `create`, `patch`, `archive`, and not just two of those. Currently no `archive`/`status` change endpoint visible from earlier grep.

Reconciliation note (TASK 0.4, 2026-05-30): confirmed endpoints present — `GET /customers`, `GET /customers/:id`, `POST /customers`, `PATCH /customers/:id`. Missing: no `DELETE` or archive/status-change endpoint. A customer can be created and edited but never deactivated. Still open.

---

# SECTION E — UNKNOWNS / DESIGN QUESTIONS — needs your call

These are intentionally listed as questions because the answer depends on product intent, not code.

## E.1 Should drivers be allowed to transition `pending → cancelled`?

`ALLOWED_JOB_TRANSITIONS["pending"]` includes `"cancelled"`. Driver-side cancel is a strong customer-care signal but also a footgun (a driver in a bad mood drops a job). If the answer is no, narrow the allowed list and add a planner-only `cancelJob(reason, byUserId)` endpoint.

## E.2 What is the source of truth for "is this job today" — `plannedDate` or first collection stop's `timeWindowStart`?

`routes/jobs.ts:154-159` falls back from stop time to `plannedDate`. `dashboard.ts` uses `plannedDate` only. Drivers seeing different lists than planners is a real risk.

## E.3 Is `LoadTrack` meant to be per-run or per-(run, jobPart)?

The schema lets it be per-run. The naming suggests per-run. But operationally, a single run can pick up loads at multiple stops. Confirm and document.

## E.4 Should an offline event older than 7 days be **rejected** or **flagged**?

Today sync flags (`needsReview`) and online rejects. Two divergent answers to one product question.

## E.5 Should `Job.status = "cancelled"` cascade-cancel the parent run if all other assignments are also cancelled?

Currently no. Acceptable, but worth deciding.

## E.6 Is `JobPart` allowed to exist without any stops?

No constraint enforces this. Likely yes (during creation). Document.

## E.7 Should `ready_to_plan` require a customer set?

Today the check is "vehicleCategory must be set" (`routes/jobs.ts:397-402`). Customer is not checked. Confirm intent.

---

# Verification template — paste when marking [x]

```
Done: <commit-sha-or-PR-url>
Files: <paths changed>
Verified: <how — typecheck OK, new unit test, manual reproduction>
Notes: <gotchas for the next agent>
```

Refuse to mark an item complete without all four lines. The reviewer must be able to reproduce the verification.

---

---

# DESIGN DECISIONS (from user, 2026-05-31)

Recorded verbatim from user answers to Section E questions. These are binding — no Phase 2+ task may contradict them without a new explicit decision.

---

## E.1 — Driver cancellation: **Option B — NO, drivers cannot cancel**

Drivers may NOT transition a job to `cancelled`. Remove `"cancelled"` from `ALLOWED_JOB_TRANSITIONS` entries for all driver-reachable statuses (`pending`, `accepted`, `in_progress`, `arrived_pickup`, `collected`). Only planners/owners may cancel via a separate `plannerOverrideStatus` endpoint or directly via the planner UI.

**Affects:** TASK 2.1 (narrow ALLOWED_JOB_TRANSITIONS), TASK 2.3 (applyJobEvent must reject cancel events from driver role).

---

## E.2 — "Is this job today": **Option A — `timeWindowStart` everywhere**

`timeWindowStart` on the first collection stop is the single source of truth for job date. `plannedDate` is no longer needed and **must be deleted from the schema** — it was already removed from all planner-facing forms (session 2026-05-28b). No code should read or write `plannedDate` going forward.

Migration plan: verify all `plannedDate` reads/writes in `api/src/` are gone or migrated, then `DROP COLUMN plannedDate` from `Job`. This is a new task — log in CLEANUP_PLAN.md DISCOVERED.

**Affects:** TASK 2.3 (applyJobEvent timestamp context), TASK 3.6 (Job.status direct writes — no plannedDate in those writes).

---

## E.3 — LoadTrack granularity: **Option A — per-(run, jobPart)**

Every `LoadTrack` row must record both `runId` AND `jobPartId`. A single run picking up multiple loads produces one row per load, not one row per run leg. This is required for trailer tracking — knowing where each individual load is, not just which truck it was on.

**Affects:** TASK 2.4 (cancelRun soft-archive must scope to jobPart), TASK 4.3 (LoadTrack schema — add `jobPartId` NOT NULL if not already present).

---

## E.4 — Stale offline events: **Option A — flag everywhere, never reject**

Both the sync path and the online path should **flag** events older than 7 days as `needsReview = true` and save them. Neither path should reject. A driver who was offline for more than 7 days must not silently lose their work records.

Document this explicitly in `sync.constants.ts` next to `SYNC_REVIEW_RULES`.

**Affects:** TASK 2.2 (validateClientTimestamp returns `{ valid: true, needsReview: true }` for stale events — never `{ valid: false }`), TASK 2.3 (applyJobEvent must honour this for both paths).

---

## E.5 — Cascade-cancel run when last job cancelled: **Option B — NO auto-cancel**

Do not auto-cancel a run when all its assignments are cancelled. Leave the empty run for the planner to clean up manually. A warning banner in the planning board UI when a run has 0 stops is the correct UX response.

**Affects:** TASK 2.3 (no cascade run-cancel from applyJobEvent), TASK 2.4 (cancelRun does not trigger run auto-cancel).

---

## E.6 — JobPart without stops: **Option A — valid only during creation**

A `JobPart` may exist with zero stops transiently during job creation. The `ready_to_plan` gate must enforce ≥1 stop per part. Document this in ARCHITECTURE.md. No DB constraint needed — the validation gate is the enforcement point.

**Affects:** TASK 2.1 (event definitions — events on a zero-stop part are invalid), TASK 2.3 (applyJobEvent — guard: reject events on parts with no stops).

---

## E.7 — Customer required for `ready_to_plan`: **Option B — NO, customer is optional**

Internal moves (depot-to-depot yard shuffles, own-fleet repositioning) are valid jobs with no external customer. `ready_to_plan` does not require `customerId`. If a distinction is needed in future, add an `isInternalJob` boolean flag as a separate task.

**Affects:** TASK 2.3 (applyJobEvent — no customer check in transition guard), TASK 3.6 (Job.status writes — no customer constraint to add).

---

# Audit limits — what I did NOT cover

So you know what's still unaudited:

- Web (`web/src/**`) and mobile (`mobile/src/**`) duplication. Listed in `RELEASE_READINESS.md` as P1.
- Library code under `api/node_modules/**` — out of scope.
- `web/src/lib/textCase.test.ts` and any other downstream tests.
- Performance under load — I cannot run `EXPLAIN ANALYZE`.
- Migration history (only schema + most recent migrations).
- Email templates, PDF rendering layout — visual, not logic.

If you want me to extend the audit into mobile or web next, say which surface — same depth, same format.
