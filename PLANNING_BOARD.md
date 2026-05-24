# LogisticBay — Planning Board Specification

> Full design spec for the run planning system.
> Agreed in session 2026-05-21. Build against this — do not deviate without updating it.
> Last updated: 2026-05-21

---

## The core philosophy

**Load is the primary entity. Everything else serves the load.**

```
LOAD  ← what we always track
  └─ sitting in   TRAILER       ← assigned at planning time
       └─ pulled by  UNIT/TRUCK  ← assigned in driver phase (future)
            └─ driven by  DRIVER ← assigned when confirmed
                 └─ on  RUN      ← the route structure
                      └─ serving JOB ← the customer's promise
```

A run always knows which job(s) it belongs to.
A job always knows what % is complete across all its runs.
The job is not done until every quantity on every run is delivered.

---

## Assignment order — non-negotiable

| Step | What | When |
|------|------|------|
| 1 | Build run (group stops) | At planning |
| 2 | Assign **trailer** | At planning or later — **optional, not enforced** (see note) |
| 3 | Assign **driver** | When driver availability confirmed (can be day before or morning of) |
| 4 | Assign **unit/truck** | Driver phase — any unit can pull any trailer |
| 5 | Publish to driver | When run is fully confirmed |

> **Decision 2026-05-24:** Trailer was originally required before publish. Changed to optional.
> Real-world planners often don't know which trailer will be available at planning time (trailers
> are assigned day-of based on availability). Trailer can be assigned at any time before or after publish.
> The API no longer enforces trailer presence at publish. Red warning removed from UI.

A run in `draft` status can exist with no trailer and no driver. That is correct and expected.

---

## The 5 run types

### Type 1 — Direct (simplest)
```
Collect from A → Deliver to B
Same driver. Same vehicle. No depot.
```
**Rule:** Never split a full load A→B unless capacity forces it (see Type 3).
You CAN add an en-route stop (e.g. depot drop on the way) if it does not break the load.

---

### Type 2 — Relay via depot
```
Driver A: Collect from A → Drop at depot
Driver B: Pick up from depot → Deliver to B
```
**Rules:**
- Both runs belong to the same job
- Run B is **locked** (cannot be dispatched) until Run A confirms depot drop
- Load custody transfers: `trailer A → depot → trailer B`
- Can be same driver doing both legs (two runs, same driver, sequential)

---

### Type 3 — Split load
```
Job: 80 pallets, Manchester → London
Vehicle capacity: 26 pallets

Run 1/4: collect 20 pallets → deliver
Run 2/4: collect 20 pallets → deliver
Run 3/4: collect 20 pallets → deliver
Run 4/4: collect 20 pallets → deliver
```
**Rules:**
- All runs belong to the **same job** (same JobPart, split by quantity)
- `RunAssignment.quantityAssigned` tracks how much each run carries
- Job progress = sum(quantityDelivered across all runs) / job.quantity
- Can be same driver making multiple trips OR different drivers simultaneously
- Each split run can independently have a depot stop if needed
- System warns if total assigned quantity ≠ job quantity

---

### Type 4 — Multi-collection → depot sort → multi-delivery
```
Morning — collection runs:
  Driver A: collect from customers 1,2,3 → depot
  Driver B: collect from customers 4,5,6 → depot
  Driver C: collect from customers 7,8,9 → depot

Depot: unload, sort, regroup by delivery zone

Afternoon — delivery runs:
  Driver D: depot → deliver zone North (customers 1,4,7)
  Driver E: depot → deliver zone South (customers 2,5,8)
  Driver F: depot → deliver zone East  (customers 3,6,9)
```
**Rules:**
- Delivery runs can only be built from loads **confirmed at depot**
- Morning collection runs must complete before afternoon delivery runs unlock
- The depot buffer shows: what is confirmed in, what is expected (with ETA)
- Loads can be regrouped at depot — delivery runs do not need to mirror collection runs

---

### Type 5 — Live reassignment (Phase 3 — monitoring)
```
Something goes wrong mid-operation. Planner needs to replan.
```

