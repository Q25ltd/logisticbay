# Job Intake Flow Audit — request → job → run → assignment → execution

> Read-only audit. 2026-06-06. Verified against `schema.prisma`, `api/src/`, `web/src/`, `mobile/src/` per CLAUDE.md "check before claiming missing" rule.
> Scope: can a planner run a full day of work end-to-end today? **No — one defect breaks the chain, plus several gaps make a full day impractical.**

---

## Session-start checklist (CLAUDE.md)

- **STATUS.md** — Job intake CJP/PRF ✅; review pipeline ✅; runs/planning board 🔶 (publish notification, truck/trailer picker, dependency lock all partial); LoadTrack 🔶 (schema only, no write path); driver execution ✅ on mobile but see blocker below.
- **DEVLOG top entry** — "Fix CJP Job.status bug 2026-06-06": `createJob`/`patchJob` now write `status` from `saveMode`. No open items carried.
- **This session** — read-only audit, no code changed. Docs not modified (offered below).

---

## The chain, and where it breaks

```
customer request → accepted job → planned run → assigned truck/trailer/driver → driver execution
   PRF/CJP ✅        review ✅       planning ✅      assignment 🔶               BLOCKED ✗
```

The pieces exist and are individually solid. The **execution status state machine is wired to a different status vocabulary than the planning side**, so a planned job cannot legally receive a driver's first event. Everything upstream works; the last handoff fails.

---

## 🔴 BLOCKER — a planned job cannot be started by the driver

**The two halves of the lifecycle use disjoint `Job.status` vocabularies with no bridge.**

- Planning tier (intake → board): `draft → pending_review → ready_to_plan → in_planning → planned`
  - `jobService.createJob` writes `draft` / `ready_to_plan`; accept writes `ready_to_plan`; adding to a run advances to `in_planning` (`api/src/lib/jobUtils.ts:47`, `routes/runs.ts:478`, `routes/planning.ts:445`).
- Execution tier (driver events): `pending → accepted → in_progress → arrived_pickup → collected → arrived_dropoff → completed` (`api/src/sync/sync.constants.ts` `EVENT_DEFINITIONS`).

The `started` event has `allowedFromStatuses: ['pending','accepted']` (`sync.constants.ts:48`). `applyJobEvent` rejects any event whose `allowedFromStatuses` doesn't include the job's current status (`applyJobEvent.ts:128`). A planned job is in `in_planning` / `planned`, **never** `pending` or `accepted`. **No code path ever sets a planned job to `pending` or `accepted`** (grep confirms `Job.status` is only set to those values inside unrelated helpers — `jobUtils.ts:133` is a *stop* status, not job status).

**Result:** driver presses Start → `/sync/events` → `applyJobEvent` returns `{status:'failed', reason:"Cannot move job from 'in_planning' to 'in_progress'"}`. The driver is stuck on every job. This is the single thing that most blocks a real day.

**Fix direction:** add a bridge transition (publish, or run-start, sets job `pending`/`accepted`), or unify the two vocabularies into one registry. CLAUDE.md "Known gaps" already flags that `planned` and the execution statuses "are not yet implemented" — this audit confirms they are actively contradictory, not just absent.

---

## 🟠 HIGH — gaps that make a full planner day impractical

**1. "Publish" is decorative — the driver sees unpublished runs.**
`GET /jobs/my` (`routes/jobs.ts:137`) filters jobs by `run.assignedDriverId` only — it does **not** filter on `publishedToDriver` or run `status`. So a driver sees a job the instant a driver is attached to a draft run, before the planner publishes. The publish button, the recall button, and `publishedToDriver` have no effect on what the driver app shows. (`grep publishedToDriver` → zero reads in any job/run fetch outside the publish writer.)

**2. Compatibility gate at publish is a no-op.**
`POST /runs/:id/publish` blocks on `!trailerCompatible || !vehicleCompatible` (`runs.ts:395`), but `recalculateDerivedRequirements` (`runs.ts:28`) computes `requiredTrailerType`, `hasHazardous`, weight, equipment — and **never writes `trailerCompatible` or `vehicleCompatible`**. They stay at their schema default `true` forever. No code compares required trailer type vs the assigned trailer's body type, or load weight vs truck payload, at the run level. A fridge load on a flatbed publishes cleanly.

