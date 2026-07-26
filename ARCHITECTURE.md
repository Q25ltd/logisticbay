# LogisticBay — Technical Architecture

> The five core objects, their fields, how they relate, status flows, splitting logic, warning rules,
> and frontend structure rules. This is the technical design — not a build-status tracker.
> For current build status see STATUS.md. For field names see DATA_DICTIONARY.md.
> Last updated: 2026-07-15

---

## ⚠ Design vs implementation gaps

This document describes the target design. Where the actual `schema.prisma` differs, the schema wins.
Known gaps:

| This doc says | Reality today |
|---|---|
| `branchId` on Job / Run | No Branch model in schema. Do NOT add `branchId` to queries. |
| `executionDate` on Job | Removed concept — the date derives from the first collection stop's `timeWindowStart` (no Job-level date column) |
| `totalQuantityRequired` on Job | Schema uses `quantity` |
| `materialType` on Job | Schema uses `goodsType` + `goodsDescription` |
| `serviceType` values: standard/express/timed | Schema uses `multi_drop`, `collection`, `delivery` |
| Job statuses: planned / partially_collected / partially_delivered / attention_needed | Implemented — `loadVocab.ts` `JOB_PLANNING_STATUSES` (reconciler derives the execution-side statuses); only the automatic `planned` transition (all stops assigned) is deferred |
| Run statuses: at_collection / loading / in_transit / at_delivery / failed | Not yet implemented |
| `job_creator` role | Not enforced in routes |

---

## The five core objects

```
Company
  └── [Branch — Phase 2, not yet built]
        ├── Job                        ← the customer promise
        │     └── JobPart[]           ← physical pieces of work
        └── Run
              └── RunAssignment[]     ← JobPart linked to Run with qty + sequence

LoadTrack                             ← ledger: every time load changes hands
JobExecutionEvent                     ← immutable record of what actually happened
```

**Key rule: Run does NOT belong to a Job. RunAssignment is the bridge.**
One Run can contain JobParts from multiple different Jobs.

---

## 1. Job — the customer promise

Holds the full requirement. Never split — only its JobParts are split.

| Field | Type | Notes |
|---|---|---|
| id | Int PK | auto |
| companyId | Int | tenant isolation — always required |
| jobReference | String | system-generated `LGB-26-000001` |
| status | String | see status flow below — derived from parts/events |
| customerId | Int? | link to Customer if known |
| customerName | String | always stored even if customerId exists (history) |
| customerRef | String? | customer's own order/reference |
| priority | String | `low`, `normal`, `high`, `urgent` |
| quantity | Decimal? | total quantity |
| quantityUnit | String? | pallets, boxes, kg, litres, etc. |
| goodsType | String? | type of goods (pallets, bulk, machinery, etc.) |
| goodsDescription | String? | description |
| weight | Decimal? | kg |
| hazardClass | String? | ADR class |
| tempControlled | Boolean | default false |
| tempRange | String? | e.g. `2–8°C` |
| requirePOD | Boolean | default false |
| plannerNotes | String? | internal — not shown to driver |
| internalNotes | String? | planner-only notes |
| driverVisibleNotes | String? | notes driver will see |
| vehicleCategory | String? | what vehicle type is needed |
| bodyTypes | Json? | compatible body/trailer types |
| overrideClosed | Boolean | false = closed naturally, true = planner confirmed shortfall |
| overrideReason | String? | only when overrideClosed=true |
| overrideNotes | String? | planner explanation |
| overrideQuantityDelivered | Decimal? | actual qty when override-closed |
| overrideQuantityShortfall | Decimal? | difference required vs delivered |
| closedAt | DateTime? | when job reached completed/override_closed |
| closedBy | Int? | who closed it |
| createdByUserId | Int | user who created |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Job status regimes

**Decision (TASK 4.2, 2026-06-02):** one column, two documented regimes. No split into separate columns.

`Job.status` carries values from two distinct regimes that share the same column. Understanding which regime sets each value is mandatory before writing any query or transition check.

#### Planning regime
Set by `syncJobPlanningStatuses()` based on whether stops are assigned to active runs.
Never set by driver events.

