# Step 5 — Vehicle Assignment + Real Compatibility — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Step 5 + audit 🟠 #2, #3. **Investigate only — no code written.** For review before implementation.
> Goal: validate the truck/trailer actually assigned, and **compute** `trailerCompatible`/`vehicleCompatible` so the publish compatibility gate stops being a no-op.
> Date: 2026-06-07.

---

## 1. What I read — and a useful surprise

**The UI mostly already exists** (the audit's "no truck/trailer picker" is outdated):
- `PlanningBoardPage.tsx` has a trailer `<select>` (≈909) and truck `<select>` (≈1441), both wired to `patch({ assignedTrailerId / assignedTruckId })`, plus a `CapacityBar`.
- `RunDetailPage.tsx` has truck/trailer `<select>`s (≈481, 531) **and already renders the compatibility indicator** `run.trailerCompatible ? ✓ : ✗` (≈676). It just always shows ✓ because the flag is never computed false.

So Step 5 is **mostly backend**. The real gaps:

1. **Compatibility flags are never computed.** `trailerCompatible`/`vehicleCompatible` default `true` and nothing ever sets them. The publish gate in `runs.ts:395` reads them (always true → no-op). Audit 🟠 #2.
2. **No FK validation on assignment.** `PATCH /runs/:id` (`runs.ts:292`), `PATCH /planning/runs/:id` (`planning.ts:376`), and `POST /runs` (`runs.ts:181`) write `assignedTruckId`/`assignedTrailerId` with **no** check that the vehicle exists, belongs to the company, or is available. Audit 🟠 #3.
3. **Two duplicate requirement calculators.** `recalculateDerivedRequirements` (`runs.ts:28`, called on assignment add/remove) and an inline copy in `planning.ts:947`. Both compute `requiredTrailerType / hasHazardous / hasTemperatureLoad / maxLoadWeight`; **neither** computes the compat flags.
4. **Publish enforcement is inconsistent.** `runs.ts` publish blocks on `!trailerCompatible || !vehicleCompatible` (with override); `planning.ts` publish (`:549`) does **not** check compatibility at all.

**Reusable rule engine already exists:** `services/checkLoadVehicleService.ts` `checkLoadVehicle()` — deterministic load↔vehicle rules (payload by category via `PAYLOAD_T`, fridge bodies, ADR-unsafe bodies, livestock). Returns `{concern, severity}`. We map a run's requirements + the assigned vehicle into it and treat `severity === "high"` as incompatible.

**Schema note:** `FleetUnit` has `vehicleClass`/`gvwClass`/`axleLoadT`; `FleetTrailer` has `bodyType`/`trailerType`/`axleLoadT`. There is **no explicit per-vehicle payload-tonnes field** — weight compatibility must use the category-based `PAYLOAD_T` approximation (same as today's advisory check).

---

## 2. Proposed design

A shared helper `computeRunCompatibility(trailer, truck, requirements) → { trailerCompatible, vehicleCompatible }`:
- **trailerCompatible:** if `requiredTrailerType === "temperature_controlled"` and the trailer's `bodyType` ∉ fridge bodies → false; if `hasHazardous` and trailer body ∈ ADR-unsafe → false; if no trailer assigned → leave `true` (planner may assign later — matches the "trailer optional" decision in PLANNING_BOARD 1.6). Reuse `checkLoadVehicle` body rules.
- **vehicleCompatible:** `maxLoadWeight` vs the truck's category `PAYLOAD_T` (high severity → false). No truck assigned → `true`.
- Called wherever requirements are recalculated **and** whenever `assignedTruckId`/`assignedTrailerId` changes.

FK validation helper `validateFleetAssignment(tx, companyId, truckId, trailerId)`: each provided id must exist + match `companyId` (404/400 if not). Status check → warning, not hard block.

---

## 3. Keep / Change / Delete

| File | Call | Why |
|---|---|---|
| `services/checkLoadVehicleService.ts` | **KEEP / reuse** | the rule engine (`PAYLOAD_T`, fridge/ADR sets, `checkLoadVehicle`). |
| **new** `lib/runCompatibility.ts` | **ADD** | `computeRunCompatibility()` + `validateFleetAssignment()` — single source, used by both run systems. |
| `routes/runs.ts` `recalculateDerivedRequirements` | **CHANGE** | after computing requirements, compute + persist the compat flags. |
| `routes/planning.ts` requirements calc (`:947`) | **CHANGE** | same (call the shared helper) — so planning assignment changes also set compat. |
| `routes/runs.ts` PATCH/POST + `routes/planning.ts` PATCH | **CHANGE** | validate truck/trailer FK on assign; recompute compat when vehicle changes. |
| `routes/planning.ts` publish (`:549`) | **CHANGE** | enforce compat (block unless `compatibilityOverridden`), matching `runs.ts` publish. |
| `PlanningBoardPage.tsx` | **CHANGE (small)** | surface the compat result / publish-block reason (RunDetailPage already shows ✓/✗). |
| `runs.ts` publish gate, `RunDetailPage` compat indicator, both pickers | **KEEP** | already correct — they just need the flags to become real. |
| Tests | **ADD** | `runCompatibility.test.ts`: fridge load on dry trailer → `trailerCompatible=false` + publish blocked; override → publish allowed; overweight → `vehicleCompatible=false`; assigning a non-existent/other-company vehicle → rejected. |

**Deletions: none.** No schema change. No mobile change. (Full consolidation of the two requirement calculators / two run systems stays Step 16.)

---

## 4. Decisions I need before coding

**D5.1 — FK validation scope (recommended: validate existence + companyId on all three write paths; status = warning).** Reject an `assignedTruckId`/`assignedTrailerId` that doesn't exist or belongs to another tenant. If the vehicle exists but isn't `available`, warn (don't block) — the planner may be pre-assigning.

**D5.2 — Compatibility engine (recommended: reuse `checkLoadVehicle`).** Map run requirements → its inputs; `severity === "high"` ⇒ incompatible. Avoids a parallel rule set.

**D5.3 — Enforce compat at planning publish too (recommended: yes).** Make `planning.ts` publish block on incompatibility (with the existing `compatibilityOverridden` escape), matching `runs.ts`. Otherwise the primary planner surface can publish a fridge load on a flatbed.

**D5.4 — Weight precision (recommended: category `PAYLOAD_T` approximation).** No per-vehicle payload field exists; reuse the existing approximation. Log "add `FleetUnit.maxPayloadT`/`FleetTrailer.maxPayloadT` for precise checks" as a deferred schema follow-up.

**D5.5 — Double-booking guard (recommended: defer).** Warning if the same truck/trailer is on another active run that day (mirrors the driver-conflict warning). Useful but not required for "compat is real"; recommend deferring to keep Step 5 focused. Alternative: include as a warning now.

**D5.6 — Implementation owner.** This step is now backend-weighted (pickers exist), but still spans API + a small web change. Per our hybrid mode: I can implement it directly, or hand the implementation to a **Sonnet subagent** with this report as the spec while I review against the gate. Your call.

---

## 5. Risk / scope notes

- **Two run systems:** Step 5 touches both (`/runs` + `/planning/runs`) via the shared helper, but does **not** consolidate them (Step 16). Each keeps its own requirements call site; both call the new helper.
- **Trailer-optional:** compat stays `true` when no trailer is assigned (planner assigns later) — consistent with PLANNING_BOARD 1.6.
- **Parked (not Step 5):** yard/swap/handover/split (S6+), per-vehicle payload schema field, double-booking block, run-system consolidation (S16), notifications (S14).
- **Exit gate (S5):** assigning a fridge-required load to a dry trailer sets `trailerCompatible=false` and **blocks publish on both surfaces** unless overridden with reason; assigning a non-existent/other-tenant vehicle is rejected; typecheck/check:vocab/api-tests green (DB tests on Mac).

---

## 6. Recommendation

Proceed with **D5.1 validate existence+companyId (status=warn); D5.2 reuse checkLoadVehicle; D5.3 enforce planning publish; D5.4 PAYLOAD_T approximation; D5.5 defer double-booking**. For D5.6, I'd suggest I implement it directly given the manageable backend scope — but happy to delegate to a Sonnet subagent if you prefer. Awaiting review before writing any code.
