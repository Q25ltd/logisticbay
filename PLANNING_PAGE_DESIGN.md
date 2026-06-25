# LogisticBay — The Planning Page: Load Movement Design & UX

> The definitive design for the Planning screen. What planning is *for*, the object
> model it should use, every movement scenario from a UI/UX angle, the rules planning
> must respect, and the gated plan to get there.
> Created: 2026-06-24. Authority: this is **target design** for the Planning screen.
> It defers to `schema.prisma` → `DATA_DICTIONARY.md` → `STATUS.md` for what is
> *built*, and to `LOAD_MOVEMENT_PLAN.md` for movement *mechanics* + custody.
> It **supersedes** the UX/validation language of the older `PLANNING_BOARD.md`
> (which predates the "no AI / build-not-firefight" direction).

---

## 0. Why this document exists

A planning session (2026-06-24) reframed the whole product. The conclusion:

> **LogisticBay is not a run planner. It is a Load Movement Planning System.**
> Planning's job is to decide **the best way to move each load**. Runs, drivers,
> trailers and live events are just stages of *executing* that decision.

If the planning page doesn't make that decision easy and pleasant, all the backend
work (custody ledger, feasibility engine, fleet-aware capacity, drivers' hours)
delivers nothing — the planner won't use it. This doc is the UX contract that keeps
the page focused on the decision.

---

## 1. Philosophy — what planning is, and is not

**Planning decides movement strategy.** It is *building, grouping, optimising,
organising* — not auditing, investigating, or firefighting.

**The three screens are three different worlds.** Do not blur them.

| Screen | World | Known | Unknown | Goal |
|---|---|---|---|---|
| **Planning** | Future, theoretical. Planner has time. | Jobs, locations, dates, time windows, load requirements, fleet owned | Traffic, breakdowns, sickness, customer delays | Choose the best **load movement strategy** |
| **Runs / Allocation** | Turning the plan into work | The plan + fleet availability | — | Assign **driver · unit · trailer**; confirm suitability, capacity, availability |
| **Live** | Reality has started | What's actually happening | What goes wrong next | Solve problems **fast** |

**Validation stays in the background.** The planning page must never become a wall of
warnings ("Warning · Warning · 68% · Invalid"). The feasibility engine (Q1–Q5) is a
quiet confirmation that says *"looks good"* by default and only speaks up when the
planner's **move** is actually wrong — and when it does, it offers a **building
action**, not an accusation. Red turns into *"Add collection"*, *"Yard relay from
RUN-X"*, *"Split"* — never a dead-end audit.

**Complex underneath, simple on top** (PRODUCT.md). The planner sees movements; the
machinery (custody, three-dimension state, reconciler) stays hidden.

---

## 2. The layered object model — Job → Movement → Run → Load Journey

The screen jumps straight from **Job → Run** today, which is too much mental work: the
planner has to translate a customer promise into truck assignments in one leap. The
missing middle layer is the **Movement**.

```
Job          the customer promise + the RULES (what's allowed)
  │
Movement     the planning DECISION — how this load travels (the strategy + its legs)
  │
Run          execution — a driver/unit/trailer doing one or more legs
  │
Load Journey the through-line — the custody path the load actually takes
             (already exists at execution time as the LoadTrack ledger)
```

- **Job** = customer promise *and constraints*. Stays one Job no matter how many
  movements execute it (PRODUCT.md locked decision #2 — splitting adds JobParts, not
  Jobs).
- **Movement** = the planning-time decision: *direct / via-yard / relay / split /
  tramper / hub*. Owns its **legs** (collection, storage, relay, swap, delivery) and
  points at the run(s) that execute each leg. **This is the object that's missing
  today** — strategy currently lives only as throwaway output in
  `proposeRunsService` and as `runType` on a Run after the fact.
- **Run** stays the central *execution* object (PRODUCT.md locked decision #1 — not
  re-debated). A Movement is realised *as* one or more Runs.
- **Load Journey** = the custody chain (`LoadTrack`, A5 in LOAD_MOVEMENT_PLAN). At
  execution time the journey already exists as an append-only ledger spanning runs,
  yards, relays and days. The Movement is the *plan* of that journey; the ledger is
  its *truth*.

**Reconciliation with the locked decision:** "Run is central" remains true for
**execution**. The Movement/Load-Journey is the **planning-layer** object above it.
No contradiction — we're adding a layer, not replacing the Run.

**Job defines the rules; Planning chooses the move.** Job creation captures what the
customer permits (storage? relay? split? direct only?). Planning chooses *within*
those rules based on real operational conditions (corridor, fleet owned, windows,
hours).

---

## 3. Movement strategy catalogue (the real planning decision)

Each strategy below maps to a scenario in `LOAD_MOVEMENT_PLAN.md` Part B (the custody
mechanics live there — do not duplicate them). Here we define **when** to choose it,
the **constraint** it needs from the Job, and **how the planner builds & sees it** on
the page.

| # | Strategy | When | Legs | Job constraint needed | Realised as | Built today? |
|---|---|---|---|---|---|---|
| 1 | **Direct** (B1) | Collection & delivery fit one run, on time, one vehicle | collect → deliver | — | 1 run | ✅ |
| 2 | **Multi-drop** | One collection, several deliveries on a corridor | collect → deliver ×N | — | 1 run | ✅ |
| 3 | **Groupage / consolidation** (B6) | Several small loads share a vehicle | collect ×N → deliver ×N | compatible loads | 1 run | ✅ (proposal); custody Step 10 pending |
| 4 | **Relay via yard** (B2) | Distance/hours too long for one driver; buffer at a yard | collect → **yard drop** → **yard pick** → deliver | relay allowed, storage allowed | 2 runs + feeder link | ✅ (one-click yard relay) |
| 5 | **Relay by handover** (B3) | Driver A → Driver B, no yard | collect → **handover** → deliver | relay allowed | 2 runs + handover | 🔲 Step 8 |
| 6 | **Trailer swap** (B4) | Drop loaded trailer, take another | collect → **drop trailer** → (other driver) take → deliver | swap allowed | 2 runs, shared trailer | 🔲 Step 7 |
| 7 | **Split load** (B5) | Won't fit one vehicle (capacity/fleet), or customer splits | collect (1 or N) → deliver on N vehicles | split allowed | N runs | 🔲 Step 9 (capacity-driven) |
| 8 | **Tramper / multi-day** (B7) | Too far for a legal day; same driver rests out | collect → … → overnight → … → deliver | multi-day allowed | 1 run across days | 🔶 overnight run exists |
| 9 | **Hub-and-spoke** | Trunk to hub, local distribution out | collect → hub → sort → local deliver | storage allowed | 2+ runs | 🔲 Step 10 / Type 4 |
| 10 | **Backload / return** | Fill the empty return leg | deliver → nearby collect → home | — | extends a run | 🔲 later |

**Only after a strategy is chosen do runs get created.** Choosing the strategy *is*
the planning act; run creation is mechanical fallout.

---

## 4. Job-creation constraints — the rules planning must respect

Planning can only legitimately *choose* a movement if it knows what's allowed. Today
the schema captures only `serviceType` and `canSplitShipment` (default
`must_stay_together`). The constraint layer is otherwise **missing** — this is the
cheapest high-value next step, and it has **no re-architecture**.

Constraints to capture at intake (per Job, with sensible defaults):

| Constraint | Meaning | Default |
|---|---|---|
| `canSplitShipment` *(exists)* | May the load be split across vehicles? | must_stay_together |
| `storageAllowed` | May it rest at a yard/hub between legs? | true |
| `relayAllowed` | May two drivers relay it (yard or handover)? | true |
| `directPreferred` | Customer prefers a single direct run if feasible | false |
| `timeCritical` | No buffering/storage — straight through | false |
| `tramperAllowed` | May it ride a multi-day run? | true |

These are **rules, not decisions**. Planning reads them and only offers strategies
the customer permits (e.g. a `timeCritical` + `must_stay_together` load never offers
yard relay or split). Add to `DATA_DICTIONARY.md` when built.

---

## 5. The five planning questions (kept — but in the background)

The feasibility engine answers these deterministically (no AI). It already exists and
is honest. On the page it is **quiet confirmation**, surfaced loudly only on a real
problem, always with a fix-it action.

- **Q1 — What can travel together?** compatibility (temp / ADR / oversized / vehicle
  class). *Advisory; never blocks adding freight.*
- **Q2 — Do the directions make sense?** detour ratio, empty miles (real HGV routing).
- **Q3 — Can it be done on time & legally?** windows (with window-wait), drivers'
  hours (repeating breaks, WTD, 13h duty), 15% buffer. *Honest — see §7.*
- **Q4 — Is every delivery sourced?** collection coverage (collect / yard pick /
  feeder). *A real validity rule — was a genuine bug.*
- **Q5 — Does it physically fit?** fleet-aware capacity (pallet footprint vs the
  trailers the company **actually owns**) + vehicle-type suitability.

Fleet-awareness is the bridge to strategy: *40 pallets, no double-deck owned → the
strategy must be **split***. Feasibility doesn't just grade a plan — it **suggests the
move**.

**Remaining feasibility refinements** (absorbed from the former
`PLANNING_LOAD_FEASIBILITY_DESIGN.md`, now archived): **Q5c/e** — load dimensions +
handling equipment (tail-lift / forklift / crane needs) vs the vehicle; **Q5d** —
loading-metres / mixed-pallet `loadData` parsing for precise footprint. Both
deterministic, advisory on Planning. And the **hard-on-Runs-publish** check (capacity
+ coverage block publish against the *assigned* trailer) extends S5 when the Runs
screen is built — on Planning everything stays advisory.

---

## 6. The planning page — best UI/UX

### 6.1 Principles
1. **Think in movements, not records.** The unit the planner accepts is a Movement,
   not a database row.
2. **Never a blank page.** Always open with proposals (movement plans) the planner can
   accept, tweak, or dismiss. The system does the first draft; the human decides.
3. **Validation builds, never audits.** Every red state carries a one-click building
   action. (Done: Add collection, Yard relay, Find collection.)
4. **Quiet by default.** "Looks good" is a single calm line; the 7-tile detail is
   collapsed until asked for. (Done: compact run check.)
5. **One job, one place.** A load split across runs must stay visually connected — the
   relay link and the cross-run "collection is on RUN-X" detection exist for this.
6. **Calm, strategic surface.** This is the unhurried screen. Firefighting lives on
   Live.

### 6.2 The Movement card (the missing UI primitive)
A proposal/movement should render as a **Movement card**: strategy badge (Direct /
Relay / Split / Tramper …), the loads it carries, the *why*, the feasibility summary
(quiet), and **Accept** → materialises the run(s). Accepting a *relay* or *split*
proposal should build **both/all** runs and their links in one action — the planner
chose the move; the runs are automatic.

### 6.3 Scenario UX (how each move looks & is built)
- **Direct / Multi-drop / Groupage:** drag loads into a run, or accept a proposal.
  Compatibility + capacity confirm quietly.
- **Relay via yard:** plan the delivery leg on a second run; the banner detects the
  collection on the first run and offers **"Yard relay from RUN-X"** with a yard
  picker — links the feeder and drops the yard handoff on both runs. *(Built.)*
- **Split:** when fleet-aware capacity says "split into N", offer **"Split into N
  runs"** — creates N runs and distributes the load. *(Needs split endpoint, Step 9.)*
- **Tramper / multi-day:** "Overnight run" creates the next-day continuation; the duty
  model already spans it.
- **Hub / swap / handover:** future — each becomes a one-click action on the run once
  its Step (7/8/10) lands.

### 6.4 Grouping — region is useful but not enough
Group unplanned freight by **area/region/corridor** (North West, Yorkshire, West
Midlands…) for organisation. But the hard, valuable jobs — multi-day, tramper, yard
storage, relay, swap — **cross regions**. So region is a *filter*, not the structure.
The structuring concept is the **Load Journey / corridor**, not the postcode.

### 6.5 What stays OUT of planning
Driver/unit/trailer **assignment** (that's the Runs screen — planning may *suggest*
required vehicle type but does not allocate a specific truck). Live exceptions,
reassignment, notifications (Live screen). Keep planning about the *decision*.

---

## 7. Confidence honesty + the learning engine (later)

Today's confidence is built only from deterministic facts: distance, windows, legal
hours, capacity, coverage, compatibility. **It must stay honest** — it cannot and must
not pretend to predict traffic, breakdowns, or sickness.

Later, a **learning engine** can enrich it from captured signals: traffic history,
customer punctuality, site loading/unloading times, dwell. The rule: *capture signals
now, recommend later* — and never dress a guess up as a number. The unknown stays
labelled unknown.

---

## 8. Recurring runs (parked — with the safe model)

Blind repeat is dangerous: copying old **operational** data (times, assignments)
drifts from reality → wrong collection times, wrong deliveries, complaints (the
Paragon failure mode). If ever built, a template carries only the **strategy and
constraints**, and the operational specifics are **re-derived against today's jobs**.
Parked.

---

## 9. Staged build plan (gated — smallest step first)

1. **Capture constraints** (§4) on the Job + intake UI. Cheap, no re-architecture; it's
   the input planning is missing. → adds fields to schema + `DATA_DICTIONARY.md`.
2. **Make Movement visible** — treat the accepted proposal/strategy as the unit; build
   all runs of a relay/split from one Accept. Mostly UI + `proposeRunsService`.
3. **Persist the Movement / Load-Journey object** — a planning-time entity linking
   legs ↔ runs so the journey survives across runs and days (the way `LoadTrack` does
   at execution). **Big step — plan it through `LOAD_MOVEMENT_PLAN.md`**, gated behind
   the remaining movement Steps (7–10) it depends on.
4. **Split / hub / swap / handover** strategies become one-click as their
   LOAD_MOVEMENT_PLAN Steps land.

Do **not** re-architect around "Load Journey" up front — the custody ledger already is
the execution journey, and `MovementStrategy` / `runType` / `dependsOnRunId` already
exist. Evolve the planning layer on top; don't rewrite.

---

## 10. Open questions (also tracked in QUESTIONS.md)
- Does **Movement** become a persisted entity, or stay a derived view over Job +
  Runs + custody? (Decision gate before step 9.3.)
- Which constraints are **hard** (planning may not offer the strategy) vs **soft**
  (offered with a warning)?
- Where does the **corridor/journey** grouping get its definition — saved corridors,
  derived clusters, or both?
