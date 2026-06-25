# Step 1 — Status Bridge — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Step 1. **Investigate only — no code written.** For review before implementation.
> Goal: make a *planned* job startable by a driver, by separating Job.status (planning) from RunAssignment execution state. Resolves the 🔴 audit blocker.
> Date: 2026-06-07.

---

## 1. What I read, and the exact problem confirmed

`applyJobEvent` (the single state machine both paths use) checks the incoming event against **`Job.status`** and writes **`Job.status`**:

- `applyJobEvent.ts:128` — `if (!def.allowedFromStatuses.includes(job.status)) → failed`
- `applyJobEvent.ts:136` — `tx.job.update({ data: { status: def.resultingStatus } })`

`EVENT_DEFINITIONS` (`sync.constants.ts:45`) is written in **execution vocabulary**: `started` is allowed only from `['pending','accepted']` and results in `in_progress`. But production jobs are in **planning vocabulary** — `createJob` writes `draft`/`ready_to_plan`, and `jobUtils`/`runs`/`planning` advance them to `in_planning`/`planned`. **No code anywhere sets `Job.status` to `pending` or `accepted`** (confirmed by grep — the only `'pending'` writes are `RunAssignment.status`, `SyncEventLog.status`, and a JobPart stop status). So a `planned` job hitting `started` fails at line 128. Blocker confirmed in code.

**Why the test suite is green despite this:** `applyJobEvent.test.ts:52` hand-creates a job with `status:"in_progress"` to test transitions. It never exercises the planning→execution handoff, so it can't catch the blocker. (This is itself a gap Step 1 must close with a real test.)

**Good news — the wiring is already in place:**
- Both callers (`sync.service.ts:113`, `routes/jobs.ts:407`) already funnel through `applyJobEvent` — one chokepoint to change.
- Both callers already resolve the `RunAssignment` for the job+driver before calling (`sync.service.ts:100`, `jobs.ts:376`) — they just don't pass it in.
- `RunAssignment.status` is **never written anywhere** beyond its `"pending"` default (grep confirms) — so dimension 2 is a clean slate; nothing to break.
- `JobExecutionEvent` already has `runId`, `runAssignmentId`, `jobPartId` columns ready to populate.

---

## 2. Keep / Change / Delete

| File | Call | Why |
|---|---|---|
| `api/src/sync/applyJobEvent.ts` | **CHANGE (core)** | Stop reading/writing `Job.status`. Read/advance `RunAssignment.status` over `EXECUTION_STATES`; write the `JobExecutionEvent` with `runAssignmentId`/`jobPartId`/`runId` populated. Keep: idempotency block, GPS/timestamp contract (validated by callers), the E.1 driver-can't-cancel guard, clientEventId-required. |
| `api/src/sync/sync.constants.ts` | **CHANGE** | Retarget `EVENT_DEFINITIONS` from Job.status → execution-state transitions (`started`: `not_started`→`en_route_pickup`, etc.), importing names from `loadVocab.ts`. Keep the "everything derived from one definition" pattern (`SUPPORTED_EVENT_TYPES`, the derived maps). The job-level `PLANNER_ONLY_TRANSITIONS` (accept/cancel) stays as-is — those remain Job.status, planner-only. |
| `api/src/sync/sync.service.ts` | **CHANGE (small)** | It already finds `runAssignment` (line 100) — pass `runAssignmentId`, `jobPartId`, `runId` into `applyJobEvent`. Keep the rest of the pipeline. |
| `api/src/routes/jobs.ts` `PATCH /jobs/:id/status` | **CHANGE (small)** | It already resolves `assignment` for drivers (line 376) — pass its ids into `applyJobEvent`. Keep tenant/role guards and the `ready_to_plan` vehicle gate. **Decision needed on the response shape — see §4.** |
| `api/src/routes/jobs.ts` `GET /jobs/my` | **KEEP** | Publish-gate is Step 4; execution-state display can wait. Out of scope. |
| `api/src/constants/loadVocab.ts` (+ mirrors) | **KEEP / consume** | Step 1 is the first importer — uses `EXECUTION_STATES`. Resolves the knip "unused" flag for the api copy. |
| `web/src/constants/jobStatuses.ts`, `mobile/src/constants/jobStatuses.ts`, `api/src/sync/runStatuses.ts` | **KEEP (do not touch)** | The three divergent copies + run statuses are consolidated later, not in Step 1. No deletions this step. |
| `applyJobEvent.test.ts`, `sync.constants.test.ts` | **CHANGE** | Update to the execution-state machine; **add** the missing planned-job end-to-end chain test (the one the suite never had). |

