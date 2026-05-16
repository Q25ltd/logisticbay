# LogisticBay — System Plan
> This document is the single source of truth for what the system is, how it works, and what needs to be built.
> Read this before starting any new feature. Update it when anything changes.
> Last updated: 2026-05-16

---

## Why this document exists

We built parts of the system without a structured plan. The result was:
- Duplicate UI (JobDetailPage and JobDetailDrawer doing the same thing)
- Wrong architecture (PlannedJob doing the job of both Job and Run)
- Disconnected pages that don't hand off to each other
- No clear flow from customer request to job complete

This document prevents that from happening again. Before adding anything new, check here first:
- Does this concept already exist under a different name?
- Where does it fit in the flow?
- What does it depend on? What depends on it?

---

## Critical data model rule — Run is independent, not a child of Job

A Run is NOT owned by a Job. A Run is its own entity.
Job Parts are assigned to Runs. One Run can hold Job Parts from multiple different Jobs.

```
Job A parts ──┐
Job B parts ──┼──► Run 1 (Driver Dave, Truck A, Trailer X)
Job C parts ──┘

Job D parts ──► Run 2 (Driver Sarah, Truck B, Trailer Y)
```

This is how real logistics works. A driver going to Leeds carries whatever work needs to go to Leeds — regardless of which customer job it came from.

## The five core objects

### 1. Main Job
**What it is:** The promise to the customer. One contract, one reference number.
**What it holds:** The full required movement — all stops, full quantity, all load rules.
**What it does NOT hold:** Which driver, which trailer, how the load is split. That is the Run's job.
**Status:** Never set manually. Always a rollup from its job parts and runs.

```
Main job = what must be achieved
```

### 2. Job Part
**What it is:** One physical piece of work.
**Types:** collect / deliver / move-to-depot / reload / transfer / return
**What it holds:** quantity, location, time window, type, status
**Key rule:** Splitting a job creates more job parts — not more main jobs.

```
Job Part examples:
  Collect 52 pallets from London
  Deliver 26 pallets to Leeds
  Deliver 26 pallets to Manchester
  Move 20 pallets from depot to site
```

### 3. Run
**What it is:** A planner's execution container. One driver, one vehicle, one trailer, one period of work.
**What it holds:** references to job parts (with quantities), assigned driver/truck/trailer, status
**Key rule:** A run without job parts assigned is just an empty shell — not valid for execution.
**A run only makes sense if four things fit:** location + time + load availability + equipment

```
Run = how the planner executes the job
```

### 4. Load Position (the ledger)
**What it is:** Where the pallets physically are at every moment.
**Key rule:** The total must always equal the job requirement. If it does not, that is an automatic warning.

```
Job requires: 52 pallets
├── 26 on Trailer X (Dave, Run 1)      — in transit
├── 14 at depot (waiting for reload)   — at depot
├──  8 delivered to Leeds              — delivered
└──  4 unaccounted                     — WARNING
     ─────
     52 total ✓ (but 4 unaccounted needs attention)
```

Every pallet movement is a transaction (like a ledger entry):
```
collect 20   → source loses 20,   trailer gains 20
depot drop   → trailer loses 20,  depot gains 20
reload       → depot loses 20,    new trailer gains 20
deliver 20   → trailer loses 20,  destination gains 20
```

**Load rules travel with the load.** If the load is temperature-controlled, every trailer it moves onto must be temperature-controlled. System checks this on run assignment.

### 5. Event
**What it is:** What actually happened. Immutable record.
**What it holds:** event type, timestamp (client + server), GPS location, driver, quantity confirmed
**Key rule:** Driver reports events. Everything else — status, load position, warnings — is derived from events.

```
Event = what actually happened
```

---

## The two creation paths

Both paths produce the same object: a Main Job. Same information structure, different entry point.

```
EXTERNAL (customer)                    INTERNAL (planner)
───────────────────                    ──────────────────
Customer fills public form             Planner fills identical form
         ↓                                      ↓
    Job Request                           Main Job (directly)
  status: pending_review                  status: draft
         ↓
  Planner reviews
  Accept → Main Job created
  Reject → request closed
         ↓
    Main Job
  status: draft
         ↓
    Run Planner page (both paths arrive here)
```

