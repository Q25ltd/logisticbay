# Planning — Load Feasibility Model (design)

> Expands the Planning check from "time + route + basic compatibility" into a real freight-feasibility engine: **can this load actually be carried, on this kind of transport, and is every delivery genuinely serviceable?**
> Triggered by a live bug: a run scored "100% / Compatible" while (a) two deliveries had NO collection and (b) 40 pallets were planned with no capacity check. Both must be caught.
> Date: 2026-06-20. Design + staged plan — no code yet.

---

## 1. The full set of questions a run must pass

Today we check 3 of these. The bug shows we're missing the rest.

| # | Question | Today | Gap |
|---|---|---|---|
| Q1 | Can the loads **travel together**? (temp / ADR / body family) | ✅ A2 mixing | extend with equipment (tail-lift, etc.) |
| Q2 | Does the **direction** make sense? (corridor, detour, empty miles) | ✅ A2 | — |
| Q3 | Can it be done **on time**? (drive hours, windows, buffer) | ✅ A2 | — |
| **Q4** | Is every **delivery serviceable** — is its load collected somewhere in the chain? | ❌ **none** | **the bug — mandatory** |
| **Q5** | Does it **physically fit** the transport? (pallet spaces, weight, dimensions) | partial (weight only, S5, Runs only) | **pallet/space capacity, stacking, decks, drawbar, dims** |

This document specifies Q4 (coverage) and Q5 (capacity/fit).

---

## 2. Q4 — Collection coverage (mandatory validity rule)

**Rule:** a load can only be delivered if it has been collected *somewhere* in its chain. Collection sources are:
- **direct from the customer** (a `collection`/`pickup` stop in the run, for the same job), OR
- **picked up from a yard / depot** (a `yard_pickup` / `hub_drop` waypoint — trailer swap, reload, relay buffer), OR
- **brought by a feeding run** (the run `dependsOnRunId` a prior run that collected it).

At some point before delivery, it MUST be collected. A delivery with none of the above is **invalid** — it must never score green and must block publish.