| Load state | Can reassign? | How |
|---|---|---|
| Not yet collected | ✅ Free | Change driver on run |
| Being collected | ✅ With flag | Change driver + add note |
| On truck → depot | ✅ Trailer swap only | Unhitch trailer, Driver B takes it |
| At depot, not loaded | ✅ Free | Change driver on delivery run |
| On truck → customer | ✅ Trailer swap only | Unhitch trailer, Driver B takes it |
| Delivered | ❌ Done | Nothing to reassign |

**Trailer swap** is its own immutable event:
```
TRAILER_SWAP event:
  from_driver, to_driver, trailer_id
  location (GPS or manual text)
  reason: breakdown / replan / other
  timestamp
```
After a swap, Driver B inherits the run. Driver A's run closes. All load custody transfers to Driver B permanently.

**Collection reassignment rule:** Collections can be reassigned freely if load hasn't been picked up. Deliveries can only be reassigned if the driver does not currently hold the load — if they do, a trailer swap is required.

---

## The planning board — screen design

### Layout
```
┌─────────────────────────────────────────────────────────────────┐
│  Planning Board   [date picker]   [← prev day]  [next day →]   │
├─────────────────────────────┬───────────────────────────────────┤
│  UNPLANNED STOPS            │  RUNS BEING BUILT                 │
│                             │                                   │
│  📍 Cluster: LS postcodes   │  ┌─ Run R-001 ─────────────────┐ │
│     3 stops · 18t · 14 pal  │  │  Trailer: [assign] required  │ │
│     [job stops listed]      │  │  Driver:  [assign] optional  │ │
│                             │  │  Stops: [drag stops here]    │ │
│  📍 Cluster: M postcodes    │  │  AI: ✅ Valid run             │ │
│     5 stops · 24t · 32 pal  │  └──────────────────────────────┘ │
│                             │                                   │
│  📍 Cluster: HU postcodes   │  ┌─ Run R-002 ─────────────────┐ │
│     2 stops · 8t · 6 pal    │  │  ⚠ Needs trailer             │ │
│                             │  └──────────────────────────────┘ │
│  [AI suggest groupings]     │  [+ New run]                      │
└─────────────────────────────┴───────────────────────────────────┘
```

### Left panel — unplanned stops
- All `ready_to_plan` job stops for the selected date
- Auto-grouped by:
  1. Gate GPS coordinates (stops within 5km cluster together)
  2. Postcode district as fallback (LS, M, HU, etc.)
  3. Time window (morning / afternoon)
- Each cluster shows: stop count, total weight, total pallets, area name
- Planner can expand a cluster to see individual stops
- **AI suggest groupings** button: Claude analyses all stops and suggests optimal run groupings

### Right panel — runs being built
- Each run is a card
- Planner drags a cluster or individual stop onto a run card
- Trailer must be assigned before run can be confirmed (red warning if missing)
- Driver is optional at this stage
- **AI validation** runs automatically as stops are added:
  - 🟢 Green: valid run, makes sense
  - 🟡 Amber: check this — possible issue (e.g. tight time windows, unusual detour)
  - 🔴 Red: problem — impossible state (delivery before collection, overloaded, etc.)
- Run can be saved as `draft` without driver — driver assigned later