| Status | Meaning | Set by |
|---|---|---|
| `pending_review` | Submitted via public request form; awaiting planner decision | Route handler on PRF submit |
| `ready_to_plan` | Accepted/created; no stop currently in an active run | `syncJobPlanningStatuses()` or planner accept |
| `in_planning` | At least one stop assigned to a draft/assigned run | `syncJobPlanningStatuses()` |

#### Execution regime (Step 1 + Step 3, 2026-06-07)
Driver events advance **`RunAssignment.status`** over `EXECUTION_STATES`
(loadVocab.ts) — they never write `Job.status` directly. The reconciler
(`reconcileLoadState`) then DERIVES the job-level execution statuses from
assignment states + custody, at the end of `applyJobEvent` (same tx) and
nightly.

| Status | Meaning | Set by |
|---|---|---|
| `in_execution` | At least one part's execution has begun | reconciler (derived) |
| `partially_collected` | Some but not all parts collected | reconciler (derived) |
| `collected` | All parts collected, none delivered | reconciler (derived) |
| `partially_delivered` | Some but not all parts delivered | reconciler (derived) |
| `completed` | All parts delivered, ledger closed | reconciler (derived) |
| `attention_needed` | An exception is open | reconciler (derived) |
| `cancelled` | Rejected or cancelled | Planner override endpoint only |

#### Terminal / intake statuses

| Status | Meaning | Set by |
|---|---|---|
| `draft` | Created but not yet in review or planning | `jobService.createJob` |
| `cancelled` | Also covers planner reject from `pending_review` | Planner override or direct write |

#### Regime boundary rule
A job never goes backwards across the boundary. Once in the execution regime (`in_progress` or beyond), `syncJobPlanningStatuses()` ignores it — it only touches jobs still in the planning tier (`ready_to_plan`, `in_planning`).

```
PLANNING TIER (planner-set)          EXECUTION TIER (reconciler-derived)
draft
pending_review
ready_to_plan ──► in_planning ──► planned ──► in_execution ──► partially_collected
                                                    │                  │
                                              attention_needed    collected ──► partially_delivered ──► completed
(cancelled can occur from any planning-tier status)
```

(Driver events run the per-stop machine `EXECUTION_STATES` on RunAssignment —
`not_started → en_route_pickup → at_pickup → loaded → en_route_dropoff →
at_dropoff → delivered` (+ `exception`) — and the reconciler rolls those up to Job.status.)

#### Status vocabulary source

The full vocabulary (planner-set + reconciler-derived) is the registry
`JOB_PLANNING_STATUSES` in `api/src/constants/loadVocab.ts` — the derived
execution statuses above went live with the Step 3 reconciler (2026-06-07).
Only the automatic `planned` transition (set when every stop is assigned,
D3.2) is still deferred — see STATUS.md.

---

## 2. JobPart — physical piece of work

One stop in the physical execution. Types: `collection`, `delivery`, `move_to_depot`, `reload`, `transfer`, `return`.

| Field | Type | Notes |
|---|---|---|
| id | Int PK | |
| jobId | Int | parent job |
| companyId | Int | tenant isolation |
| sequenceNumber | Int | order within job |
| type | String | collection / delivery / move_to_depot / reload / transfer / return |
| status | String | see below |
| siteName | String | site/company name |
| street | String | |
| town | String | |
| postcode | String | |
| country | String | default GB |
| lat | Float? | real truck entrance — not building centre |
| lng | Float? | |
| navigationInstructions | String? | how to reach the entrance |
| timeWindowStart | DateTime? | earliest arrival |
| timeWindowEnd | DateTime? | latest arrival |
| contactName | String? | |
| contactPhone | String? | |
| referenceNumber | String? | collection release number or goods-in number |
| bookingRef | String? | site appointment/slot reference |
| quantityRequired | Decimal? | planned quantity for this stop |
| quantityUnit | String? | |
| quantityCollected | Decimal? | updated from LoadTrack |
| quantityDelivered | Decimal? | updated from LoadTrack |
| proofRequirements | Json? | `["signature","photo","pod_number","timestamp"]` — any combination |

### JobPart status flow
```
pending      — not yet started
in_progress  — run has started, this part not done
completed    — all required quantity confirmed
partially_done — some quantity done, remainder outstanding
failed       — could not complete — attention needed
```

---

## 3. Run — execution container

