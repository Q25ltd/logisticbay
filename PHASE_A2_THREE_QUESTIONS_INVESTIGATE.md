# Phase A / Slice A2 — The Three Planning Questions — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Part E, Phase A slice A2. **Investigate only — no code written.** For review before implementation.
> Goal: make the brief's three questions first-class on the Planning screen — (Q1) what can travel together, (Q2) does the direction make sense, (Q3) can it be done on time — proposal-grade, not perfect-conditions.
> Date: 2026-06-07.

---

## 1. What I read — the engines already exist, A2 extends + surfaces them

**Q3 — feasibility (`services/checkRunService.ts` + `/ai/check-run`):** `checkRun()` already computes, deterministically: per-leg road distance + drive time via **ORS HGV routing** (haversine fallback), and **per-stop time-window arrival checks**. Returns `{ concern, severity: high|medium|low|none, message }`. The planning board already shows it per run lane as a dot (🔴/🟡/🟢) + reason. **What's missing:** a *confidence score* and a *mandatory contingency buffer* — today it's pass/concern, and it implicitly assumes perfect drive/dwell times. The brief's principle ("never works only under perfect conditions") = add buffer + score on top of this existing engine.

**Q1 — compatibility (`runCompatibility`/`checkLoadVehicle` from S5, `goodsCompatBadge`, run requirement derivation):** S5 compares a load to an *assigned vehicle* — but on Planning no vehicle is assigned yet. The relevant Q1 question is **"can these stops share a run?"** — i.e. do the stops' requirements mix (all temp or none; ADR not mixed with food/enclosed; same trailer family). The run already derives `requiredTrailerType` / `hasHazardous` / `hasTemperatureLoad` from its parts (recalc, S5). So Q1 = a small **stop-to-run mixing check** surfaced live when a stop is dragged in, reusing that derivation + a compatibility matrix. Partly new (the matrix + the live hook).

**Q2 — direction / empty miles (`lib/geo.ts` `haversineKm`/`distanceMiles`, `lib/routing.ts` ORS matrix, planning 5 km clustering):** the geometry primitives exist and `checkRunService` already computes per-leg road distances. **What's missing:** a run-level *detour ratio* (actual routed distance vs sum of ideal point-to-point) and *deadhead/empty miles* (to first pickup, from last drop back to base), surfaced as an indicator. Mostly a small calc on top of existing leg data + a UI badge.

