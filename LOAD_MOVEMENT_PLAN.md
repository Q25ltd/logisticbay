# LogisticBay — Load Movement: Complete Logic & Gated Build Plan

> The single source for how a load travels from **registered in the system** to **delivered**, covering every path, vehicle, person, swap, delay, and exception — and the **gated, step-by-step build sequence** to make it real.
> Rule for this whole plan: **no step jumps ahead.** Each step starts by investigating the existing code (keep what's good, change what's wrong, delete what's bad), then builds only what that step needs, then must pass its exit gate before the next step may start.
> Status: PLAN ONLY. No code is written yet. Grounded in the 2026-06-06 audit (`JOB_INTAKE_FLOW_AUDIT.md`) and the live schema.
> Created: 2026-06-06.

---

## 0. How to read this document — the gating contract

This plan has three parts:

- **Part A — the model.** The logic: the states a load lives in, the custody ledger, the status registries, the actors, and the always-true rules. This is *what is true* about a load at any moment.
- **Part B — the scenarios.** Every way a load can physically move, exhaustively, each expressed as a path over the same small set of primitives from Part A. If a new scenario appears, it must compose from these primitives — not invent new ones.
- **Part C — the build plan.** The ordered steps to build it. Each step is a **gate**.

A **gate** has six fixed sections, always in this order:

1. **Investigate first** — read the named existing files. Decide per file: *keep* (already correct), *change* (wrong/incomplete), *delete* (dead/duplicated). Write the keep/change/delete list before touching anything. (This is your rule, applied to every step.)
2. **Entry criteria** — what must already be true (usually: the previous step's exit gate is green). If entry criteria aren't met, the step cannot start.
3. **Build** — the exact models, endpoints, and UI this step adds or fixes. Nothing outside this list.
4. **Exit criteria** — the observable "done" definition. Phrased so it's testable, not "looks finished."
5. **Verify** — the CLAUDE.md gates: `npm run typecheck`, `npm run check:vocab`, `npm test --prefix api`, `npx knip` (no new unused), plus the step's own test and grep checks.
6. **Cannot proceed until** — the one-line blocker. The next step is forbidden until this is green.

**The golden rule against task-jumping:** if you are in Step N and discover work that belongs to Step N+3, you do **not** do it now. You note it in that step's "Investigate first" backlog and continue. A step is only "done" when its own exit criteria pass — not when you've touched everything nearby.

---

# PART A — THE MODEL (the logic)

## A1. The core problem this model solves

Today the codebase has **two disconnected status vocabularies** fighting over one field (`Job.status`):

- Planning side drives a job `draft → pending_review → ready_to_plan → in_planning → planned`.
- Execution side (driver events) expects `pending → accepted → in_progress → arrived_pickup → collected → arrived_dropoff → completed` and **rejects** any event whose `allowedFromStatuses` doesn't match.

A planned job is `in_planning`; the driver's `started` event only accepts `pending`/`accepted`; nothing bridges them. So **the driver can never start a planned job.** (Audit blocker 🔴.)

The fix is not "pick one vocabulary." It is to recognise that a load has **three independent dimensions** that must never be collapsed into one field. Once separated, the conflict disappears.

## A2. The three dimensions of a load (never collapse these)

A load = a `JobPart` quantity. At any instant it has three orthogonal facts:

| Dimension | Question it answers | Owned by | Who moves it |
|---|---|---|---|
| **1. Planning status** (`Job.status`) | Where is this job in the office workflow? | Job | Planner actions + reconciler |
| **2. Execution state** (per `RunAssignment` / stop) | What has the driver physically done at this stop? | RunAssignment | Driver events |
| **3. Custody** (`LoadTrack` ledger) | Where is the physical load right now, and who holds it? | LoadTrack (append-only) | Every collect/drop/swap/deliver |

The audit blocker exists **only** because dimensions 1 and 2 were merged. In this model:

- Drivers **never** write `Job.status` directly. Driver events advance dimension 2 (execution state) and append to dimension 3 (custody).
- `Job.status` (dimension 1) is **derived** by a reconciler that rolls up the execution states of all the job's parts. Planning still sets the planning-tier statuses; execution can no longer contradict them.

This is also exactly what CLAUDE.md "Known gaps" already wants: rollup statuses `partially_collected`, `partially_delivered`, `attention_needed` — these are *derived*, not driver-set.

## A3. Dimension 1 — Job planning status registry (one file)

`Job.status` values, in lifecycle order. **Office/planner + reconciler only.** No driver event writes these.

```
draft              # being created (CJP), not submitted
pending_review     # came in via Public Request Form, awaiting planner accept
ready_to_plan      # accepted / created ready; eligible for the planning board
in_planning        # has at least one active RunAssignment, not all parts assigned
planned            # every part assigned to a run; runs not yet started
in_execution       # at least one part's execution has begun (derived)
partially_collected# some but not all parts collected (derived)
collected          # all parts collected, none yet delivered (derived)
partially_delivered# some but not all parts delivered (derived)
completed          # all parts delivered, ledger closed (derived)
attention_needed   # an exception is open (refusal/breakdown/damage/partial) (derived)
cancelled          # planner cancelled
```

The derived ones (`in_execution` → `completed`, plus `attention_needed`) are written **only** by the reconciler in A6, never inline. `draft`→`planned` and `cancelled` are written by planner/intake code.

## A4. Dimension 2 — Execution state registry (one file)

Per `RunAssignment` (a JobPart on a Run). **Driver events only.** This is the state machine the mobile app actually drives.

```
not_started   # assignment published, driver hasn't acted
en_route_pickup
at_pickup
loaded        # this part is on the vehicle (collected for this leg)
en_route_dropoff
at_dropoff
delivered     # handed to consignee (final) OR dropped at yard (interim — see custody)
exception     # refused / damaged / breakdown affecting this assignment
```

Driver events map 1:1 to transitions here. Because the state lives on the **assignment** (a part on a *specific run*), the same physical load can be `delivered` on Run 1 (dropped at yard) and `not_started` on Run 2 (yard→customer) without contradiction. That is what makes relays and swaps representable.

## A5. Dimension 3 — Custody ledger (`LoadTrack`) — the heart of "track all paths"

`LoadTrack` exists in the schema, fully defined, **append-only** — the write path went live in Step 2 (2026-06-07); see STATUS.md for current state. It is the spine of every scenario in Part B. One row = one custody transfer of a quantity.

**Custody locations** (`fromCustody` / `toCustody` string values — one registry):

```
customer_origin:<stopId>      # at collection site, not yet picked up
on_vehicle:<truckReg|trailerId># physically on a vehicle, held by a driver
yard:<locationId|label>       # buffered at a depot/yard, no driver holding it
customer_dest:<stopId>        # delivered to consignee (terminal-good)
returned:<stopId|yard>        # refused, sent back (origin or yard)
written_off                   # damage/loss terminal-bad
```

**Transaction types** (`transactionType` — one registry):

```
collect          customer_origin   → on_vehicle
drop_at_yard     on_vehicle        → yard
pick_from_yard   yard              → on_vehicle
trailer_swap     on_vehicle(A)     → on_vehicle(B)        # same driver, different trailer
handover         on_vehicle(A)     → on_vehicle(B)        # driver A → driver B
deliver          on_vehicle        → customer_dest        # terminal-good
split            (parent qty)      → two child custody rows# quantity divided
consolidate      N rows            → same on_vehicle       # many loads, one vehicle (no qty change)
refuse_return    on_vehicle/customer_dest → returned
damage_writeoff  any               → written_off
```

Every row carries: `quantity`, `unit`, `driverId`, `trailerId`, `runId`, `runAssignmentId`, `eventId` (the `JobExecutionEvent` that caused it), `gpsLat/Lng`, `timestamp`. The ledger is the **audit-proof story** of where the load went and who touched it.

## A6. The reconciler — how the three dimensions stay consistent

A single function (call it `reconcileLoadState(jobId, tx)`) runs after **every** execution event and at a nightly sweep. It is the *only* writer of derived `Job.status`. Logic:

1. Read all `RunAssignment` execution states for the job's parts.
2. Read the latest `LoadTrack` custody per part (current location of each quantity).
3. Roll up:
   - all parts `delivered` at `customer_dest` → job `completed`;
   - some delivered, some not → `partially_delivered`;
   - all `loaded`/past pickup, none delivered → `collected`;
   - some collected → `partially_collected`;
   - any assignment in `exception` → `attention_needed` (overrides the above for surfacing);
   - any execution started, nothing collected yet → `in_execution`.
4. Never moves a job *backwards* past `cancelled`; never overwrites planner-set `cancelled`.

This is CLAUDE.md P0.14 ("Job status reconciler from event log") made concrete, and it removes the disjoint-vocabulary bug permanently because execution and planning no longer write the same field.

## A7. The actors and what each may do

| Actor | Reads | Writes (allowed) | Never |
|---|---|---|---|
| **Planner / owner** | everything | Job planning status (draft→planned, cancel), Run create/assign/publish/recall, reassignment, overrides | Driver execution states directly (except via explicit override endpoint with audit) |
| **Driver (assigned)** | own published runs only | Execution events (start/arrive/collect/drop/swap/handover/deliver/exception) → which append LoadTrack | Other drivers' runs; planning status; unpublished runs |
| **Driver (receiving, handover)** | the inbound run after handover accepted | `pick_from_yard` / accept-handover events | Anything before the handover offer exists |
| **Yard / depot (future)** | depot buffer | confirm `drop_at_yard` / release `pick_from_yard` | on-road events |
| **Reconciler (system)** | events + ledger | derived `Job.status`, derived `Run.status` | anything a human must decide (exceptions stay `attention_needed`) |
| **Customer (future portal)** | own job status + POD | nothing | internal data |

## A8. Invariants — the rules that must ALWAYS hold (every step is tested against these)

1. **Single custody.** A given quantity of a load is in exactly one custody location at any time. The ledger's latest row per `jobPartId` (+ split child) is its current location.
2. **Conservation of quantity.** Sum of child quantities after a `split` equals the parent. Nothing is created or destroyed except `deliver` (→customer), `damage_writeoff`, or `refuse_return`.
3. **No delivery before collection.** A `deliver` row requires a prior `collect` for that quantity in the chain. No part reaches `customer_dest` without passing through `on_vehicle`.
4. **Append-only ledger.** `LoadTrack` rows are never updated or deleted (soft-delete only for GDPR). Corrections are new compensating rows.
5. **Every custody change has a cause.** Every `LoadTrack` row references the `JobExecutionEvent` (`eventId`) that produced it. No orphan custody.
6. **Publish controls visibility.** A driver sees a run's work **only** when `publishedToDriver = true`. (Fixes audit 🟠 #1.)
7. **Drivers never set planning status.** Dimension 1 is reconciler/planner-only.
8. **Dependency before handoff.** A relay leg cannot mark `pick_from_yard`/accept-handover until the feeding leg has a matching `drop_at_yard`/`handover` row for that quantity. (Fixes audit 🟠 #8 dependency lock.)
9. **Tenant scoping.** Every read/write filters `companyId` (existing law — unchanged).
10. **Idempotent events.** Every execution event carries `clientEventId`; duplicates are no-ops (existing — unchanged).

These ten are the acceptance bar. Any scenario in Part B that would violate one is a bug in that scenario's design, not an exception to the rule.

---

# PART B — EVERY MOVEMENT SCENARIO (exhaustive)

Every scenario below is the **same five primitives** from Part A composed differently: an execution event advances a `RunAssignment` state and appends a `LoadTrack` custody row; the reconciler rolls up `Job.status`. Read each as: *actors → sequence (event ⇒ custody transition) → run shape → what can go wrong*. The notation `collect ⇒ origin→vehicle` means "the `collect` event moves custody from `customer_origin` to `on_vehicle`."

A quick legend for the happy path that every scenario is a variation of:

```
started        ⇒ (no custody change; assignment not_started → en_route_pickup)
arrived_pickup ⇒ (assignment → at_pickup)
collected      ⇒ collect: customer_origin → on_vehicle   (assignment → loaded)
started_dropoff⇒ (assignment → en_route_dropoff)
arrived_dropoff⇒ (assignment → at_dropoff)
delivered      ⇒ deliver: on_vehicle → customer_dest     (assignment → delivered)
→ reconciler: all parts delivered ⇒ Job.status = completed   ← "then job"
```

## B1. Direct — one truck, collect → deliver (the base case)

- **Actors:** planner, one driver.
- **Sequence:** the legend above, single run, single part.
- **Run shape:** Run with one `RunAssignment`; truck+trailer+driver assigned; published.
- **Goes wrong:** wrong vehicle for the load (Step 5 compatibility), driver doesn't see it (Step 4 publish gate). Both covered downstream.

## B2. Relay via yard/depot buffer (two runs, a buffer in the middle)

The load is collected by run 1, dropped at a yard, later picked by run 2 and delivered. This is why execution state lives on the *assignment*, not the job.

- **Actors:** planner, driver A (run 1), driver B (run 2), optionally yard staff.
- **Sequence:**
  - Run 1 / part: `collected ⇒ collect origin→vehicle`; then `drop_at_yard ⇒ vehicle→yard:<loc>` (assignment 1 → delivered, but custody is `yard`, **not** `customer_dest`).
  - Reconciler sees part is in `yard` ⇒ Job stays `partially_collected`/`in_custody`, **not** completed (invariant 1 + 3 keep it honest).
  - Run 2 / **same** part, new assignment: `pick_from_yard ⇒ yard→vehicle` (gated by invariant 8: a matching `drop_at_yard` row must exist); then `delivered ⇒ deliver vehicle→customer_dest`.
- **Run shape:** Run 2 has `dependsOnRunId = Run 1`. A `RunWaypoint` of type `yard_pickup` marks the buffer on run 2; `hub_drop` on run 1.
- **Goes wrong:** run 2 published before run 1 dropped → blocked by dependency lock (Step 13). Yard location not recorded → `drop_at_yard` requires a `yard:` custody target (Step 6).

## B3. Relay by direct driver handover (A → B, no yard)

Two drivers meet; load passes vehicle-to-vehicle (or the loaded trailer is handed over) without a yard buffer.

- **Actors:** driver A, driver B, planner (sets up the handover point).
- **Sequence:** A `collected ⇒ origin→vehicleA`; at the meet point A raises `handover_offered`; B `handover_accepted ⇒ handover vehicleA→vehicleB` (one `LoadTrack` row, `transactionType=handover`, both driver IDs captured); B `delivered ⇒ vehicleB→customer_dest`.
- **Run shape:** Run A and Run B, `dependsOnRunId` links B→A; handover waypoint on both with matching location.
- **Goes wrong:** B accepts before A offers (invariant 8 blocks); only one driver records it → ledger gap (the handover is a **single** row authored at accept-time, referencing A's offer event, so custody can't double-count).

## B4. Trailer swap (same driver, drop loaded trailer, take another)

Driver drops a loaded trailer at a location and couples a different one (loaded or empty). Custody of the load follows the *trailer*, not the truck.

- **Actors:** one driver (plus whoever later pulls the dropped trailer — often a B2/B3 follow-on).
- **Sequence:** `trailer_swap ⇒ on_vehicle:<trailerX> → yard:<loc>` for the load left behind on trailer X; the driver's run continues with trailer Y. If they pick up an already-loaded trailer Y, that's a `pick_from_yard` for trailer Y's load.
- **Run shape:** `Run.assignedTrailerId` changes mid-run; the swap is a waypoint; the dropped trailer's load becomes available for another run (links to B2).
- **Goes wrong:** the dropped load is "lost" if no row is written — the swap event **must** write the custody row or invariant 1 breaks. Trailer Y not in fleet / already assigned elsewhere (Step 5 validation).

## B5. Split load (one job part across multiple runs/trucks)

A single part's quantity is divided — e.g. 26 pallets, 14 on truck 1 and 12 on truck 2.

- **Actors:** planner (decides the split), two drivers.
- **Sequence:** planner action creates a `split` ledger row dividing the parent quantity into two tracked child quantities (invariant 2: 14+12=26). Each child rides its own run as a normal B1, each `deliver` row carries its child quantity. Reconciler marks the job `partially_delivered` until **both** children reach `customer_dest`.
- **Run shape:** two `RunAssignment`s for the same `jobPartId`, each with `quantityAssigned` summing to the part total. Balance check at assign time (Step 9).
- **Goes wrong:** quantities don't sum (conservation check rejects); one child delivered, one refused → job `attention_needed`.

## B6. Consolidation (many loads, one vehicle)

Multiple jobs/parts ride one run/trailer together (groupage).

- **Actors:** planner, one driver.
- **Sequence:** each part `collected ⇒ origin→vehicle` onto the **same** `on_vehicle:<trailer>`; deliveries happen at each part's own dropoff in route order. No quantity change; `consolidate` is bookkeeping that several custody chains share a vehicle.
- **Run shape:** one Run, many `RunAssignment`s (different jobs), route-ordered by `sequenceNumber`.
- **Goes wrong:** combined weight exceeds payload (run-level compatibility, Step 5); ADR + food on same trailer (compatibility rules); delivering the wrong part at a stop (route-order + scan/confirm at delivery).

## B7. Multi-day / overnight (tramper, rest break mid-journey)

A run spans calendar days; the driver rests overnight with the load on board.

- **Actors:** tramper driver, planner.
- **Sequence:** normal events across two days; an `overnight_rest` waypoint marks the legal stop. Custody stays `on_vehicle` through the rest (the load doesn't change hands). Existing `POST /planning/runs/:id/overnight-rest` already models the relay-run creation; this plan keeps it and connects its custody.
- **Run shape:** existing overnight-rest support (kept). Day-driver-on-multi-day-run is a publish warning (Step 5/13).
- **Goes wrong:** day driver assigned to a 2-day run (warn now, block later — STATUS Phase 3); rest hours miscalculated (existing EC 561/2006 logic kept).

## B8. Delay (within any step)

Not a custody change — a time exception captured against the current assignment/stop.

- **Actors:** driver (reports), planner (notified).
- **Sequence:** driver raises `delay_reported` with a cause + optional ETA; no custody row, but a `JobExecutionEvent` is logged and the planner is alerted (Step 14). Defends the driver against unfair blame (STATUS Phase 4 intent).
- **Goes wrong:** delay cascades to a dependent relay leg → dependency timing recomputed; customer time window now missed → flag on the dropoff stop.

## B9. Breakdown (vehicle fails mid-run, load stranded)

- **Actors:** driver, planner, recovery (external), possibly a rescue driver.
- **Sequence:** driver raises `breakdown` (assignment → `exception`; custody stays `on_vehicle` but flagged stranded). Planner options: (a) recovery + same driver continues (clear exception, resume); (b) **reassign** — a rescue run picks the load: `handover ⇒ vehicleA→vehicleB` (B3) or `drop_at_yard` then `pick_from_yard` (B2). Job → `attention_needed` until resolved.
- **Goes wrong:** load location unknown at breakdown (GPS on the breakdown event pins it); reassignment without recording handover (invariant 5 forbids orphan custody).

## B10. Driver no-show / pre-start reassignment

Before any custody exists — purely a planning reassignment.

- **Actors:** planner.
- **Sequence:** no `collect` has happened, so no ledger rows. Planner reassigns the run to another driver (or rebuilds the run). Recall the old publish, publish to the new driver. Clean because custody is empty.
- **Goes wrong:** old driver already pressed `started` (en_route) but not collected → reassignment must reset assignment execution state to `not_started` for the new driver, audit the reset.

## B11. Failed / refused delivery (consignee rejects)

- **Actors:** driver, planner, original customer.
- **Sequence:** at dropoff the consignee refuses: `delivery_refused ⇒ refuse_return on_vehicle→returned` (assignment → `exception`, reason captured: damaged/wrong/closed/over-quantity). Planner decides the return path: back to origin (`returned:origin`), to a yard (`returned:yard` → becomes a new B2 redelivery), or write-off. Job → `attention_needed`.
- **Goes wrong:** partial refusal (consignee takes 8 of 10 pallets) → `deliver` for 8 + `refuse_return` for 2 (invariant 2 conservation: 8 delivered + 2 returned = 10).

## B12. Partial collection / partial delivery (quantity short)

- **Actors:** driver, planner.
- **Sequence:** at pickup only part of the expected quantity is available: `collected` records the **actual** `quantityConfirmed` < expected; the shortfall stays `customer_origin` and the job is flagged `partially_collected` / `attention_needed` for the planner to decide (re-collect later = B2-style, or close short). Partial delivery is the mirror at the dropoff.
- **Goes wrong:** driver confirms more than expected (over-collection) → flagged `needsReview`; reconciler does not silently accept quantity drift.

## B13. Damage at collection or delivery

- **Actors:** driver, planner, customer.
- **Sequence:** `damage_reported` at pickup (note + photo + GPS, custody still moves but flagged) or at delivery; if the load is unusable, `damage_writeoff ⇒ any→written_off` (terminal-bad, conservation honoured by recording the written-off quantity). Job → `attention_needed`.
- **Goes wrong:** damage discovered after delivery (consignee claim) → compensating ledger row referencing the new event, not an edit of the old one (invariant 4).

## B14. Cancellation mid-flight (planner cancels while load is in custody)

- **Actors:** planner.
- **Sequence:** planner cancels. If custody is empty → straightforward `cancelled`. If the load is `on_vehicle` or `yard` → **cannot** just vanish: planner must choose a disposition (return to origin = `refuse_return`, leave at yard for collection, etc.). The existing `cancelRun` service already preserves LoadTrack on cancel (kept). Job → `cancelled` only once custody reaches a terminal/handled location.
- **Goes wrong:** silent cancel that strands a load (forbidden — invariant 1 + the "stop and ask" rule).

## B15. The composition guarantee

Every scenario above is built from: **collect, drop_at_yard, pick_from_yard, trailer_swap, handover, deliver, split, consolidate, refuse_return, damage_writeoff**. A genuinely new operational situation must be expressed as a sequence of these. If it cannot be, that is the signal to add a new primitive to A5 **deliberately** (with its custody transition and invariant impact) — not to special-case it in a route handler. This is what keeps the system from sprawling back into the mess the cleanup phases fought.

---

# PART C — THE GATED BUILD PLAN (step by step, no jumping)

The order is deliberate: **foundations first, then the spine, then each scenario, then the safety nets.** A step exists only to unlock the next. Each step uses the six-section gate from §0. Steps are sized to be one focused unit of work each.

Dependency chain at a glance:

```
S0 registries ─▶ S1 status bridge ─▶ S2 LoadTrack write ─▶ S3 reconciler
                                                              │
        ┌─────────────────────────────────────────────────────┘
        ▼
S4 publish gate ─▶ S5 vehicle assign+compat ─▶ S6 yard ─▶ S7 swap ─▶ S8 handover
        │                                                                │
        └──────────────────────▶ S9 split ─▶ S10 consolidate ◀──────────┘
                                            │
                 S11 exceptions ─▶ S12 reassign/cancel ─▶ S13 dependency lock
                                            │
                          S14 notifications ─▶ S15 monitoring ─▶ S16 unify run systems
                                            ▼
                                      "then job" — load delivered, ledger closed, job completed
```

---

## STEP 0 — Status & custody registries (single source of truth)  ✅ DONE (gates green 2026-06-07)

**Purpose:** put every status and custody string in one file each, so no later step invents a magic string. Foundation for the whole model (A3–A5).

1. **Investigate first.** Read `api/src/sync/sync.constants.ts` (job + event vocab), `api/src/sync/runStatuses.ts` (run statuses, transition table currently unexported), `DATA_DICTIONARY.md` (canonical names). Decide:
   - *Keep:* `EVENT_DEFINITIONS` structure, `RUN_STATUSES`, idempotency contract.
   - *Change:* the `JobStatus` union (align to A3), the implicit "driver sets job status" assumption.
   - *Delete:* nothing yet — only after S1 proves the new path. No deletions in S0.
2. **Entry criteria:** audit reviewed; this plan approved.
3. **Build:** `jobStatuses.ts` (A3 list), `executionStates.ts` (A4 list), `custodyLocations.ts` + `transactionTypes.ts` (A5 lists). No behaviour change — these are just the vocab, imported nowhere yet except types. Add each new name to `DATA_DICTIONARY.md` in the same change (CLAUDE.md law).
4. **Exit criteria:** four registry files exist; `check:vocab` knows them; nothing imports them in a way that changes runtime behaviour.
5. **Verify:** typecheck ✅, vocab ✅, tests unchanged ✅, knip no new unused (registries referenced by their own type exports).
6. **Cannot proceed until:** the four registries are the *only* place these strings are defined and `DATA_DICTIONARY.md` lists them.

## STEP 1 — Bridge the lifecycle (fixes the 🔴 blocker)  ✅ DONE (gates green 2026-06-07)

**Purpose:** make a planned job startable by the driver, by separating dimension 1 (job status) from dimension 2 (execution state). After this step the end-to-end chain physically connects for the first time.

1. **Investigate first.** Read `api/src/sync/applyJobEvent.ts`, `api/src/sync/sync.service.ts`, `routes/sync.ts`, mobile `/sync/events` caller, `routes/jobs.ts:/jobs/my`. Decide:
   - *Keep:* idempotency, GPS/timestamp validation, `clientEventId` requirement, the event-receipt pipeline.
   - *Change:* `applyJobEvent` must stop writing `Job.status` and instead advance the **RunAssignment** execution state (A4); it must accept events on a `planned`/`in_planning` job.
   - *Delete:* the `allowedFromStatuses` coupling to `Job.status` (replace with execution-state transitions).
2. **Entry criteria:** S0 green (executionStates registry exists).
3. **Build:** rewrite the event state machine to transition `RunAssignment.status` over A4; `applyJobEvent` resolves the event's run/assignment from `runAssignmentId` (already on `JobExecutionEvent`); leave `Job.status` untouched here (the reconciler in S3 will derive it). Add a temporary shim so existing single-stop tests still describe valid transitions.
4. **Exit criteria:** a job in `planned` receives `started` → success; the assignment moves `not_started → en_route_pickup`; `Job.status` is unchanged by the event. The blocker scenario from the audit now passes an end-to-end test.
5. **Verify:** new test "planned job accepts full driver event chain"; existing `applyJobEvent.test.ts` updated; typecheck/vocab/tests ✅.
6. **Cannot proceed until:** the full event chain `started→arrived_pickup→collected→arrived_dropoff→delivered` runs green against a *planned* job in tests.

## STEP 2 — LoadTrack write path (fixes 🟠 #5)  ✅ DONE (gates green 2026-06-07)

**Purpose:** start recording custody. After this, "where is the load" is answerable. This is the precondition for every Part B scenario beyond B1.

1. **Investigate first.** Read `schema.prisma` `LoadTrack`, `services/runService.ts` (cancel preserves LoadTrack), `services/plannerWorkService.ts` (already *reads* LoadTrack). Decide:
   - *Keep:* the model (append-only, soft-delete), the read logic in plannerWorkService.
   - *Change:* nothing in the model — it already has every field needed.
   - *Delete:* nothing.
2. **Entry criteria:** S1 green (events advance assignment state).
3. **Build:** in `applyJobEvent`, for `collected` and `delivered` events, append a `LoadTrack` row with the correct `transactionType` + custody transition (A5), referencing the causing `eventId`, with quantity/driver/trailer/gps. One helper `appendLoadTrack(tx, {...})`. Enforce invariant 5 (every row has an event) and invariant 1 (read latest custody before writing).
4. **Exit criteria:** completing B1 in a test produces exactly two `LoadTrack` rows (`collect` origin→vehicle, `deliver` vehicle→customer_dest); the chain satisfies invariant 3 (no deliver without prior collect).
5. **Verify:** custody-ledger test asserting row count, custody transitions, conservation; typecheck/vocab/tests ✅.
6. **Cannot proceed until:** B1's custody ledger is correct and append-only (no updates/deletes) in tests.

## STEP 3 — Reconciler (derives Job.status; fixes 🟠 #4 and P0.14)  ✅ DONE (gates green 2026-06-07)

**Purpose:** roll execution + custody up into `Job.status` and `Run.status` so the office sees real progress. Makes dimension 1 honest without letting drivers touch it.

1. **Investigate first.** Read `lib/jobUtils.ts` (already advances `in_planning`/`planned`), `routes/runs.ts` recalc, STATUS 1.12. Decide: *keep* the planning-tier advances; *change* by adding the execution-tier rollup; *delete* any ad-hoc job-status writes that the reconciler now owns.
2. **Entry criteria:** S2 green (custody is being written).
3. **Build:** `lib/reconcileLoadState.ts` (A6). Call it at the end of every successful execution event and from a nightly sweep. It writes derived `Job.status` (in_execution → completed, attention_needed) and `Run.status`/`actualStartTime`/`actualEndTime`/`RunAssignment.status` rollups. Only writer of derived statuses.
4. **Exit criteria:** finishing B1 sets `Job.status = completed` and `Run.status = completed` automatically; a half-done job shows `partially_collected`; an exception shows `attention_needed`.
5. **Verify:** reconciler unit tests for each rollup branch; idempotent (running twice = same result); typecheck/vocab/tests ✅.
6. **Cannot proceed until:** "then job" works — a delivered B1 reconciles to `completed` with no manual step.

> **Milestone after S3:** the audit's whole chain (request → job → run → assign → execute → done) functions for the simple direct case. Everything below adds the other paths and the safety nets.

## STEP 4 — Publish gate is real (fixes 🟠 #1)  ✅ DONE (gates green 2026-06-07)

1. **Investigate first.** Read `routes/jobs.ts:/jobs/my`, `routes/runs.ts` publish, planning publish, `publishedToDriver` usages. *Keep* publish endpoints; *change* `/jobs/my` to filter `run.publishedToDriver = true` (invariant 6); *delete* nothing.
2. **Entry criteria:** S3 green.
3. **Build:** add `publishedToDriver: true` (and not-cancelled run) to the `/jobs/my` query and any mobile job feed. Recall (`publishedToDriver:false`) now genuinely hides the run.
4. **Exit criteria:** a driver assigned to a *draft* run sees nothing; after publish, sees it; after recall, it disappears.
5. **Verify:** test asserting visibility flips with publish/recall; incognito mobile smoke if applicable; gates ✅.
6. **Cannot proceed until:** publish/recall observably controls driver visibility.

## STEP 5 — Vehicle assignment + real compatibility (fixes 🟠 #2, #3)  ✅ DONE (gates green 2026-06-07; full DB suite re-run recommended)

1. **Investigate first.** Read `routes/runs.ts` PATCH (accepts truck/trailer, validates only driver) + publish compat gate (reads flags never computed) + `recalculateDerivedRequirements`; web `RunDetailPage`, planning `RunCard`, `AssignDrawer`, `dashboardUtils`, `lib/vehicleCompat.ts`. Decide: *keep* `recalculateDerivedRequirements`, `vehicleCompat` rules; *change* PATCH to validate truck/trailer ownership+availability and to **compute** `trailerCompatible`/`vehicleCompatible`; *delete* the dead job-centric `assignedTrailer`-by-string path in the dashboard drawer if it's not the chosen surface (audit 🟡 #7).
2. **Entry criteria:** S4 green.
3. **Build:** truck/trailer picker UI on the run card; PATCH validates the FK belongs to company + isn't double-booked; compatibility computed from `requiredTrailerType`/weight/ADR/temp vs the assigned vehicle (so the publish gate stops being a no-op); override path keeps the existing reason+audit.
4. **Exit criteria:** assigning a fridge load to a flatbed sets `trailerCompatible=false` and **blocks** publish (unless overridden with reason); picker writes real FKs.
5. **Verify:** compatibility test matrix (temp/ADR/weight); gates ✅.
6. **Cannot proceed until:** publish reflects a *computed* compatibility result, not the default.

## STEP 6 — Yard / depot buffer (unlocks B2)

1. **Investigate first.** Read `RunWaypoint` (`yard_pickup`/`hub_drop` exist), planning waypoint endpoints, `plannerWorkService` custody reads. *Keep* waypoint model; *change* to add `drop_at_yard`/`pick_from_yard` events + custody; *delete* nothing.
2. **Entry criteria:** S3 green (reconciler) + S2 (custody).
3. **Build:** two new execution events writing `vehicle→yard` and `yard→vehicle` custody rows (A5); a `yard:` custody location with location id/label; the dependency check stub (full enforcement in S13).
4. **Exit criteria:** B2 runs end-to-end in a test: collect → drop_at_yard → (run 2) pick_from_yard → deliver, with four correct ledger rows and a job that reconciles to `completed`.
5. **Verify:** B2 scenario test; invariant 1/3 hold across the buffer; gates ✅.
6. **Cannot proceed until:** a load can rest in a yard and be picked by a second run without violating single-custody.

## STEP 7 — Trailer swap (unlocks B4)

1. **Investigate first.** Read run trailer fields, swap-related STATUS items, `vehicleCompat`. *Keep* trailer FKs; *change* to allow mid-run trailer change + `trailer_swap` custody row; *delete* nothing.
2. **Entry criteria:** S6 green.
3. **Build:** `trailer_swap` event (`on_vehicle:X → yard:loc` for the dropped load; run continues on trailer Y); the dropped trailer's load becomes available (links to S6 yard).
4. **Exit criteria:** B4 test: load on trailer X dropped, run continues on Y, X's load pickable by another run; ledger consistent.
5. **Verify:** B4 test; gates ✅.
6. **Cannot proceed until:** a swap never strands a load (every swap writes its custody row).

## STEP 8 — Driver handover A→B (unlocks B3, and B9 rescue)

1. **Investigate first.** Read existing relay/handover stubs in STATUS, run dependency fields. *Keep* `dependsOnRunId`; *change* to add offer/accept events; *delete* nothing.
2. **Entry criteria:** S6 green.
3. **Build:** `handover_offered` (driver A) + `handover_accepted` (driver B) → one `handover` custody row authored at accept, both driver IDs captured (invariant 5/1); B's run `dependsOnRunId = A's run`.
4. **Exit criteria:** B3 test: A collects, offers; B accepts, delivers; exactly one handover row; B cannot accept before A offers.
5. **Verify:** B3 test incl. the "accept-before-offer is blocked" case; gates ✅.
6. **Cannot proceed until:** custody passes between drivers with no double-count and no orphan.

## STEP 9 — Split load (unlocks B5)

1. **Investigate first.** Read `RunAssignment.quantityAssigned/unit`, STATUS 1.9 (split UI not built), conservation needs. *Keep* per-assignment quantity fields; *change* to add a `split` ledger row + balance check; *delete* nothing.
2. **Entry criteria:** S3 green.
3. **Build:** planner split UI (assign quantity per run); `split` custody row dividing parent into children (invariant 2 conservation enforced); each child rides a normal run.
4. **Exit criteria:** B5 test: 26 → 14 + 12, both delivered, job `completed`; a non-summing split is rejected.
5. **Verify:** conservation test (sum of children = parent); gates ✅.
6. **Cannot proceed until:** quantities are conserved across every split.

## STEP 10 — Consolidation (unlocks B6)

1. **Investigate first.** Read run multi-assignment support (already exists), run-level weight/compat. *Keep* multi-assignment runs; *change* to add combined-load compatibility (sum weight, mixed-goods rules) and route-order delivery confirm; *delete* nothing.
2. **Entry criteria:** S5 green (run-level compatibility).
3. **Build:** combined-load checks (weight vs payload, ADR+food incompatibility), per-stop "deliver the right part" confirm.
4. **Exit criteria:** B6 test: three parts on one run, each delivered at its own stop, run reconciles to completed; an over-weight consolidation blocks publish.
5. **Verify:** B6 test + mixed-goods reject test; gates ✅.
6. **Cannot proceed until:** a consolidated run validates combined load, not just per-part.

## STEP 11 — Exceptions (unlocks B8, B9, B11, B12, B13)

1. **Investigate first.** Read `needsReview` plumbing, STATUS "Load movement & execution" backlog, GPS-on-event. *Keep* `needsReview`, GPS capture; *change* to add the exception events; *delete* nothing.
2. **Entry criteria:** S8 green (handover available for rescue routing).
3. **Build:** events `delay_reported`, `breakdown`, `delivery_refused` (`refuse_return` custody), `damage_reported`/`damage_writeoff`, partial quantity on collect/deliver. Each sets assignment → `exception` and reconciles job → `attention_needed`; partials enforce conservation (B11/B12).
4. **Exit criteria:** each of B8/B9/B11/B12/B13 has a passing scenario test; conservation holds for partials and refusals.
5. **Verify:** five scenario tests; gates ✅.
6. **Cannot proceed until:** every exception leaves the ledger conservation-valid and surfaces `attention_needed`.

## STEP 12 — Reassignment & cancel-with-custody (unlocks B10, B14)

1. **Investigate first.** Read `cancelRun` service (preserves LoadTrack — keep), publish/recall. *Keep* cancelRun's ledger preservation; *change* to add pre-start reassignment reset + cancel-disposition; *delete* nothing.
2. **Entry criteria:** S11 green.
3. **Build:** reassign a run to a new driver resetting assignment execution to `not_started` (with audit) when no custody exists (B10); cancel-mid-flight forces a custody disposition choice before `cancelled` (B14, honouring "stop and ask").
4. **Exit criteria:** B10 (no-custody reassign) and B14 (cancel with load in custody requires disposition) both pass.
5. **Verify:** B10/B14 tests; gates ✅.
6. **Cannot proceed until:** no reassignment or cancel can strand a load.

## STEP 13 — Dependency lock enforcement (fixes 🟠 #8)

1. **Investigate first.** Read `dependsOnRunId` (stored, badged, not enforced — STATUS 1.8). *Keep* the field + badge; *change* publish/start to enforce; *delete* nothing.
2. **Entry criteria:** S6 + S8 green (yard + handover are the feeders).
3. **Build:** block publish/`pick_from_yard`/`handover_accepted` on a dependent leg until the feeding leg has the matching custody row (invariant 8).
4. **Exit criteria:** a relay leg-2 cannot be picked/published before leg-1's drop/handover exists; test proves the block and the unblock.
5. **Verify:** dependency-lock test; gates ✅.
6. **Cannot proceed until:** relay timing cannot be violated.

## STEP 14 — Notifications (fixes 🟠 #9)

1. **Investigate first.** Confirm there is no push infra today (audit). *Keep* nothing (greenfield); *change* nothing; *delete* nothing.
2. **Entry criteria:** S4 green (publish meaningful) + S11 (exceptions exist to notify about).
3. **Build:** device-token registration + send path; notify driver on publish/modify/recall; notify planner on `delay_reported`/`breakdown`/`delivery_refused`/no-show.
4. **Exit criteria:** publishing a run triggers a driver notification; an exception triggers a planner notification (assert the send call in a test/mock).
5. **Verify:** notification dispatch test (mocked transport); gates ✅.
6. **Cannot proceed until:** the live-day signals (publish + exceptions) actually dispatch.

## STEP 15 — Monitoring & reconciliation surface (P0.13, live board)

1. **Investigate first.** Read `needsReview` rows (written, never surfaced — P0.13), dashboard, planning board. *Keep* both boards; *change* to add a needs-review queue + live run/custody view; *delete* nothing.
2. **Entry criteria:** S3 + S11 green.
3. **Build:** `GET /needs-review` + planner page; a live run board reading reconciled `Run.status` + latest custody per part (GPS optional later).
4. **Exit criteria:** a `needsReview`/`attention_needed` item appears in a planner queue and can be actioned; the board shows real progress.
5. **Verify:** queue test; gates ✅.
6. **Cannot proceed until:** no exception is invisible to the planner.

## STEP 16 — Unify the two run systems (fixes 🟡 #6, #7)

1. **Investigate first.** Read `/runs/*` (runs.ts) vs `/planning/runs/*` (planning.ts) — duplicated run+assignment logic; the dashboard job-centric drawer. Decide which surface is canonical, keep it, **delete** the duplicate, migrate callers.
2. **Entry criteria:** S1–S15 green (so behaviour is settled before consolidating).
3. **Build:** one run/assignment service; delete the duplicate route family and the dead job-centric assignment model; point all web surfaces at the survivor.
4. **Exit criteria:** one code path creates/assigns/publishes runs; grep shows no second implementation; all web surfaces work against it.
5. **Verify:** full regression of B1–B14; knip shows the deleted files gone; gates ✅.
6. **Cannot proceed until:** there is exactly one run system and the scenario suite still passes — **then the job is done.**

---

# PART D — CAN WE DO IT? (feasibility)

**Yes — and most of the hard parts already exist.** This is not a rewrite. It is connecting and finishing pieces that are already in the schema and codebase. The honest summary:

**What's already built and we keep (the reason this is feasible):**

- `LoadTrack` model — the entire custody ledger is defined, append-only, with every field the scenarios need (quantity, from/to custody, driver, trailer, run, event link, GPS). It is just never written. Steps 2/6/7/8 fill that in.
- `JobExecutionEvent` — already carries `runId`, `runAssignmentId`, `jobPartId`, `quantityConfirmed`, `fromCustody`, `toCustody`, GPS, idempotent `clientEventId`. The plumbing for custody is there.
- `Run` / `RunAssignment` / `RunWaypoint` — runs, multi-part assignments, dependency links (`dependsOnRunId`), and yard/hub/overnight waypoints already exist. Relay, consolidation, and multi-day are modellable today.
- The offline-first mobile sync pipeline, GPS/timestamp validation, tenant scoping, and the cleanup-phase discipline (single registries, shared services) are solid and stay.
- The planning board, intake forms (CJP/PRF), review pipeline, and fleet CRUD are done.

**What's genuinely new work (not large):**

- The reconciler (`reconcileLoadState`) — one function, well-specified in A6.
- The custody write helper (`appendLoadTrack`) — one helper.
- The exception + swap + handover + yard events — additive events over the existing pipeline.
- Notifications — the one greenfield subsystem (Step 14).

**The single highest-value change** is Step 1 (status bridge). It is small but it is the keystone: until dimensions 1 and 2 are separated, nothing the driver does succeeds, so nothing else can be tested end-to-end. Everything else is sequenced behind it.

**Risks and how the plan handles them:**

- *Risk: scope creep / task-jumping.* Handled by the gate format — a step is done only when its own exit criteria pass; out-of-scope discoveries are parked, not done.
- *Risk: custody bugs that lose loads.* Handled by the ten invariants in A8, each turned into a test in the relevant step. Single-custody + conservation are checked on every scenario.
- *Risk: two run systems drift further.* Deliberately deferred to Step 16 so we don't consolidate a moving target, but listed so it isn't forgotten.
- *Risk: the reconciler fighting planner edits.* Handled by making the reconciler the *only* writer of derived statuses and never overwriting `cancelled` or moving backwards.

**Definition of "done" for the whole programme:** every scenario B1–B14 has a green end-to-end test; a load registered in the system can be tracked through any legal path to delivery; the ledger is conservation-valid at every step; the planner sees real progress and every exception; and there is exactly one run system. At that point a planner can run a full day on it.

---

## Build order summary (one line each)

| Step | Unlocks | Fixes |
|---|---|---|
| S0 Registries | foundation | groundwork |
| S1 Status bridge | end-to-end chain connects | 🔴 blocker |
| S2 LoadTrack write | custody recorded | 🟠 #5 |
| S3 Reconciler | job/run status derived | 🟠 #4, P0.14 |
| S4 Publish gate | driver sees only published | 🟠 #1 |
| S5 Vehicle + compat | real vehicle assignment & checks | 🟠 #2, #3 |
| S6 Yard buffer | B2 relay-via-depot | Phase 2 |
| S7 Trailer swap | B4 | new |
| S8 Handover | B3, B9 rescue | new |
| S9 Split | B5 | 1.9 |
| S10 Consolidation | B6 | new |
| S11 Exceptions | B8/B9/B11/B12/B13 | backlog |
| S12 Reassign/cancel | B10/B14 | new |
| S13 Dependency lock | relay timing safe | 🟠 #8 |
| S14 Notifications | live-day signals | 🟠 #9 |
| S15 Monitoring | nothing invisible | P0.13 |
| S16 Unify run systems | one code path → **then job** | 🟡 #6, #7 |

> Next action when you're ready to build: start **Step 0**, following its "Investigate first" gate. Do not touch Step 1 code until Step 0's exit criteria are green.

---

# PART E — THREE-SCREEN DELIVERY RE-PLAN (2026-06-07)

> **Re-organisation, not a reset.** Steps 0–6 are built and stay as-is (foundation: status bridge, custody, reconciler, publish gate, compatibility, yard relay). The *remaining* work (old S7–S16) is now delivered **screen-by-screen, vertical slices** — one complete, usable planner screen at a time, in the order **Planning → Runs → Live**. This matches the planner's real workflow and the natural dependency order (no assets without runs; no firefighting without assets).
>
> Same gate discipline as before: each sub-step opens with an **investigate-first** pass (keep good / change wrong / delete bad), builds only its slice, and must pass its exit gate (typecheck · check:vocab · api tests · knip) before the next.

## The three screens

| Screen | Single responsibility | Definitely NOT here |
|---|---|---|
| **1. Planning** | Turn accepted jobs into runs — which stops on which run, sequence, clustering, relays, splits, consolidation. Runs are "skeletons" (stops + requirements), no vehicles yet. | Truck/trailer/driver allocation (→ Runs). Live firefighting (→ Live). |
| **2. Runs** | Asset allocation — assign trucks, trailers, drivers to the runs built in Planning; compatibility; publish; set up swaps/handovers. | Building runs from jobs (→ Planning). Real-time exception handling (→ Live). |
| **3. Live management** | Real-time firefighting — live run status + custody location, swaps, cancellations, reassignments, delays, breakdowns, refusals, notifications, late-run alerts. Everything to deliver on time. | Initial planning / allocation (→ Planning, Runs). |

## Current frontend reality (what we're re-organising)

- `PlanningBoardPage` (2,260 lines) is a monolith doing **Planning AND Runs** mashed together (jobs→runs + asset pickers + publish + waypoints + AI checks).
- `RunsPage` + `RunDetailPage` are a thinner parallel surface on the *second* run system.
- `DashboardPage` is a summary only — **no Live screen exists**.
- Two run systems (`/runs` + `/planning/runs`) still coexist (old S16). Consolidation now happens **inside** the screen work rather than as a final step: Planning + Runs are built on **one** run system.

## PHASE A — PLANNING SCREEN (jobs → runs)

Backend slices: **S9 Split load**, **S10 Consolidation** (S6 relay already done; S13 dependency *display* only here).
Frontend: refactor `PlanningBoardPage` into a focused Planning screen — unplanned-jobs panel, run lanes (add/remove stops, sequence, waypoints, relay/split/consolidation). **Move the truck/trailer/driver pickers out** (they belong to the Runs screen). Runs appear as skeletons with derived requirements but no vehicle.
Exit: a planner can build every run shape from jobs — direct, relay, split, consolidation — on one uncluttered screen, on one run system.

### Planning screen — design spec (user brief, 2026-06-07)

**One question only:** "What is the best way to move this freight?" If a feature doesn't help answer that, it belongs elsewhere (Runs / Live). The screen is calm and strategic — no fire, no late drivers, no broken trailers. The planner has time to experiment, merge, split until the best plan is found. **Not** driver/trailer/vehicle management, **not** dispatch, **not** live ops.

**The reframe — plan freight movement, not jobs.** The customer job stays one job; the engine may split/combine/transform it into operational movements (e.g. Collect Manchester → Hub; Hub → Birmingham / Leeds / Newcastle). The model already supports this: a `RunAssignment` links a **stop (JobPart)**, not a whole job — so the left panel shows *movable freight units / legs*, not job cards.

**The three questions the screen must answer:**
1. *What can travel together?* — trailer type, temp, ADR, service, capacity. Surface S5 `checkLoadVehicle` compatibility live as stops are grouped (✓/✗ instantly).
2. *Does the direction make sense?* — corridor / region / freight lane / distance band; low detour; reduced empty miles. Build on existing haversine clusters + postcode-district grouping; add a detour / empty-miles indicator per proposed run.
3. *Can it realistically be done on time?* — collection/delivery windows, drive time, load/unload time, **mandatory contingency buffer**. Extend `/ai/check-run` from binary feasibility → a **confidence score** that never assumes perfect conditions.

**Proposal-first UX — never a blank page.** Promote the existing rule-based capabilities (clustering, `suggest-vehicle`, `suggest all runs`, `check-run`) into continuous suggestions: best movement strategy (direct / multi-drop / groupage / hub / yard / relay / multi-day / backload), best grouping, best run candidates, best consolidation. The planner is a **decision-maker**, not a manual run builder. **Caution:** keep the manual board fully usable underneath — the engine *suggests*, the planner can always override. Never gate manual planning behind the engine.

**Learning engine — capture now, recommend later (staged).** The "Customer B is usually 90 min late / Site C dwell 2 h" intelligence is an analytics layer that is premature to build before there is operational history. But the signals are derivable **today** for free: site dwell = `arrived_pickup → collected` timestamps; punctuality = planned window vs `actualStartTime`/`actualEndTime` (S3). **Phase-A scope: start persisting these derived metrics per customer/site so history accumulates; build the recommender in a later phase once the dataset exists.** Do not build the ML recommender now.

**Staging within Phase A (each a shippable slice):**
- A1 — refactor PlanningBoard → focused Planning screen on one run system; horizontal nav; remove asset pickers; left panel = freight units/legs. **✅ DONE 2026-06-07** (Mac incognito smoke pending). Nav grouped by operations: Planning/Runs/Live primary + Freight/Resources groups + account menu.
- A2 — the three questions as first-class: live compatibility grouping (Q1), detour/empty-miles indicator (Q2), confidence-scored feasibility + buffer (Q3). **✅ DONE 2026-06-07** (13 backend unit tests; four advisory run-lane signals, no "AI" copy; Mac smoke pending).
- A3 — proposal-first: strengthen "suggest all runs" into strategy proposals (direct/multi-drop/groupage/hub/relay…) with one-click accept + easy override.
- A4 — split (old S9) + consolidation (old S10) as planner actions on freight units.
- A5 (capture-only) — persist customer-punctuality / site-dwell metrics for the future learning engine.

**Success metrics:** ↑ trailer/vehicle/driver utilisation, on-time probability, consolidation, empty-mile reduction; ↓ number of runs, total mileage, operational risk, planning effort.

**Navigation:** switch the sidebar from vertical to **horizontal** to reclaim board width. ~10 nav items will crowd a flat bar — group them, with **Planning / Runs / Live** as the primary tabs reinforcing the three-screen model and the rest tucked under a menu.

## PHASE B — RUNS SCREEN (asset allocation)

Backend slices: **S7 Trailer swap**, **S8 Driver handover** (S5 compatibility + FK validation already done).
Frontend: build the Runs screen as the canonical asset-allocation surface — runs needing assets, truck/trailer/driver pickers, live compatibility (✓/✗ + block on publish), publish/recall, swap/handover setup. Retire the duplicated pickers + the legacy job-centric `AssignDrawer`.
Exit: a planner allocates assets and publishes from one screen; compatibility is enforced; trailer swaps and driver handovers can be set up.

## PHASE C — LIVE MANAGEMENT SCREEN (firefighting)

Backend slices: **S11 Exceptions** (delay, breakdown, refusal, damage, partial), **S12 Reassign/cancel-with-custody**, **S13 Dependency-lock enforcement**, **S14 Notifications**, **S15 Monitoring / needs-review** (+ audit "Phase 3 — live status, GPS, late-run, no-show").
Frontend: build the Live screen — live run board (reconciled status + latest custody location), exception alerts, real-time swap/cancel/reassign controls, delay/breakdown/refusal handling, notifications feed, needs-review queue.
Exit: a planner can monitor and firefight in real time to keep loads on time.

## Old step → screen map

| Old step | Now delivered in | Status |
|---|---|---|
| S0–S5 (foundation) | underpins all screens | ✅ done |
| S6 Yard/relay | Planning | ✅ done (gate pending) |
| S9 Split, S10 Consolidation | **Phase A — Planning** | next |
| S7 Trailer swap, S8 Handover | **Phase B — Runs** | after A |
| S11 Exceptions, S12 Reassign/cancel, S13 Dependency, S14 Notifications, S15 Monitoring | **Phase C — Live** | after B |
| S16 Unify run systems | folded into Phase A + B | in-phase |

> Next action: confirm Step 6's Mac gate, then start **Phase A** with an investigate-first pass on the Planning screen (how the PlanningBoard monolith splits, what split/consolidation need).