**3. No truck/trailer picker in the run UI.**
`PATCH /runs/:id` and `PATCH /planning/runs/:id` accept `assignedTruckId` / `assignedTrailerId`, but no web UI sets them (`RunDetailPage`, planning RunCard — only driver + trailer-by-string in the dashboard drawer). The PATCH also **does not validate** that the truck/trailer exists, belongs to the company, or is free — only the driver is validated (`runs.ts:318`). STATUS.md already lists this as 🔶.

**4. Run status never advances from driver activity.**
`applyJobEvent` only does `tx.job.update` — it never touches `Run.status`, `RunAssignment.status`, `Run.actualStartTime`, or `actualEndTime`. So a run stays `assigned` and every `RunAssignment.status` stays `pending` even after delivery. The planner's dashboard/board cannot show real run progress; STATUS 1.12 ("job status derived from RunAssignment completion") and the run reconciler are not built.

**5. LoadTrack custody ledger is never written.**
Model is fully defined and marked append-only, but there is **no `loadTrack.create` anywhere** in `api/src` (only reads in `plannerWorkService`). Collected/delivered events record nothing to the custody chain. Relay/yard-swap planning reads custody that is never populated, so multi-leg/relay days don't actually track the load.

---

## 🟡 MEDIUM — friction and inconsistency

**6. Two parallel run systems.** `/runs/*` (`routes/runs.ts`, used by `RunsPage`/`RunDetailPage`) and `/planning/runs/*` (`routes/planning.ts`, used by `PlanningBoardPage`) each create runs and assignments with separate logic. A planner using both surfaces sees divergent behaviour; bug fixes must be made twice.

**7. Dashboard "Assign" drawer is a third, job-centric model.** `AssignDrawer`/`dashboardUtils` operate on `job.assignedDriverId` and `job.assignedTrailer` (trailer-by-registration-string), but `Job` has **no** such columns in the schema. It's a synthetic/legacy shape disconnected from the FK-based `Run` model — confusing and a likely source of "assignment didn't stick".

**8. Run dependency lock not enforced.** `dependsOnRunId` is stored and badged, but publish does not block a dependent run whose predecessor isn't complete (STATUS 1.8). Relay days can publish leg 2 before leg 1 collects.

**9. No notifications anywhere.** Zero push infrastructure (no device tokens, no send path — grep confirms). Driver is not told when a run is published, modified, or recalled; planner is not told of delays/no-shows. For a live day the planner has no out-of-band signal.

**10. Split-load UI and load-availability checks** (STATUS 1.9, Phase 2.1–2.5) absent — a single job split across two trucks can't be quantity-balanced in the UI.

---

## 🟢 LOW — present but incomplete

- POD viewer, job-level PDF/delivery note: no web surface (`STATUS` Reporting).
- Jobs list: no date-range or customer filter.
- Job detail: no audit-log viewer, no stop-level execution status, no POD display.
- Availability board (all drivers, week view) not built — hard to pick a free driver at a glance.
- Resend-verification / admin PIN reset gaps (auth polish).

---

## Minimum set to make one real day work

1. **Bridge the status machines** (🔴 #blocker) — without this nothing the driver does succeeds.
2. **Make publish gate `/jobs/my`** (🟠 #1) — so drivers only see published work.
3. **Advance run + assignment status from driver events** (🟠 #4) — so the planner can see progress.
4. **Truck/trailer picker + real compatibility compute** (🟠 #2, #3) — so vehicles are actually assigned and checked.
5. **LoadTrack write path** (🟠 #5) — so collected/delivered is recorded (and relay days function).

Items 6–10 and the LOW list are quality-of-life; the five above are the load-bearing gaps between "demoable" and "a planner can run Tuesday on it."

---

## Verification notes

Every claim above was checked against code, not docs: schema models (`Job`, `Run`, `RunAssignment`, `LoadTrack`, `JobExecutionEvent`), the event state machine (`sync.constants.ts`, `applyJobEvent.ts`), `/jobs/my`, run publish/patch/recalc (`routes/runs.ts`), planning endpoints (`routes/planning.ts`), and the mobile sync target (`/sync/events`, `/jobs/my`). The status-vocabulary disconnect and the empty `loadTrack.create` set are the two highest-confidence findings.