**Check (in `checkRunService`, needs each stop's `jobId`):** for every `delivery` stop, require either a `collection` stop earlier in the run for the same job, OR any yard/depot pickup waypoint in the run, OR a `dependsOnRunId` set. Otherwise emit a high-severity issue ("NHS Supply Chain delivery has no collection on this run") and force confidence low. (The reconciler/custody invariant 3 already blocks it at *execution* time — Q4 catches it at *planning* time so the planner sees it before publish.)

---

## 3. Q5 — Capacity / "can it fit this transport"

Several independent limits — a load must pass ALL of them:

### 3a. Pallet / floor-space capacity (the 40-pallet case)
- **Footprint needed** = stackable ? `ceil(pallets / 2)` : `pallets`. (2-high stacking halves floor spaces; `Job.stackable` exists.)
- **Trailer floor capacity** ≈ base spaces by length × `decks`:
  - standard 13.6 m artic curtain/box = **26** single-deck spaces;
  - double-deck (`decks = 2`) ≈ **2×** (≈ 45–52 depending on height);
  - drawbar / rigid+trailer = more total over two bodies;
  - 18 t rigid ≈ 16, 7.5 t ≈ 10, van ≈ 3–4 (indicative lookup by `trailerType`/`trailerLength`/`decks`).
- **Check:** footprint needed ≤ capacity. If not → "40 pallets won't fit a standard 26-pallet trailer — needs a double-deck or drawbar, or split the load." This is the missing check from the screenshot.

### 3a-bis. FLEET-AWARE capacity — "does THIS company have a vehicle that fits?"
Capacity is never against an ideal vehicle — it's against the company's **registered fleet** (`FleetTrailer` + `FleetUnit`). The engine computes the company's **max single-vehicle capacity**: the largest floor-space capacity available across its trailers (length × decks), including drawbar combos (truck body + trailer body = two bodies "in one go").
- If load footprint ≤ max available capacity → fits in one vehicle (advise which class: "needs a double-deck — you have 2").
- If load footprint > max available capacity → **no single vehicle in your fleet can carry this → split required.** Recommend the split count = `ceil(footprint / bestAvailableCapacity)`, and note the collection can still be a **single visit** but needs N trailers (collect-in-one-go, deliver/split across N), or a relay via yard.
- If the company owns the right class but all are `status != available` on that date → "double-decks exist but none available — split or reschedule."

This is what ties **capacity → split (A4)**: the system recommends splitting precisely when the fleet can't carry the load whole. Example: 40 non-stackable pallets, company owns only standard 26-pallet single-decks → footprint 40 > 26 → "split into 2 (26 + 14) — one collection, two trailers."

### 3b. Weight vs payload — already exists (S5)
- Sum stop weight vs vehicle category payload (`PAYLOAD_T`). (Per-vehicle plated payload is a later precision upgrade.)

### 3c. Dimensions / oversized
- `oversized`, `heightRestriction`, `lengthRestriction` on the load vs vehicle `heightM`/`lengthM`. Oversized → likely dedicated/abnormal-load vehicle.

### 3d. Loading metres (LDM) — for non-palletised / mixed
- Optional later: linear-metre capacity for freight not measured in pallets.

### 3e. Handling equipment
- `handlingMethods` (tail_lift, forklift, crane) vs vehicle equipment — a tail-lift-only site needs a tail-lift vehicle.

**Where it runs:** on **Planning** (vehicle not yet assigned) the capacity check is against the load's *requirement* — "this needs ≥ N pallet spaces / a double-deck / drawbar", advisory. On **Runs** (S5, vehicle assigned) it's a hard check against the *actual* trailer's capacity and blocks publish.

---

## 4. Data: what exists vs what's needed

**Have:** `Job.stackable`, `JobPart.numPallets`/`quantityRequired`+`quantityUnit`, `stopWeight`, `oversized`, `handlingMethods`, height/length restrictions; `FleetTrailer.decks`/`trailerLength`/`lengthM`/`heightM`; `FleetUnit.gvwClass`/`lengthM`; `Job.loadData` blob (mixed pallet types/dims).

**Need (small additions, mostly lookups not schema):**
- A **trailer pallet-capacity lookup** (by `trailerType`/`trailerLength`/`decks`) — a constant table, no schema change. *(Optionally a stored `FleetTrailer.palletCapacity` override later.)*
- A **fleet capacity profile per company** — derived at check time from its `FleetTrailer`/`FleetUnit` rows (max floor spaces available, by class, filtered by `status = available` for the date). No schema change; a query + the lookup table.
- Stop-level **pallet count** must be reliable — use `quantityUnit === "pallets"` ? `quantity` : `numPallets`. The `loadData` blob can refine mixed pallet types later.
- Per-vehicle **plated payload** for precise weight (deferred; category approximation works now).

**Where fleet-aware capacity runs:** it needs DB (the fleet), so the *route* loads the company's fleet capacity profile and passes it into the (still pure) capacity check — `checkRunService` stays DB-free; the planning route supplies `{ maxPalletCapacity, hasDoubleDeck, hasDrawbar, availableByClass }`.

---

## 5. Staged plan (each its own gate)

1. **Q4 — Collection coverage (FIRST, mandatory).** ✅ DONE (2026-06-20). `checkRunService` flags deliveries with no collection/pickup/feeder; confidence forced low; clear message. `jobId` per stop from the board. Result `coverage: { ok, uncovered[] }`; "Coverage ✗" lane signal.
2. **Q5a — Pallet/space capacity (FLEET-AWARE).** ✅ DONE (2026-06-21). `loadCapacity.ts`: footprint (stackable-aware) vs the company's **available**-fleet profile (`buildFleetCapacityProfile` from `FleetTrailer`, max floor spaces by length×decks, `status=available`). Over-capacity → `capacity.ok=false` + `splitInto` + reason; confidence drops; "Capacity ✗ … split into K" lane signal. The 40-pallet/no-double-deck case → split into 2. Injected by both `/ai/check-run` and `/planning/propose-runs`. Advisory on Planning. *Hard-on-Runs-publish (extend S5 against the assigned trailer) still TODO when the Runs screen is built.*
3. **Q5c/e — Dimensions + handling equipment** checks. *Medium. NEXT.*
4. **Q5d — Loading metres / mixed-pallet `loadData` parsing.** *Later, precision.*

All deterministic/explainable (no AI). Surface in the Planning card as a 5th signal ("Capacity") and fold coverage into "Planning check".

---

## 6. Decisions I need

**D1 — Build order (recommended: Q4 first, then Q5a).** Coverage is the live bug and a hard validity rule — do it now. Pallet capacity next (your 40-pallet case). Then dims/equipment.

**D2 — Trailer capacity source (recommended: a constant lookup now).** Map `trailerType`/`trailerLength`/`decks` → floor spaces in a shared table (no schema change). Add a stored per-trailer override later if needed.

**D3 — Planning = advisory, Runs = hard (recommended: yes).** On Planning, capacity/coverage warn + drop confidence but don't block (planner is deciding). On Runs publish, coverage and capacity are hard blocks (with the existing override for compatibility).

**D4 — Scope vs A4/A5.** This feasibility work is more important than A4 split / A5 metrics. Recommend: do Q4 + Q5a now (reopening A2 as "A2-hardening"), then return to A4/A5. Confirm.

**D5 — Owner.** Backend (`checkRunService` coverage + capacity, lookup table, tests) by me; the Planning "Capacity" signal + any Runs UI by a Sonnet subagent.

---

## 7. Recommendation

Proceed **Q4 coverage now** (fix the bug + hard validity rule), then **Q5a pallet/space capacity** (the 40-pallet case) using a trailer-capacity lookup, advisory on Planning + hard on Runs. Defer dims/equipment/LDM and A4/A5 behind those two. Awaiting your go on D1–D5.
