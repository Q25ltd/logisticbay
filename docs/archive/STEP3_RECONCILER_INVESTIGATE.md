# Step 3 — Reconciler — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Step 3 (§A6) + audit 🟠 #4 + STATUS P0.14. **Investigate only — no code written.** For review before implementation.
> Goal: derive `Job.status` and `Run.status` from execution state (dimension 2) + custody (dimension 3), so the office sees real progress. Ends the D1=A interim freeze where `Job.status` stays `planned` during execution.
> Date: 2026-06-07.

---

## 1. What I read — current writers and the gaps

**`Job.status` writers (production):**
- `lib/jobUtils.ts` `syncJobPlanningStatuses` — `ready_to_plan ↔ in_planning` on assignment add/remove; demotes `planned → ready_to_plan` if no assignments. Only touches the planning tier `{ready_to_plan, in_planning, planned}`.
- `services/jobService.ts` create/patch — `draft` / `ready_to_plan` (from `saveMode`).
- `routes/jobRequests.ts` — accept → `ready_to_plan`; reject → `cancelled`.
- `routes/jobs.ts` `status_override` — planner exceptional set (cancel/reopen/force-close), writes an override-flagged event.

**Gaps confirmed in code:**
- **`planned` is never set in production** (only in tests). Jobs sit at `in_planning` even when fully assigned.
- **`Job.status` does not move during execution** — `applyJobEvent` (post-Step-1) deliberately leaves it (D1=A). This is the freeze Step 3 removes.
- **`Run.status` never reaches `in_progress`/`completed`** — only `draft` (create) and `assigned` (publish / driver-assign). `actualStartTime`/`actualEndTime` are **never written** anywhere.
- **`RunAssignment.status`** now advances over `EXECUTION_STATES` (Step 1); **`LoadTrack`** records custody (Step 2). Both are ready to be read by a reconciler.

**Boundary is clean:** because `syncJobPlanningStatuses` only edits the planning tier, once the reconciler sets an execution-derived status (`in_execution`, `collected`, …) the planning sync won't revert it. No fight.

**Worker template exists:** `jobs/autoCleanupWorker.ts` (pg_advisory_lock single-instance + `setInterval` + `startAutoCleanupWorker(prisma)`), registered in `server.ts`. The nightly sweep reuses this exact shape.

---

## 2. Proposed design — `reconcileLoadState(tx, { jobId, companyId })`

A single function (`api/src/lib/reconcileLoadState.ts`) — the **only** writer of derived statuses (A6 / invariant 7).

**Reads:** active `RunAssignment`s for the job (states) + their runs; latest `LoadTrack` per `jobPartId` (current custody).

**Derives Job.status (rollup):**
- Respect terminal/planner-owned: never touch `draft`, `pending_review`, `ready_to_plan`, `cancelled`. Enter only from `in_planning` / `planned` or an already-derived execution status.
- Any assignment in `exception` → `attention_needed`. *(Inert until Step 11 introduces exception events — branch included but never fires yet.)*
- All parts `delivered` (custody at `customer_dest`) → `completed`.
- Some delivered → `partially_delivered`.
- All collected (on_vehicle/beyond, none delivered) → `collected`.
- Some collected → `partially_collected`.
- Any assignment past `not_started`, nothing collected → `in_execution`.
- Otherwise leave unchanged.

**Derives Run.status (rollup) + timestamps:**
- All active assignments `delivered` → `completed` + set `actualEndTime` (once).
- Any assignment past `not_started` → `in_progress` + set `actualStartTime` (once).
- Never override `cancelled`; never demote `completed`.

**Idempotent:** running twice yields the same result; only writes when a value actually changes (avoids churn / no-op updates).

---

## 3. Keep / Change / Delete

