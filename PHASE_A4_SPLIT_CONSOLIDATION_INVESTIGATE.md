# Phase A / Slice A4 — Split + Consolidation — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Part E, Phase A slice A4 (old S9 split + S10 consolidation) + scenarios B5/B6. **Investigate only — no code written.**
> Date: 2026-06-20.

---

## 1. Key finding — the two halves are very different sizes

**Consolidation (B6) is ALREADY mostly built.** A run can already hold many assignments from different jobs; `recalculateDerivedRequirements` already computes the combined run requirements (`hasHazardous`, `hasTemperatureLoad`, `maxLoadWeight = sum`, `requiredTrailerType`); S5 already checks combined weight vs vehicle payload + body compatibility; A2 surfaces the mixing check; A3 *proposes* groupage. So consolidating compatible jobs onto one run works today. What's missing is small: a **combined-load summary** on the run (total weight/qty vs the vehicle target, mixed-goods advisory) so the planner can see the consolidated picture at a glance.

**Split (B5) is the real new work.** The schema supports it partially — `RunAssignment.quantityAssigned` exists and the add-stop endpoints accept a `quantityAssigned` — but:
- A jobPart can only be in **one** active run today (the `/planning/unplanned` filter excludes any part already in an active assignment), so a load **cannot** currently be divided across two runs.
- There is **no conservation check** (sum of `quantityAssigned` across a part's assignments vs the part total).
- The `split` custody transaction type exists in `loadVocab` but is **never written** (grep-confirmed) — splitting isn't wired to the custody ledger.

So split = a genuine multi-assignment-per-part feature with conservation + custody, touching the unplanned filter, assignment creation, validation, and `applyJobEvent`.

---

## 2. Proposed design

**Consolidation (small):**
- Add a read-only **combined-load summary** to the run lane: total weight + quantity across assignments vs the run's required vehicle target; reuse the A2 mixing check for a combined advisory. No new write path — multi-assignment already works. (Largely a UI surface + maybe a tiny `/planning/runs` response field.)

**Split (the engine):**
- Allow a jobPart to be assigned to **multiple** active runs, each with a portion (`quantityAssigned`).
- **Conservation (invariant 2):** the sum of a part's active `quantityAssigned` must be ≤ the part total; assigning the last portion completes it. Block over-assignment.
- **Unplanned filter:** a partially-split part keeps showing its *remaining* quantity until fully assigned (instead of disappearing on first assignment).
- **Custody:** record a `split` LoadTrack row when the planner divides a load (audit of the division); at collect, each run records its own portion (S2 already threads `actualQuantity`). 
- **Reconciler:** already custody-aware (S6); a split job completes only when all portions reach `customer_dest`.

---

## 3. Keep / Change / Delete (high level)

| Area | Consolidation | Split |
|---|---|---|
| `recalculateDerivedRequirements` / S5 combined checks | **KEEP** (already combined) | KEEP |
| `/planning/unplanned` filter | KEEP | **CHANGE** — show remaining qty for partially-split parts |
| add-stop endpoints (`/runs` + `/planning/runs`) | KEEP | **CHANGE** — allow multiple assignments per part + conservation guard |
| `loadVocab` `split` transaction | — | **CONSUME** — write `split` custody on division |
| `applyJobEvent` | KEEP | minor — per-portion quantity already threaded (S2) |
| web run lane | **CHANGE (small)** — combined-load summary | **CHANGE** — quantity-per-assignment input + remaining-balance UI |
| Tests | small | `splitLoad.test.ts` — conservation, multi-run-per-part, custody |

**No schema change** (quantity fields exist). No mobile change.

---

## 4. Decisions I need before coding

**D-A4.1 — Scope/sequence (recommended: consolidation summary now, split as its own gate).** Ship the small consolidation summary first (low risk, mostly verifies existing), then tackle split as a separate, larger slice. Alternative: do both together (bigger gate), or defer split entirely for now.

**D-A4.2 — Split: how does the planner divide a load? (recommended: quantity-per-assignment on add).** When adding a part to a run, the planner enters a quantity (default = remaining); the part stays available with the remaining balance until fully assigned. Alternative: a dedicated "split load" modal (more explicit, more UI).

**D-A4.3 — Conservation enforcement (recommended: block over-assignment).** Sum of active `quantityAssigned` ≤ part total, enforced server-side (invariant 2). Under-assignment (partial planning) is allowed and shown as remaining.

**D-A4.4 — `split` custody row (recommended: yes, at division time).** Write a `split` LoadTrack row when the planner divides, for the audit trail; per-portion collect/deliver custody then proceeds as normal (S2). Alternative: skip the explicit split row and rely on the per-portion collect rows (simpler, less audit detail).

**D-A4.5 — Owner.** Backend (filter + conservation + custody + tests) by me; the run-lane UI (quantity input, remaining balance, combined summary) by a Sonnet subagent. Your call.

---

## 5. Risk / scope notes

- **Split touches the unplanned filter + assignment uniqueness assumptions** — the riskiest change in Phase A so far (multiple endpoints assume one-run-per-part). Needs careful tests.
- **`RunAssignment` has `@@unique([runId, sequenceNumber])`** but not part-uniqueness, so multiple assignments per part across runs is schema-allowed — good.
- **Consolidation is low-risk** — it's surfacing what already works.
- **Parked (not A4):** A5 metrics capture; hub/relay auto-proposal; VRP optimisation.
- **Exit gate (A4):** consolidation summary shows combined weight/compat on a multi-job run; split lets a load be divided across runs with conservation enforced and a `split` custody row, completing only when all portions deliver; pure + DB tests pass; typecheck/check:vocab green.

---

## 6. Recommendation

Given split's risk and size, I recommend **D-A4.1 = consolidation summary first (small gate), then split as its own slice**; D-A4.2 quantity-per-assignment; D-A4.3 block over-assignment; D-A4.4 write the `split` custody row; D-A4.5 backend me + Sonnet UI. If you'd rather defer split and treat consolidation-summary as "A4 done" for now (moving to A5 metrics), that's a reasonable call too — tell me which. Awaiting review before any code.