One trailer, one route, one period of work. Planner puts JobParts into Runs.
For the full planning page design, movement strategies, and the Job→Movement→Run layer → see **PLANNING_PAGE_DESIGN.md**.

### Assignment order — trailer first, driver second

```
LOAD  ← what we always track
  └─ in      TRAILER   ← assigned at planning (required before confirming run)
       └─ pulled by UNIT  ← driver phase (future)
            └─ driven by DRIVER ← assigned when confirmed (can be after trailer)
                 └─ on  RUN
```

A run CAN exist in `draft` with a trailer but no driver — that is correct and expected.
Driver is assigned when availability is confirmed. Unit/truck is a later phase entirely.

### Run types
| Type | Description |
|---|---|
| `direct` | Collect A → Deliver B. Same driver/trailer. Never split unless capacity forces it. |
| `relay` | Collect A → depot → Deliver B. Can split between two drivers. Run B locked until Run A confirms depot drop. |
| `split` | Same job, multiple runs for capacity (e.g. 80 pallets across 4 runs). All belong to same Job. |
| `consolidation` | Multi-collection → depot sort → multi-delivery. Delivery runs locked until collection runs complete. |

| Field | Type | Notes |
|---|---|---|
| id | Int PK | |
| companyId | Int | tenant isolation |
| runReference | String | system-generated `RUN-26-000001` |
| runType | String? | direct / relay / split / consolidation — **to be added** |
| dependsOnRunId | Int? | FK Run — locked until that run completes — **to be added** |
| status | String | see below |
| assignedTrailerId | Int? | FK FleetTrailer — **assigned first** |
| assignedDriverId | Int? | FK DriverProfile — assigned when confirmed |
| assignedTruckId | Int? | FK FleetUnit — driver phase |
| plannedDate | DateTime? | |
| estimatedStartTime | String? | |
| estimatedEndTime | String? | |
| actualStartTime | DateTime? | |
| actualEndTime | DateTime? | |
| publishedToDriver | Boolean | default false |
| plannerNotes | String? | |
| endInstruction | String? | drop_trailer_at_base / stay_with_trailer / none |
| returnToBase | Boolean | default false |

### Run status flow
```
draft        ✅  created, driver/vehicle not yet assigned
assigned     ✅  driver and vehicle assigned, not yet started
in_progress  ✅  driver has started the run
completed    ✅  all assignments confirmed
cancelled    ✅  run cancelled
────────────────────────────────────────────────────────────────
at_collection 🔲 driver arrived at collection point (from mobile event)
loading       🔲 driver is loading (from mobile event)
in_transit    🔲 driver travelling (from mobile event)
at_delivery   🔲 driver arrived at delivery (from mobile event)
failed        🔲 run could not complete (planned)
```

### Run validity — four things must fit
1. **Location** — don't send one driver to opposite corners of the country without reason
2. **Time** — collection and delivery windows must make sense
3. **Load availability** — driver must have the load or be able to collect it before delivery
4. **Equipment** — vehicle/trailer must be suitable for the load and site

---

## 4. RunAssignment — bridge between JobPart and Run

| Field | Type | Notes |
|---|---|---|
| id | Int PK | |
| companyId | Int | |
| runId | Int | FK Run |
| jobPartId | Int | FK JobPart |
| jobId | Int | denormalised for fast queries |
| sequenceNumber | Int | order within the run |
| quantityAssigned | Decimal | how much of this stop's qty this run covers |
| quantityUnit | String | |
| status | String | **enum `EXECUTION_STATES`** (loadVocab.ts): `not_started → en_route_pickup → at_pickup → loaded → en_route_dropoff → at_dropoff → delivered` (+ `exception`) — driver-event-only, per A4/Step 1 (2026-06-07). Superseded the old `pending/in_progress/completed/failed/skipped` set named here previously. |
| addedAt | DateTime | |
| addedBy | Int | |
| removedAt | DateTime? | |
| removedBy | Int? | |
| removalReason | String? | |

---

## 5. LoadTrack — custody ledger

Immutable, append-only. Every time load physically changes hands, one row is written.
Total must always equal job requirement — mismatch = automatic warning.