| File | Call | Why |
|---|---|---|
| **new** `api/src/lib/reconcileLoadState.ts` | **ADD** | The reconciler (A6). Sole writer of derived `Job.status` + `Run.status` rollups. |
| `api/src/sync/applyJobEvent.ts` | **CHANGE (small)** | After writing the assignment/event/custody, call `reconcileLoadState(tx, …)` so every event reconciles atomically in the same transaction. Both callers get it for free. |
| **new** `api/src/jobs/reconcileWorker.ts` | **ADD** (D3.4) | Nightly sweep over recently-active jobs, mirroring `autoCleanupWorker` (advisory lock + interval). Registered in `server.ts`. Catches anything missed (e.g. crash between event and reconcile). |
| `api/src/server.ts` | **CHANGE (small)** | Register `startReconcileWorker(prisma)` next to `startAutoCleanupWorker`. |
| `api/src/lib/jobUtils.ts` `syncJobPlanningStatuses` | **KEEP** | Planning-tier owner stays. Boundary respected (it ignores execution-derived statuses). |
| `routes/jobs.ts` `status_override` | **KEEP** | Planner escape hatch; reconciler respects `cancelled` and won't fight a deliberate override. |
| `loadVocab.ts` | **KEEP / consume** | Reconciler uses `JOB_PLANNING_STATUSES`, `DERIVED_JOB_STATUSES`, `TERMINAL_CUSTODY_BASES`, `custodyBaseOf` — resolving several of the "unused export" knip flags. |
| Tests | **ADD** | `reconcileLoadState.test.ts`: B1 chain ends `Job.status=completed` + `Run.status=completed` + timestamps; half-delivered → `partially_delivered`; collected-not-delivered → `collected`; idempotent (run twice = same); cancelled not overridden. |

**Deletions: none.**

---

## 4. Decisions I need before coding

**D3.1 — Call site (recommended: end of `applyJobEvent`, same tx).** Atomic with the event; both callers covered at one chokepoint. Alternative: call in each caller after the tx commits (simpler reconciler, but two call sites and a non-atomic window).

**D3.2 — The unset `planned` status (recommended: defer, treat as a separate planning-tier task).** `planned` is never set today. Step 3 will treat both `in_planning` and `planned` as valid execution entry points, so the reconciler works regardless. Actually *setting* `planned` (when all stops are assigned) is a planning-tier change to `syncJobPlanningStatuses` — I recommend leaving it out of Step 3 to keep scope on execution rollup, and logging it as a follow-up. Alternative: add a one-line rule now.

**D3.3 — Run.status rollup + actual timestamps (recommended: include).** It's in the Step 3 exit criteria and fixes audit 🟠 #4. The reconciler sets `in_progress`/`completed` and `actualStartTime`/`actualEndTime`.

**D3.4 — Nightly sweep worker (recommended: include, mirroring autoCleanupWorker).** Per-event reconcile is the essential path; the sweep is the safety net (P0.14). Low cost given the template exists. Alternative: ship per-event now, add the sweep later.

**D3.5 — `attention_needed` branch (recommended: include but dormant).** No event produces the `exception` execution state until Step 11, so the branch never fires yet. Including it now means Step 11 needs no reconciler change. Harmless.

---

## 5. Risk / scope notes

- **Multi-part execution caveat (carried from Steps 1–2):** under the job-level event model, `applyJobEvent` advances one assignment; for multi-stop jobs other assignments may lag. The reconciler reads *all* assignments + custody, so its rollup is as correct as the underlying data — it will report `partially_*` honestly. Full per-stop execution remains a later step; the reconciler does not need to change when it lands.
- **Override coexistence:** reconciler never touches `cancelled` and only enters from planning/execution statuses, so a planner `status_override` is respected. A planner force-`completed` then more events is an edge case handled by "never demote completed".
- **Parked (not Step 3):** publish gate (S4), vehicle compatibility (S5), yard/swap/handover/split (S6+), exception events (S11), the needs-review surface (S15).
- **Exit gate (S3):** B1 chain reconciles `Job.status → completed` and `Run.status → completed` with timestamps, no manual step; half-done states report `partially_collected`/`partially_delivered`; reconciler idempotent; typecheck/check:vocab/api-tests green (DB tests on Mac).

---

## 6. Recommendation

Proceed with **D3.1 = end of applyJobEvent; D3.2 = defer `planned` to a planning-tier follow-up; D3.3 = include Run rollup + timestamps; D3.4 = include nightly sweep; D3.5 = include dormant attention_needed**. This delivers the "then job" automation (delivered B1 → completed with no manual step), fixes the run-progress gap, and needs no schema or mobile change. Awaiting review before writing any code.
