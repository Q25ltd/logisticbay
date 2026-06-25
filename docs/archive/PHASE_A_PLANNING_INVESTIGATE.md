# Phase A — Planning Screen — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Part E, Phase A. **Investigate only — no code written.** For review before implementation.
> Goal: turn the 2,260-line `PlanningBoardPage` monolith into a focused, proposal-first **Planning screen** that answers only "what is the best way to move this freight?" — jobs→runs, no asset/driver/live concerns.
> Date: 2026-06-07.

---

## 1. What I read — the monolith maps cleanly

`PlanningBoardPage` is big but structurally clean. Its parts split almost perfectly along the Planning / Runs line:

| Component | Lines | Concern | Phase A |
|---|---|---|---|
| `JobWorkCard` | ~218 | left-panel freight-unit card (a stop/leg to place) | **Planning — stays** (reframe as freight unit) |
| `RunLane` | ~492–1525 (~1000) | a run lane | **MIXED — the seam** (see below) |
| `Sidebar` | ~1525 | filters by date / area | **Planning — stays** |
| `CapacityBar` | ~159 | load vs capacity hint | **Planning — stays** (drive from requirements, not assigned truck) |
| AI check (`/ai/check-run`) inside `RunLane` | — | route/time feasibility | **Planning — stays (Q3)** |
| `PlanningBoardPage` | ~1632 | container + data load | **Planning — stays** |

**The seam is inside `RunLane`.** It mixes:
- *Planning* (stays): stops list, sequence/reorder (drag), waypoints (depot/yard/hub), the AI feasibility check, relay/overnight controls.
- *Asset allocation* (moves to Runs screen, Phase B): the truck `<select>` (~1441), trailer `<select>` (~909), driver select, the publish/recall block (~1462), and the compat warning (S5).

So Phase A is mostly: **lift the truck/trailer/driver pickers + publish/recall out of `RunLane`**, leaving a clean planning lane that shows the run as a *skeleton* (stops + derived requirements + feasibility), with vehicle/driver shown read-only as "needs allocation."

**The interim-gap risk:** if we remove the pickers from Planning before the full Runs screen (Phase B) exists, the planner temporarily has nowhere to assign assets. But `RunDetailPage` already has working truck/trailer/driver pickers + the S5 compat indicator — so it becomes the **interim asset surface** in Phase A and grows into the full Runs screen in Phase B. No functionality is lost mid-flight.

**Run systems:** Planning uses `/planning/runs`; `RunsPage`/`RunDetailPage` use `/runs`. Phase A standardises the Planning screen on `/planning/runs` (the richer one with clustering, waypoints, overnight-rest). Consolidating the two systems happens as Planning + Runs are built (folds in old S16) — not a separate step.

**Nav:** `AppShell.tsx` `NAV` is a flat vertical list of ~9 items. Refactor to **horizontal**, grouped, with **Planning / Runs / Live** as primary tabs and the rest (Jobs, Requests, Fleet, Drivers, Shifts, Holidays, Settings) under menus.

---

## 2. Proposed Phase A internal slices (each a shippable gate)

Phase A is large, so it splits into ordered slices — same investigate→build→gate discipline per slice:

- **A1 — Structural: focused Planning screen + horizontal nav.** Lift asset pickers + publish out of `RunLane` (→ keep on `RunDetailPage` interim); reframe left panel as freight units/legs; standardise on `/planning/runs`; switch sidebar nav to horizontal grouped (Planning/Runs/Live primary). *No new capability — pure re-shape.* **← first slice**
- **A2 — The three questions, first-class:** live compatibility grouping (Q1, reuse S5 rules) · detour / empty-miles indicator per run (Q2, build on haversine clusters + postcode districts) · **confidence-scored feasibility + mandatory buffer** (Q3, extend `/ai/check-run` from binary → score). *Q3 is the meatiest backend bit.*
- **A3 — Proposal-first:** promote `suggest all runs` / `suggest-vehicle` / clustering into continuous **strategy proposals** (direct / multi-drop / groupage / hub / yard / relay / multi-day / backload) with one-click accept + always-available manual override.
- **A4 — Split (old S9) + Consolidation (old S10)** as planner actions on freight units (assign qty per run with conservation; many jobs → one run with combined checks).
- **A5 — Capture-only metrics** for the future learning engine: persist site dwell (`arrived_pickup→collected`) and customer punctuality (planned window vs `actualStartTime`/`actualEndTime`). **No recommender yet** — just accumulate history.