**The forms are identical.** Same fields, same validation, same structure.
The only difference is that the internal form skips the request/review phase.

---

## Job lifecycle (status flow)

Status is always derived from real work — never set by pressing a button.

```
draft              → job created, no runs planned yet
planned            → runs created and assigned, not started
in_progress        → at least one run has started
partially_collected → some quantity collected, not all
partially_delivered → some quantity delivered, not all
attention_needed   → a problem exists (stuck driver, failed delivery, etc.)
completed          → all required quantity delivered
cancelled          → job cancelled before completion
```

---

## Run lifecycle (status flow)

```
unassigned   → run created, no driver/vehicle assigned yet
assigned     → driver and vehicle assigned, not started
in_progress  → driver started the run
at_collection → driver arrived at collection point
loading      → driver is loading
collected    → driver has collected and left site
in_transit   → driver travelling to delivery/depot
at_delivery  → driver arrived at delivery point
completed    → all job parts in this run delivered
failed       → run could not complete (stuck, breakdown, refusal)
```

---

## Splitting logic

A job can be executed in three ways. All still belong to the same main job.

**No split** — whole load moves together in one run.
```
Run 1: collect 52 pallets London → deliver 52 pallets Leeds
```

**Partial split** — part of the load moves separately.
```
Run 1: collect 26 pallets London → deliver Leeds
Run 2: collect 26 pallets London → deliver Manchester
```

**Full split (hub-and-spoke)** — multiple collections feed one delivery.
```
Run 1: collect Leeds      → bring to depot
Run 2: collect Manchester → bring to depot
Run 3: collect Birmingham → bring to depot
Run 4: load all at depot  → deliver Dundee  (depends on runs 1+2+3)
```

Run dependencies are explicit — Run 4 cannot start until Runs 1, 2, 3 are complete.

---

## Merge logic

Planner can merge split parts back together if:
- Same destination or compatible route
- Same load rules (temperature, equipment, etc.)
- Vehicle/trailer capacity allows it
- Time windows still work
- Load is physically available to combine

System checks these conditions. If any fail, system warns before allowing merge.

---

## Warning logic (warn, don't block everything)

System warns the planner. Planner can override most warnings. Impossible states require confirmation.

| Warning | Severity |
|---|---|
| Remaining quantity not collected | High |
| Delivery assigned but load not on this run | High — needs confirmation |
| Load on trailer but no delivery planned | High |
| Run route does not make logical sense | Medium |
| Time window at risk | Medium |
| Wrong vehicle/trailer type for load | Medium |
| Driver delayed — next job at risk | Medium |
| Collection completed but delivery not planned | Medium |
| Delivery planned before collection is possible | High — needs confirmation |
| Load at depot but no onward run planned | Medium |
| Quantities do not balance (ledger mismatch) | High |

---

## Recovery logic

When something goes wrong, the system asks:
1. What happened?
2. What is affected?
3. Where is the load right now?
4. What is still possible?
5. What are the next best options?

Example:
```
Driver stuck at delivery.
Next collection window at risk.
Nearby driver is empty and available.
System suggests: transfer collection to nearby driver.
Planner confirms.
```

Recovery never assigns a driver to a load they do not have physical access to.
Driver swaps always check load possession first.

---

## Driver execution logic

Driver should not type much. Driver confirms operational reality.

```
Start run           → I am starting, here is my location
Arrive collection   → I am at the site
Start loading       → I am loading now
Collected quantity  → I loaded X pallets (driver enters actual number)
Leave site          → I am leaving, load is on board
Arrive delivery     → I am at delivery site
Delivered quantity  → I delivered X pallets (driver enters actual number)
Failed delivery     → I could not deliver, here is why
Finish run          → Run is complete
```

Time and GPS are recorded automatically. Driver only reports quantities and events.

---

## Data quality rules

```
Information is structured. Operations are flexible.
```