### AI validation checks
| Check | Severity |
|---|---|
| Delivery stop before collection stop (load not available) | 🔴 Block |
| Total weight exceeds trailer type capacity | 🔴 Block |
| ADR load on non-ADR trailer | 🔴 Block |
| Temperature load on non-refrigerated trailer | 🔴 Block |
| Time window impossible (can't reach in time) | 🔴 Block |
| Stop adds significant detour (>30 min out of route) | 🟡 Warn |
| Time window tight (<30 min margin) | 🟡 Warn |
| Split load total ≠ job quantity | 🟡 Warn |
| Run depends on another run not yet complete | 🟡 Warn |
| No driver assigned | 🟡 Warn (at publish time) |
| Full load job — splitting not recommended | 🟡 Warn |

---

## Job progress tracking

When a run assignment is completed, the job updates automatically:

```
Job.quantityDelivered = SUM(RunAssignment.quantityConfirmed WHERE status = completed)

Job.status derived from:
  all parts pending       → ready_to_plan
  any run started         → in_progress
  some qty delivered      → partially_delivered  (future)
  all qty delivered       → completed
  problem state           → attention_needed      (future)
```

**Job is complete when:**
All RunAssignments for all JobParts of that Job have status `completed`
AND sum(quantityConfirmed) >= job.quantity (or override has been set)

---

## Schema additions required

These fields do not exist yet and must be added:

### Run
```prisma
runType          String?   // direct | relay | split | consolidation
dependsOnRunId   Int?      // FK Run — this run cannot start until that run completes
dependsOnRunIds  Json?     // for multi-dependency (hub-spoke: depends on 3 collection runs)
```

### RunAssignment
No changes needed — `quantityAssigned` already supports split loads.

### JobExecutionEvent (new event types needed)
```
trailer_swapped | truck_swapped | load_transferred
arrived_depot | depot_unloaded | depot_loaded
handover | handover_accepted
```

### LoadTrack (write path needed — schema already correct)
Currently schema is defined but no API write path exists.
Phase 2 adds: POST /load-track events from depot operations.

---

## Build phases

### Phase 1 — Planning board (Types 1, 2, 3)
**Scope:** Direct runs, relay via depot, split loads. No live monitoring.

Steps:
- [ ] 1.1  Add `runType` + `dependsOnRunId` to Run schema (migration)
- [ ] 1.2  API: geographic clustering endpoint — groups ready-to-plan stops by GPS/postcode
- [ ] 1.3  Planning board page (`/app/planning`) — date picker, two-panel layout
- [ ] 1.4  Left panel: unplanned stops, auto-grouped clusters
- [ ] 1.5  Right panel: run cards, drag stops onto runs
- [ ] 1.6  Trailer assignment UI on run card (required field)
- [ ] 1.7  Driver assignment UI on run card (optional at planning)
- [ ] 1.8  Run dependency locking (relay: run B locked until run A done)
- [ ] 1.9  Split load UI — assign quantity per run, balance check
- [ ] 1.10 AI validation (Claude API) — checks each run, returns green/amber/red with reason
- [ ] 1.11 AI grouping suggestion — "Suggest runs for today" button
- [ ] 1.12 Job progress update — job status derived from RunAssignment completion
- [ ] 1.13 Publish run → driver notified (push notification or in-app)

### Phase 2 — Depot operations (Type 4)
**Scope:** Multi-collection → sort → multi-delivery. Depot buffer view.

Steps:
- [ ] 2.1  LoadTrack write path (API: POST /load-track)
- [ ] 2.2  Depot buffer panel — shows loads confirmed at depot vs expected
- [ ] 2.3  Depot sort event — planner assigns collected loads to delivery runs
- [ ] 2.4  Delivery run locked until dependency collection runs complete
- [ ] 2.5  Load availability check when building delivery runs

### Phase 3 — Live monitoring + reassignment (Type 5)
**Scope:** Real-time tracking, mid-run reassignment, trailer swaps. Requires driver GPS.

Steps:
- [ ] 3.1  Live run status board (driver GPS positions, run progress)
- [ ] 3.2  Collection reassignment UI (free if not yet collected)
- [ ] 3.3  Trailer swap event UI + API
- [ ] 3.4  Run handover flow (Driver A → Driver B with load)
- [ ] 3.5  AI late-run detection (background agent, alerts planner)
- [ ] 3.6  Driver no-show alert (run published, driver not responding)

---

## What does NOT change

- Job and JobPart models are stable — no structural changes needed
- RunAssignment bridge model is correct — no changes needed
- The PRF → CJP → ready_to_plan flow is complete and working
- Mobile execution flow (collect, deliver, POD) is complete and working
- The planning board sits between "ready_to_plan" and "driver executes on mobile"