```
Transaction types:
  collected | depot_received | reloaded | transferred |
  delivered | failed_delivery | returned | partially_collected

Custody identifiers:
  site:{jobPartId}      — at a collection/delivery site
  trailer:{trailerId}   — on a specific trailer
  depot:{companyId}     — at a company depot/yard (branchId when Branch model exists)
  driver:{driverId}     — with a specific driver (used for direct transfers)
```

Load quantity ledger — must always balance:
```
Job requires: 52 pallets
├── 26 on Trailer X (Dave, Run 1)   — in transit
├── 14 at depot (waiting for reload) — at depot
├──  8 delivered to Leeds            — delivered
└──  4 unaccounted                   — ⚠ WARNING
     ─────
     52 total
```

**Load possession rule:** A driver cannot deliver a load they do not have. System warns: "This delivery cannot happen unless the load is transferred or reassigned."

**Load rules travel with the load.** If temperature-controlled, every trailer it moves onto must be temperature-controlled.

---

## 6. JobExecutionEvent — what actually happened

Immutable record. Driver reports events — everything else (status, load position, warnings) is derived from events.

| Field | Type | Notes |
|---|---|---|
| id | Int PK | |
| companyId | Int | |
| jobId | Int | |
| runId | Int? | |
| runAssignmentId | Int? | |
| driverId | Int | FK User |
| eventType | String | see types below |
| clientEventId | String | idempotency key — deduplication on sync |
| clientTimestamp | DateTime | when it happened on device |
| serverReceivedAt | DateTime | when server received it |
| lat | Float? | GPS at time of event |
| lng | Float? | |
| quantityConfirmed | Decimal? | for collect/deliver events |
| fromCustody | String? | who had it before |
| toCustody | String? | who has it after |
| notes | String? | driver free text |

### Event types (implemented ✅ + planned 🔲)
```
✅ Implemented (mobile syncs these today):
  started | arrived_pickup | arrived_dropoff | completed | cancelled | note_added

🔲 Planned execution events:
  run_started | run_completed | run_failed
  arrived_collection | loading_started | collected | partially_collected | collection_failed
  arrived_delivery | delivered | partially_delivered | delivery_failed
  arrived_depot | depot_unloaded | depot_loaded
  trailer_swapped | truck_swapped | load_transferred | handover | handover_accepted
  driver_assigned | run_published | status_override
```

---

## Splitting logic

All splits still belong to the same main Job.

**No split** — whole load moves together:
```
Run 1: collect 52 pallets London → deliver 52 pallets Leeds
```

**Partial split** — part moves separately:
```
Run 1: collect 26 pallets London → deliver Leeds
Run 2: collect 26 pallets London → deliver Manchester
```

**Hub-and-spoke** — multiple collections feed one delivery:
```
Run 1: collect Leeds      → bring to depot
Run 2: collect Manchester → bring to depot
Run 3: load all at depot  → deliver Dundee  (depends on Runs 1+2)
```

Run dependencies are explicit — Run 3 cannot start until Runs 1+2 are complete.

---

## Warning system

System warns — does not block everything. Planner can override most warnings. Impossible states require confirmation.

| Warning | Severity |
|---|---|
| Remaining quantity not collected | High |
| Delivery assigned but load not on this run | High — needs confirmation |
| Load on trailer but no delivery planned | High |
| Delivery planned before collection possible | High — needs confirmation |
| Quantities do not balance (ledger mismatch) | High |
| Run route does not make logical sense | Medium |
| Time window at risk | Medium |
| Wrong vehicle/trailer type for load | Medium |
| Driver delayed — next job at risk | Medium |
| Collection completed but delivery not planned | Medium |
| Load at depot but no onward run planned | Medium |

---

## Recovery logic

When something goes wrong:
1. What happened?
2. What is affected?
3. Where is the load right now?
4. What is still possible?
5. What are the next best options?

Recovery never assigns a driver to a load they do not have physical access to. Driver swaps always check load possession first.

---

## Two job creation paths — same object, different entry

```
PRF (customer)                          CJP (planner internal)
──────────────                          ──────────────────────
Customer fills public form              Planner fills identical form
        ↓                                       ↓
Job { status: pending_review }          Job { status: draft | ready_to_plan }
        ↓
Planner reviews → accept/reject
Accept: sets plannedDate + plannerNotes → ready_to_plan
        ↓
Both paths arrive at: Run Planner board
```

The forms are identical in fields. CJP adds `plannedDate`, `plannerNotes`, `saveMode`. That's all.