---

## 3. Keep / Change / Delete (for A1, the first slice)

| File | Call | Why |
|---|---|---|
| `web/.../PlanningBoardPage.tsx` `RunLane` | **CHANGE** | remove truck/trailer/driver selects + publish/recall block; keep stops/sequence/waypoints/AI-check; show vehicle status read-only. |
| `web/.../runs/RunDetailPage.tsx` | **KEEP (interim asset surface)** | already has the pickers + compat (S5); becomes where assets are assigned until Phase B. |
| `web/.../planner/AppShell.tsx` `NAV` | **CHANGE** | vertical → horizontal grouped; Planning/Runs/Live primary. |
| `web/.../planning/PlanningBoardPage.tsx` `JobWorkCard` / `Sidebar` / `CapacityBar` | **KEEP** | reframe copy as freight units; CapacityBar driven by run requirements. |
| `web/src/api/planning.ts` | **KEEP** | endpoints already serve the Planning screen. |
| `web/.../planner/AssignDrawer.tsx` (legacy job-centric) | **DELETE candidate** | superseded; retire in Phase B with the Runs screen (note now, don't delete mid-A1 unless unused). |
| Backend | **NONE for A1** | A1 is frontend-only re-shape; A2+ touch `/ai/check-run` etc. |

**A1 has no schema/mobile/API change.** Later slices touch the API (A2 confidence score, A4 split/consolidation, A5 metrics).

---

## 4. Decisions I need before coding

**D-A.1 — Slice Phase A internally, start with A1 (recommended: yes).** Ship the structural refactor + horizontal nav first (no new capability), then A2→A5. Keeps gates small.

**D-A.2 — Interim asset surface during Phase A (recommended: `RunDetailPage`).** When pickers leave Planning, assets are assigned on the existing `RunDetailPage` until Phase B builds the full Runs screen. Confirms no functionality gap. Alternative: keep a minimal read-only "assign in Runs" link on Planning only.

**D-A.3 — `CapacityBar` source (recommended: run requirements/target class).** Show load weight vs the run's required vehicle class target, not a specific assigned truck (trucks aren't assigned on Planning anymore). Alternative: hide CapacityBar on Planning entirely.

**D-A.4 — Horizontal nav grouping (recommended: Planning / Runs / Live primary tabs + "More" menu).** Confirm the grouping, or keep all items visible in one horizontal bar.

**D-A.5 — Implementation owner.** A1 is a substantial frontend refactor of a 2,260-line component. Per hybrid mode this is a strong candidate to hand to a **Sonnet subagent** (I write the precise slice spec + review against the gate), or I do it directly. Your call.

---

## 5. Risk / scope notes

- **Refactor risk:** `RunLane` is large and stateful; lifting the asset block must not break stop drag/drop or the AI check. Mitigation: A1 is pure move (no behaviour change), verified by the incognito smoke test (CLAUDE.md) + Console/Network clean.
- **Browser-clean rule (CLAUDE.md):** Phase A touches web — must pass the incognito smoke test and show no new Console/Network errors.
- **Parked (not Phase A):** asset allocation UI depth, swaps/handover (Phase B); all live/firefighting (Phase C); the ML recommender (A5 is capture-only).
- **Exit gate (A1):** Planning screen shows runs as skeletons (no asset clutter); assets still assignable on RunDetailPage; horizontal nav; one run system on Planning; typecheck/check:vocab/api-tests green; web incognito smoke clean.

---

## 6. Recommendation

Proceed **A1 first** (structural refactor + horizontal nav, no new capability), with **D-A.2 = RunDetailPage interim**, **D-A.3 = requirements-driven CapacityBar**, **D-A.4 = Planning/Runs/Live primary + More**. For **D-A.5**, A1's mechanical refactor is a good Sonnet-subagent hand-off if you want — otherwise I'll do it directly. Awaiting review before writing any code.