**Net:** none of the three needs a new engine. Q3 extends `checkRunService` output; Q1 adds a mixing matrix + live hook; Q2 adds a geometry calc + badge. All deterministic/explainable (no ML — consistent with the brief's "capture-now, recommend-later" staging).

---

## 2. Proposed design

**Extend the single `check-run` call** to return everything for a run in one round-trip (avoids 3 calls per lane):
```
{ feasibility: { severity, message },
  confidence: 0..100,            // Q3 — explainable score
  buffer:    { driveBufferPct, dwellPerStopMin, appliedSlackMin },
  geometry:  { routedKm, idealKm, detourRatio, deadheadKm },  // Q2
  compatibility: { ok, conflicts: [...] } }                    // Q1 (stop-mixing)
```
- **Q3 confidence + buffer:** apply a contingency buffer (default e.g. +15% drive time, + fixed dwell per stop) before the time-window checks; compute confidence by starting at 100 and deducting for tight/blown windows after buffer, missing coordinates, very long single legs, and zero slack. Explainable deductions, shown as "82% — tight delivery window at Leeds".
- **Q1 stop-mixing matrix:** temp must match (no mixing temp + ambient unless multi-temp), ADR not with food/enclosed bodies, oversized standalone, etc. Computed from the run's parts; live ✓/✗ + the specific conflict when a stop is added.
- **Q2 geometry:** `routedKm` (sum of ORS legs, already computed) vs `idealKm` (sum of direct haversine) → `detourRatio`; `deadheadKm` from base→first pickup and last drop→base. Badge: "12% detour · 28 mi empty".

**Web:** the planning run lane shows three compact signals (compat ✓/✗, detour/empty-miles, confidence %) instead of just the single AI dot; tooltips explain each.

---

## 3. Keep / Change / Delete

| File | Call | Why |
|---|---|---|
| `api/src/services/checkRunService.ts` | **CHANGE** | add confidence score + contingency buffer + geometry (detour/deadhead) + stop-mixing compatibility to the result. Reuse existing legs/ORS/window logic. |
| `api/src/routes/ai.ts` `/ai/check-run` | **CHANGE (small)** | pass through the richer result; accept buffer config if provided. |
| `api/src/lib/geo.ts` / `routing.ts` | **KEEP / reuse** | haversine + ORS already there. |
| S5 `runCompatibility` / `checkLoadVehicle` rule sets | **KEEP / reuse** | the body/temp/ADR sets feed the stop-mixing matrix. |
| `web/.../PlanningBoardPage.tsx` `RunLane` | **CHANGE** | render compat ✓/✗ + detour/empty-miles + confidence % (replace the single AI dot with three explainable signals). |
| `web/src/api/planning.ts` / `ai.ts` client types | **CHANGE (small)** | extend the check-run response type. |
| Schema / mobile | **KEEP** | no change. |
| Tests | **ADD** | `checkRunConfidence.test.ts` — buffer reduces confidence on tight windows; detour ratio math; stop-mixing conflicts (temp+ambient, ADR+food). Pure-function units where possible. |

**No schema change. No mobile change.**

---

## 4. Decisions I need before coding

**D-A2.1 — Confidence + buffer model (recommended: explainable deductions + default buffer).** Confidence starts at 100, deducts for: window blown after buffer (−big), window tight (−med), missing coords (−med), very long single leg (−small), zero slack (−small). Default buffer: +15% drive time, +20 min dwell/stop (later configurable per `PlanningSettings`). Alternative: simpler 3-band (green/amber/red) only — but the brief explicitly asks for a confidence *score*.

**D-A2.2 — Q1 stop-mixing rules (recommended: small matrix now).** Temp-match, ADR-not-with-food/enclosed, oversized-standalone, trailer-family match. Surfaced live on stop add with the specific conflict. Alternative: defer Q1 to A4 (split/consolidation) — but live "can these travel together?" is core to the brief.

**D-A2.3 — Q2 empty-miles definition (recommended: detour ratio + base deadhead).** `detourRatio = routedKm/idealKm`; `deadheadKm = base→first pickup + last drop→base`. Needs the company/base location — confirm we have a base postcode/coords (driver `basePostcode` exists; company base may need a field — flag if missing). Alternative: detour ratio only (skip deadhead) if no base location.

**D-A2.4 — One enriched `check-run` call (recommended: yes).** Return feasibility+confidence+geometry+compat together. Avoids 3 calls per lane. Alternative: separate endpoints (cleaner separation, more round-trips).

**D-A2.5 — Sub-slice order.** Q3 (confidence+buffer) is the brief's headline ("never only under perfect conditions") and the most valuable; Q1 is the most visible; Q2 is the smallest. Recommend **Q3 → Q1 → Q2**, each its own gate. Confirm or reorder.

**D-A2.6 — Owner.** Backend (`checkRunService`) + web display. I can do it directly or hand the web display to a Sonnet subagent after I build the backend. Your call.

---

## 5. Risk / scope notes

- **Base location for Q2 deadhead** — driver `basePostcode` exists; a *company* base may not. If absent, Q2 ships as detour-ratio-only until a base field is added (small follow-up).
- **ORS cost/latency** — `check-run` already calls ORS per lane on change; we're not adding calls, just enriching the response. Keep the existing debounce.
- **Don't over-block** — confidence/compat are *advisory* (brief: planner is decision-maker). Low confidence warns, never hard-blocks planning. Only Runs-screen publish enforces (S5 compat).
- **Parked (not A2):** proposal engine (A3), split/consolidation (A4), metrics capture (A5), per-company `PlanningSettings` for configurable buffers (later).
- **Exit gate (A2):** each run lane shows explainable compat ✓/✗, detour/empty-miles, and a confidence % that already bakes in a contingency buffer; pure-function tests for confidence/detour/mixing pass; typecheck/check:vocab green; web smoke clean on Mac.

---

## 6. Recommendation

Proceed **Q3 → Q1 → Q2** as three sub-gates; **D-A2.1** explainable confidence + default buffer; **D-A2.2** small mixing matrix; **D-A2.3** detour ratio + base deadhead (ratio-only if no company base); **D-A2.4** one enriched call. For **D-A2.6**, I'd build the `checkRunService` backend myself and optionally hand the run-lane display to a Sonnet subagent. Awaiting review before writing any code.