---

## Four intake gates — the only sources of truth (decided 2026-07-14)

**All data in the system is born at exactly four controlled intake forms. Everything else only manipulates it.**

| # | Gate | What it creates | Validation |
|---|------|-----------------|------------|
| 1 | Public job form (PRF) | Job + JobPart | `CreateJobSchema` (shared with CJP) |
| 2 | Internal job form (CJP) | Job + JobPart | `CreateJobSchema` (shared with PRF) |
| 3 | Driver registration | DriverProfile + User | `CreateDriverSchema` / `PatchDriverSchema` |
| 4 | Unit / trailer registration | FleetUnit / FleetTrailer | `CreateFleetUnitSchema` etc. + taxonomy checks (2026-07-14) |

Rules that follow from this:

1. **No unknown data.** Every intake gate validates its full input (Zod). Nothing enters the
   system that a form did not deliberately capture. Free-text identity fields that bypass a
   registry are violations — they must resolve against, or be flagged against, the registered
   entity (e.g. a shift's `trailerReg` is matched against FleetTrailer: ours → `company`,
   otherwise the driver's `contractor`/`third_party` claim or an `unregistered` flag — see
   `ShiftSegment.trailerOwnership`, 2026-07-14).
2. **Algorithms may only consume form-born data.** Every calculation (readiness, candidates,
   capacity, suitability, proposals) must trace its inputs back to fields these four forms
   actually capture. If a form doesn't capture something, the algorithm reports **unknown** —
   it never assumes, defaults, or fabricates (the readiness service's honest-`unknown` for
   MOT/VOR is the model).
3. **Form changes propagate.** Adding/changing a field on any gate means: PRF/CJP twin rule,
   schema + DB column, DATA_DICTIONARY.md entry, and updating every algorithm that should
   consume it — in the same effort. A form field no algorithm reads, or an algorithm input
   no form writes, is a defect.
4. **Derived data never masquerades as intake data.** Statuses, custody, rollups, ETAs are
   computed from intake data + execution events and must be recomputable from them.

---

## Frontend page structure rules

### Page responsibility
A Page.tsx is a controller layer. It MAY contain: state, data loading, permission checks, loading/error/empty/content states, API calls, routing.
It MUST NOT contain: business calculations, payload transformation, formatting helpers, repeated JSX blocks used elsewhere.

Exception: a large stateful form (like CJP) may stay in one file when state is genuinely shared across sections, all business logic is in utils files, all payload conversion is in a payload file, and no JSX blocks repeat.

### Split rule — ask these questions, not line counts
- Does this file have more than one reason to change? → Split.
- Would a new developer need to read the whole file to understand one part? → Split.
- Could this logic be tested without rendering? → Extract to a utils file.
- Does this JSX block appear more than once? → Extract to a component.
- Does the submit handler do more than call the API? → Extract a payload builder.

Size as signal (not a rule): 400+ lines = check for violations. 800+ lines = almost certainly has them.

### File types and their jobs
| File type | Responsibility |
|---|---|
| Page | Orchestration, data loading, state coordination |
| Component | UI rendering, no business logic, no direct API calls |
| Form | Form state, field validation, submit actions |
| API file | Server communication only, no UI concerns |
| Utils file | Pure functions: calculations, formatting, rules, validators |
| Payload file | form-state → API-body transformation |
| Types file | Local feature/page types and interfaces |
| Constants file | Option arrays, enums, lookup maps, static values |

### API layer rule
API calls belong in `src/api/`. Pages and components call named API functions — never raw HTTP methods.
`driversApi.list()` ✅ — `api.get("/drivers")` scattered across components ✗

### Component placement
Used by one page → keep in that page's folder.
Used by multiple pages → move to `src/components/`.
Move on second use, not in anticipation of it.

### Refactor safety
Never rewrite working files. Move one piece at a time.
After every extraction: run build, confirm zero TypeScript errors, verify UI unchanged.
Never refactor structure and change behaviour in the same commit.

### Things we do not do
- Build UI before data model is agreed
- Create two pages/components that do the same thing
- Name fields without checking DATA_DICTIONARY.md
- Add a field to a form without knowing which DB column it maps to
- Assume a feature is not built — check STATUS.md and actual routes/pages first