**Deletions in Step 1: none.** (Per plan — consolidation happens once the new path is proven.)

---

## 3. Proposed change plan (for review — not yet built)

1. **`EVENT_DEFINITIONS` → execution states.** Rewrite each event to `{ resultingState, allowedFromStates }` over `EXECUTION_STATES`:
   `started`: `not_started`→`en_route_pickup`; `arrived_pickup`: `en_route_pickup`→`at_pickup`; `collected`: `at_pickup`→`loaded`; `arrived_dropoff`: `loaded`→`at_dropoff`; `completed`(=delivered): `at_dropoff`→`delivered`. Keep all derived maps generated from this.
2. **`applyJobEvent`**: accept `runAssignmentId`, `jobPartId`, `runId` in the input. Replace the `job.status` read/write with: load the `RunAssignment`, validate `allowedFromStates.includes(assignment.status)`, `tx.runAssignment.update({ status: resultingState })`, and create the `JobExecutionEvent` with the run/assignment/part ids set. **`Job.status` is left untouched** (the reconciler in Step 3 derives it).
3. **Both callers**: pass the already-resolved assignment ids through.
4. **Tests**: convert existing transition tests to execution states; add a real test that builds a `planned` job + run + assignment + driver and runs `started → … → delivered` green (the blocker regression test).

---

## 4. Decisions I need from you before coding

**D1 — Interim Job.status staleness (Step 1 → Step 3 gap).** Step 1 makes driver events advance the *assignment*, and deliberately stops touching `Job.status`. The reconciler that derives `Job.status` (in_execution/collected/…) is **Step 3**. So between S1 and S3, `Job.status` won't move during execution, and any UI keyed on `Job.status` (mobile job badge, web job list) shows the planning status until S3 lands.
- **Option A (recommended):** keep S1 pure (assignment-only), do S3 right after. Validate S1 by assignment state + tests, accept brief UI staleness. Cleanest separation.
- **Option B:** fold a minimal `Job.status` rollup into S1 as a stopgap, replaced by the real reconciler in S3. Less staleness, but writes throwaway code.

**D2 — Online endpoint response shape.** `PATCH /jobs/:id/status` currently returns `{ status: <new Job.status> }`, which mobile uses to update its UI. After S1 that value is unchanged (stale).
- **Recommended:** return the new **execution state** (assignment status) alongside, e.g. `{ jobStatus, executionState }`, so mobile can reflect progress now. Keep accepting the existing `status` field on the way in (mapped to an event) so the mobile→server contract doesn't break.

**D3 — `RunAssignment.status` default.** It currently defaults to `"pending"`; the new vocab starts at `"not_started"`.
- **Recommended:** a tiny schema migration changing the default to `"not_started"` (it's never read today, so zero data risk) — keeps the vocab clean. Alternative: treat `"pending"` as the not_started alias in code (no migration). This is a schema touch (authority #1), so I want explicit sign-off either way.

---

## 5. Risk / scope notes

- **Mobile sends a target `status` string** (e.g. `"collected"`), not an eventType, on the online path — already mapped via `EVENT_TYPE_MAP`. Keeping that wire contract means **no mobile release is required** for Step 1. (Mobile display improvements depend on D2.)
- **Parked (not Step 1):** publish gate (S4), LoadTrack writes (S2), reconciler/Job.status derivation (S3), consolidating the three jobStatuses copies (later). If I hit any of these while coding S1, I note them and stop — I do not pull them forward.
- **Exit gate for S1:** planned job runs the full driver event chain green in a new test; assignment advances `not_started→…→delivered`; `Job.status` provably unchanged by events; typecheck/check:vocab/api-tests green (DB-dependent ones on your Mac).

---

## 6. Recommendation

Proceed with **D1=A, D2=return executionState, D3=migration to `not_started`**. That keeps the dimensions cleanly separated, requires no mobile release, and sets Step 2 (LoadTrack) and Step 3 (reconciler) up to slot in without rework. Awaiting your review before writing any code.
