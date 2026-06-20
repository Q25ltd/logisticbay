# Phase A / Slice A3 — Proposal-First Planning — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Part E, Phase A slice A3 + Planning brief ("never start with a blank page"). **Investigate only — no code written.**
> Goal: the system continuously proposes the best freight movements (best strategy, grouping, run candidates, consolidation) so the planner is a decision-maker, not a manual run builder. Deterministic/rule-based (no ML — capture-now/recommend-later).
> Date: 2026-06-20.

---

## 1. What exists vs what's missing

**Exists (the building blocks):**
- **Geographic clustering** — `clusterStops()` in `planning.ts` (greedy 5 km GPS radius + postcode-area fallback) → `StopCluster[]`, already shown in the Planning left panel via `/planning/unplanned`.
- **Vehicle suggestion** — `suggestVehicleService` (`suggestVehicle` / `suggestTrailerForRun`), rule-based from weight/goods.
- **The three A2 signals per candidate run** — compatibility (Q1 `checkLoadMixing`), confidence+buffer (Q3), detour/empty-miles (Q2) are all now computable for any set of stops via `check-run`.

**Missing (what A3 adds):**
- A **proposal engine** that turns loose unplanned stops into *candidate runs* grouped by the brief's three questions — what can travel together (Q1), same direction/corridor (clusters + Q2), realistically on time (Q3) — each tagged with a **movement strategy** and a one-line "why", surfaced as **accept-able proposals**. Today the planner drags stops into runs by hand; clusters are only a geographic hint.

---

## 2. Proposed design — `POST /planning/propose-runs?date=…`

A deterministic, explainable engine (no solver, no ML):
1. Pull unplanned stops for the date (reuse the `/planning/unplanned` source).
2. **Group by corridor** — start from the existing geographic clusters.
3. **Within a corridor, split by compatibility** — never group loads that can't share a trailer (reuse `checkLoadMixing` Q1): temp vs ambient, ADR vs food, etc.
4. **Assemble candidate runs + detect a strategy:**
   - `direct` — one collection + one delivery (same pair).
   - `multi_drop` — one collection, several deliveries in the corridor.
   - `groupage` — several small loads, same corridor, combined under capacity.
   - (`hub` / `relay` / `multi_day` / `backload` — flagged as *opportunities* later; A3 ships direct/multi-drop/groupage first.)
5. **Score each candidate** with `check-run` (confidence + detour) and attach the compatibility result.
6. Return proposals: `{ strategy, stops[], confidence, detourRatio, compatibility, why }`.

The planner **accepts** a proposal (creates the run + assignments via the existing `/planning/runs` + `/assignments` endpoints) or **ignores/overrides** it — the manual board stays fully usable. Proposals are advisory; nothing is auto-committed.

---

## 3. Keep / Change / Delete

| File | Call | Why |
|---|---|---|
| `planning.ts` `clusterStops` / `/planning/unplanned` | **KEEP / reuse** | corridor grouping foundation. |
| `lib/loadMixing.ts` (Q1) | **KEEP / reuse** | splits clusters by what can travel together. |
| `services/checkRunService.ts` (Q2/Q3) | **KEEP / reuse** | scores each candidate. |
| **new** `services/proposeRunsService.ts` | **ADD** | the deterministic grouping + strategy detection + scoring. Pure-testable core. |
| **new** `POST /planning/propose-runs` route | **ADD** | returns proposals; creates nothing. |
| `suggestVehicleService` | **KEEP / reuse** | per-proposal suggested vehicle category (advisory). |
| **web** `PlanningBoardPage` + `api/planning.ts` | **CHANGE** | a "Proposals" panel: candidate runs with strategy + confidence + detour + compat + "Accept" (creates run via existing endpoints) and dismiss. Manual board unchanged. |
| Schema / mobile | **KEEP** | no change. |
| Tests | **ADD** | `proposeRunsService.test.ts` — corridor+compatibility grouping, strategy detection (direct/multi-drop/groupage), pure (no DB). |

**No schema change. No mobile change.** Accept reuses existing run/assignment endpoints (no new write path).

---

## 4. Decisions I need before coding

**D-A3.1 — Engine scope (recommended: greedy + 3 strategies first).** Corridor → compatibility-split → direct/multi-drop/groupage, scored by check-run. Defer hub/relay/multi-day/backload *detection* to a later slice (the mechanisms exist — S6 yard/relay — but proposing them automatically is harder). Alternative: include hub/relay detection now (bigger).

**D-A3.2 — Accept flow (recommended: accept = create run via existing endpoints).** "Accept" calls `POST /planning/runs` + `/assignments` (already there) — no new write path, no auto-commit; planner clicks to materialise. Alternative: a dedicated `accept-proposal` endpoint (more atomic, more code).

**D-A3.3 — Compute location (recommended: one `propose-runs` endpoint).** Server groups + scores in one call (it already has stops + the rule engines). Alternative: client-side grouping (duplicates rules in the browser — avoid).

**D-A3.4 — Never force proposals (recommended: yes, advisory only).** Proposals sit in a panel; the manual drag board is always available and never gated behind accepting a proposal. (Brief: planner is decision-maker.)

**D-A3.5 — Owner.** Backend (`proposeRunsService` + route + test) by me; the Proposals panel UI by a Sonnet subagent after the backend is green. Your call.

---

## 5. Risk / scope notes

- **Greedy ≠ optimal.** A3 proposes *good* candidates, not a globally optimal plan (no VRP solver). That's intended for now; the planner refines. True optimisation is a later, separate effort.
- **Proposal quality depends on data** (coords, time windows, requirement flags). Where data is thin, proposals are fewer/weaker — acceptable; the manual board covers the gap.
- **Don't double-commit** — a proposal must disappear/refresh once its stops are assigned (accepted or manually), to avoid proposing already-planned freight.
- **Parked (not A3):** hub/relay/backload auto-detection, VRP optimisation, the learning engine (A5), split/consolidation *actions* (A4 — though groupage proposals hint at consolidation).
- **Exit gate (A3):** for a set of unplanned stops the engine returns explainable candidate runs (strategy + confidence + detour + compatibility + why); accepting one creates the run via existing endpoints; the manual board still works; pure-function tests pass; typecheck/check:vocab green; web smoke clean on Mac.

---

## 6. Recommendation

Proceed **D-A3.1** greedy + direct/multi-drop/groupage; **D-A3.2** accept = existing endpoints; **D-A3.3** one `propose-runs` endpoint; **D-A3.4** advisory only; **D-A3.5** backend me, Sonnet for the panel. Awaiting review before writing any code.