- Forms must not allow free-form garbage to drive logic
- Free text is only for notes
- Core decisions come from: controlled choices, timestamps, locations, quantities, statuses, events
- Every quantity field is a number — not "about 20" or "full trailer"
- Every location is a verified address with lat/lng
- Every status change is an event — never a field update without an event record

---

## What currently exists vs what needs to be built

### Currently exists (web)
| Thing | Status | Notes |
|---|---|---|
| Public request form | ✓ Done | Needs form fields to match internal form |
| Request review page (accept/reject) | ✓ Done | Works correctly |
| Job detail page (`/app/jobs/:id`) | Partial | Old implementation — will be replaced |
| Planner dashboard with job cards | Partial | Good foundation but wrong data model |
| Jobs list page | Partial | Needs redesign |
| Create job page (internal) | Partial | Wrong shape — needs to match public form |
| Driver/fleet management | ✓ Done | Keep as-is |

### Currently exists (API)
| Thing | Status | Notes |
|---|---|---|
| Job requests routes | ✓ Done | Keep — request flow is correct |
| Jobs routes (PlannedJob) | Partial | Will be refactored when model changes |
| Shifts routes | ✓ Done | Keep as-is |
| Auth / company / drivers | ✓ Done | Keep as-is |

### Does not exist yet (needs to be built)
| Thing | Priority | Notes |
|---|---|---|
| `JobPart` model and API | P1 | Core — nothing else works without this |
| `Run` model and API | P1 | Core — replaces PlannedJob as execution unit |
| Load position ledger | P1 | Core — tracks where pallets are |
| Run Planner page (split/assign UI) | P1 | The main planner working view |
| Warning engine | P2 | Derives warnings from load position + run logic |
| Recovery suggestions | P3 | Suggest options when things go wrong |
| Real-time status updates (web) | P2 | Planner sees driver progress without refreshing |
| Merge runs UI | P2 | Combine split runs back together |
| Run dependency support (hub-and-spoke) | P2 | Run 4 waits for Runs 1+2+3 |

---

## Build phases

### Phase 1 — Data model (agree before writing any code)
Define exact fields and relationships for: Main Job, Job Part, Run, Load Position, Event.
Write these into DATA_DICTIONARY.md.
No code until the model is agreed.

### Phase 2 — API
Build the new routes for Job, Job Part, Run.
Migrate existing PlannedJob data: every existing job gets one Run automatically (no data loss).
Build the load position ledger (transaction log).

### Phase 3 — Run Planner UI
The main planner page: see a job, its parts, create runs, assign stops to runs, assign driver/vehicle.
This replaces the current dashboard drawer as the primary planning tool.

### Phase 4 — Driver execution (mobile)
Update mobile app to work against Job Parts and Runs instead of PlannedJob.
Driver sees their Run, confirms events on Job Parts.

### Phase 5 — Warnings and recovery
Warning engine reads load position + run config and surfaces issues.
Recovery suggestions for common failure scenarios.

### Phase 6 — Polish and unify
Remove duplicate UI (old JobDetailPage, old dashboard drawer).
Ensure external and internal forms are identical in structure.
Real-time updates for planner (WebSocket or polling).

---

## Rules for adding new features

Before adding anything new, answer these questions:

1. **Which of the five objects does this belong to?** (Main Job / Job Part / Run / Load Position / Event)
2. **Where does it fit in the lifecycle?** (creation → planning → execution → completion)
3. **Does a concept with this name already exist?** Check DATA_DICTIONARY.md first.
4. **What does it depend on?** What breaks if this is wrong?
5. **Does it need to be in Phase 1-3 before it makes sense?** If yes, do not build it out of order.

If you cannot answer all five questions, the feature is not ready to build yet.

---

## Things we will NOT do again

- Build UI for a feature before the data model is agreed
- Create two separate pages/components that do the same thing
- Use PlannedJob as both the job record and the execution record
- Name fields without checking DATA_DICTIONARY.md first
- Add a field to a form without knowing which database column it maps to
- Build a page that is not connected to the page before and after it in the flow
